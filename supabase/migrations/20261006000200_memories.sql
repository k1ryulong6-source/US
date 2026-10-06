-- US · phase (b): memories and their media (photos, voice).
--
-- Media files live in a private Storage bucket under
--   media/{us_id}/{memory_id}/{random}.{ext}
-- and are only ever served through short-lived signed URLs. A file is
-- readable only while a memory_media row points at it and the reader is a
-- current member of that US (or the person who uploaded it).

create type public.date_precision as enum ('day', 'month', 'year');
create type public.media_kind as enum ('image', 'audio');

create table public.memories (
  id                 uuid primary key default gen_random_uuid(),
  us_id              uuid not null references public.us_spaces (id) on delete cascade,
  author_id          uuid default auth.uid() references public.profiles (id) on delete set null,
  body               text not null default '' check (char_length(body) <= 10000),
  happened_on        date not null default current_date,
  happened_precision public.date_precision not null default 'day',
  place              text not null default '' check (char_length(place) <= 120),
  -- The author left (or deleted it) and took their words with them, but other
  -- people's perspectives hang off this memory, so an empty shell remains.
  author_removed     boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index memories_us_idx on public.memories (us_id, happened_on desc, created_at desc);

create table public.memory_media (
  id           uuid primary key default gen_random_uuid(),
  memory_id    uuid not null references public.memories (id) on delete cascade,
  us_id        uuid not null references public.us_spaces (id) on delete cascade,
  author_id    uuid default auth.uid() references public.profiles (id) on delete set null,
  kind         public.media_kind not null,
  storage_path text not null unique,
  mime         text not null check (char_length(mime) <= 100),
  width        integer,
  height       integer,
  duration_ms  integer,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index memory_media_memory_idx on public.memory_media (memory_id, position);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger memories_touch before update on public.memories
  for each row execute function private.touch_updated_at();

-- us_id is copied from the parent memory, never trusted from the client.
create function private.memory_media_fill()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select m.us_id into new.us_id from public.memories m where m.id = new.memory_id;
  if (select count(*) from public.memory_media where memory_id = new.memory_id) >= 12 then
    raise exception 'too many attachments' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.memory_media_fill() from public;

create trigger memory_media_fill before insert on public.memory_media
  for each row execute function private.memory_media_fill();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.memories     enable row level security;
alter table public.memory_media enable row level security;

create policy "memories: members read, authors keep theirs" on public.memories
  for select to authenticated
  using (private.is_active_member(us_id) or author_id = auth.uid());

create policy "memories: members add while open" on public.memories
  for insert to authenticated
  with check (author_id = auth.uid() and private.is_active_member(us_id) and private.us_is_open(us_id));

create policy "memories: authors edit while open" on public.memories
  for update to authenticated
  using (author_id = auth.uid() and not author_removed
         and private.is_active_member(us_id) and private.us_is_open(us_id))
  with check (author_id = auth.uid() and private.is_active_member(us_id) and private.us_is_open(us_id));

create policy "memory_media: members read, authors keep theirs" on public.memory_media
  for select to authenticated
  using (private.is_active_member(us_id) or author_id = auth.uid());

create policy "memory_media: memory author attaches" on public.memory_media
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and private.is_active_member(us_id)
    and private.us_is_open(us_id)
    and exists (
      select 1 from public.memories m
      where m.id = memory_id and m.author_id = auth.uid() and not m.author_removed
    )
    and storage_path like us_id::text || '/' || memory_id::text || '/%'
  );

create policy "memory_media: author removes while open" on public.memory_media
  for delete to authenticated
  using (author_id = auth.uid() and private.is_active_member(us_id) and private.us_is_open(us_id));

revoke all on public.memories, public.memory_media from anon, authenticated;
grant select on public.memories, public.memory_media to authenticated;
grant insert (us_id, body, happened_on, happened_precision, place) on public.memories to authenticated;
grant update (body, happened_on, happened_precision, place) on public.memories to authenticated;
grant insert (memory_id, kind, storage_path, mime, width, height, duration_ms, position)
  on public.memory_media to authenticated;
grant delete on public.memory_media to authenticated;

-- ---------------------------------------------------------------------------
-- Deleting a memory
-- ---------------------------------------------------------------------------

-- Does anyone other than the author have content attached to this memory?
-- (Redefined once perspectives exist.)
create function private.memory_has_others_content(p_memory uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select false; $$;
revoke all on function private.memory_has_others_content(uuid) from public;

-- Removes a memory's own content. If others have written on it, keep an
-- empty shell so their words survive. Returns the storage paths the client
-- should now delete from the bucket (they are unreadable either way).
create function private.remove_memory(p_memory uuid)
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_paths text[];
begin
  with gone as (
    delete from public.memory_media where memory_id = p_memory returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_paths from gone;

  if private.memory_has_others_content(p_memory) then
    update public.memories
    set body = '', place = '', author_removed = true
    where id = p_memory;
  else
    delete from public.memories where id = p_memory;
  end if;

  return v_paths;
end;
$$;
revoke all on function private.remove_memory(uuid) from public;

create function public.delete_memory(p_memory uuid)
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_m public.memories%rowtype;
begin
  perform private.require_user();
  select * into v_m from public.memories where id = p_memory;
  if not found or v_m.author_id is distinct from auth.uid() or v_m.author_removed then
    raise exception 'memory not found' using errcode = 'P0002';
  end if;
  perform private.require_member(v_m.us_id);
  perform private.require_open(v_m.us_id);
  return private.remove_memory(p_memory);
end;
$$;

revoke all on function public.delete_memory(uuid) from public, anon;
grant execute on function public.delete_memory(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 20 * 1024 * 1024,
  array['image/jpeg', 'image/webp', 'image/png',
        'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/mpeg', 'audio/webm', 'audio/ogg']
)
on conflict (id) do nothing;

-- Upload allowed only into {us}/{memory}/ for a memory I wrote, in a US I'm
-- currently in, while it is open.
create function private.storage_upload_allowed(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_us    uuid;
  v_mem   uuid;
begin
  if array_length(v_parts, 1) <> 3 or v_parts[3] = '' then
    return false;
  end if;
  begin
    v_us := v_parts[1]::uuid;
    v_mem := v_parts[2]::uuid;
  exception when others then
    return false;
  end;
  return private.is_active_member(v_us)
     and private.us_is_open(v_us)
     and exists (
       select 1 from public.memories m
       where m.id = v_mem and m.us_id = v_us and m.author_id = auth.uid() and not m.author_removed
     );
end;
$$;

-- Read allowed only for files an existing memory_media row points at.
create function private.storage_read_allowed(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memory_media mm
    where mm.storage_path = p_name
      and (private.is_active_member(mm.us_id) or mm.author_id = auth.uid())
  );
$$;

revoke all on function private.storage_upload_allowed(text), private.storage_read_allowed(text) from public;
grant execute on function private.storage_upload_allowed(text), private.storage_read_allowed(text)
  to authenticated;

-- Uploaders can always see their own files, so the Storage API can delete
-- them after the memory_media row is gone (it only deletes what it can read).
create policy "media: read via memory_media" on storage.objects
  for select to authenticated
  using (bucket_id = 'media'
         and (private.storage_read_allowed(name) or owner_id = auth.uid()::text));

create policy "media: upload into my memory" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and private.storage_upload_allowed(name));

create policy "media: delete my own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and owner_id = auth.uid()::text);
