-- US · phase (c): perspectives on memories (with simultaneous reveal) and
-- "我看见的你" seen notes.
--
-- Reveal rule, enforced here and not in the UI: I can read someone else's
-- perspective on a memory only after I have either written my own or chosen
-- "跳过，直接看" — i.e. a reveal_states row exists for (memory, me). Private
-- perspectives ("只给自己看") are readable by their author only, always.

create type public.reveal_reason as enum ('wrote', 'skipped');

create table public.perspectives (
  id                uuid primary key default gen_random_uuid(),
  memory_id         uuid not null references public.memories (id) on delete cascade,
  us_id             uuid not null references public.us_spaces (id) on delete cascade,
  author_id         uuid default auth.uid() references public.profiles (id) on delete cascade,
  body              text not null default '' check (char_length(body) <= 10000),
  is_private        boolean not null default false,
  audio_path        text unique,
  audio_mime        text check (char_length(audio_mime) <= 100),
  audio_duration_ms integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (memory_id, author_id),
  check (char_length(body) > 0 or audio_path is not null)
);
create index perspectives_memory_idx on public.perspectives (memory_id);

create table public.reveal_states (
  memory_id  uuid not null references public.memories (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason     public.reveal_reason not null default 'skipped',
  created_at timestamptz not null default now(),
  primary key (memory_id, user_id)
);

create table public.seen_notes (
  id         uuid primary key default gen_random_uuid(),
  us_id      uuid not null references public.us_spaces (id) on delete cascade,
  from_id    uuid default auth.uid() references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);
create index seen_notes_to_idx on public.seen_notes (to_id, created_at desc);
create index seen_notes_from_idx on public.seen_notes (from_id, created_at desc);

-- The recipient's quiet collection. Separate table so the author can never
-- tell whether their note was kept.
create table public.seen_note_keeps (
  note_id uuid not null references public.seen_notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kept_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.can_access_memory(p_memory uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memories m
    where m.id = p_memory and private.is_active_member(m.us_id)
  );
$$;

create function private.has_revealed(p_memory uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reveal_states r
    where r.memory_id = p_memory and r.user_id = auth.uid()
  );
$$;

create function private.is_member_of(p_us uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.us_members m
    where m.us_id = p_us and m.user_id = p_user and m.left_at is null
  );
$$;

-- An object in the media bucket that I uploaded myself.
create function private.owns_object(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from storage.objects o
    where o.bucket_id = 'media' and o.name = p_name and o.owner_id = auth.uid()::text
  );
$$;

revoke all on function private.can_access_memory(uuid), private.has_revealed(uuid),
  private.is_member_of(uuid, uuid), private.owns_object(text) from public;
grant execute on function private.can_access_memory(uuid), private.has_revealed(uuid),
  private.is_member_of(uuid, uuid), private.owns_object(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.perspective_fill()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select m.us_id into new.us_id from public.memories m where m.id = new.memory_id;
  return new;
end;
$$;
revoke all on function private.perspective_fill() from public;

create trigger perspectives_fill before insert on public.perspectives
  for each row execute function private.perspective_fill();
create trigger perspectives_touch before update on public.perspectives
  for each row execute function private.touch_updated_at();

-- Writing my version is what unlocks everyone else's.
create function private.perspective_reveal()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.reveal_states (memory_id, user_id, reason)
  values (new.memory_id, new.author_id, 'wrote')
  on conflict (memory_id, user_id) do update set reason = 'wrote';
  return new;
end;
$$;
revoke all on function private.perspective_reveal() from public;

create trigger perspectives_reveal after insert on public.perspectives
  for each row execute function private.perspective_reveal();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.perspectives    enable row level security;
alter table public.reveal_states   enable row level security;
alter table public.seen_notes      enable row level security;
alter table public.seen_note_keeps enable row level security;

create policy "perspectives: mine, or others' after I reveal" on public.perspectives
  for select to authenticated
  using (
    author_id = auth.uid()
    or (not is_private and private.is_active_member(us_id) and private.has_revealed(memory_id))
  );

create policy "perspectives: write my own while open" on public.perspectives
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and private.is_active_member(us_id)
    and private.us_is_open(us_id)
    and (audio_path is null
         or (audio_path like us_id::text || '/' || memory_id::text || '/p/%'
             and private.owns_object(audio_path)))
  );

create policy "perspectives: edit my own while open" on public.perspectives
  for update to authenticated
  using (author_id = auth.uid() and private.is_active_member(us_id) and private.us_is_open(us_id))
  with check (
    author_id = auth.uid()
    and (audio_path is null
         or (audio_path like us_id::text || '/' || memory_id::text || '/p/%'
             and private.owns_object(audio_path)))
  );

create policy "perspectives: delete my own while open" on public.perspectives
  for delete to authenticated
  using (author_id = auth.uid() and private.is_active_member(us_id) and private.us_is_open(us_id));

create policy "reveal_states: only mine" on public.reveal_states
  for select to authenticated using (user_id = auth.uid());

-- "跳过，直接看" — allowed even when the US is closed (it adds no content).
create policy "reveal_states: reveal for myself" on public.reveal_states
  for insert to authenticated
  with check (user_id = auth.uid() and private.can_access_memory(memory_id));

create policy "seen_notes: only the two of us" on public.seen_notes
  for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());

create policy "seen_notes: write to a fellow member while open" on public.seen_notes
  for insert to authenticated
  with check (
    from_id = auth.uid()
    and to_id <> auth.uid()
    and private.is_active_member(us_id)
    and private.is_member_of(us_id, to_id)
    and private.us_is_open(us_id)
  );

create policy "seen_notes: author takes back while open" on public.seen_notes
  for delete to authenticated
  using (from_id = auth.uid() and private.us_is_open(us_id));

create policy "seen_note_keeps: only the recipient" on public.seen_note_keeps
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.seen_notes n where n.id = note_id and n.to_id = auth.uid())
  );

revoke all on public.perspectives, public.reveal_states, public.seen_notes, public.seen_note_keeps
  from anon, authenticated;
grant select, delete on public.perspectives to authenticated;
grant insert (memory_id, body, is_private, audio_path, audio_mime, audio_duration_ms)
  on public.perspectives to authenticated;
grant update (body, is_private, audio_path, audio_mime, audio_duration_ms)
  on public.perspectives to authenticated;
grant select on public.reveal_states to authenticated;
grant insert (memory_id) on public.reveal_states to authenticated;
grant select, delete on public.seen_notes to authenticated;
grant insert (us_id, to_id, body) on public.seen_notes to authenticated;
grant select, delete on public.seen_note_keeps to authenticated;
grant insert (note_id) on public.seen_note_keeps to authenticated;

-- ---------------------------------------------------------------------------
-- Memories with others' words keep a shell when their author removes them
-- ---------------------------------------------------------------------------

create or replace function private.memory_has_others_content(p_memory uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.perspectives p
    join public.memories m on m.id = p.memory_id
    where p.memory_id = p_memory and p.author_id is distinct from m.author_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Storage: perspective voice clips live at {us}/{memory}/p/{file}
-- ---------------------------------------------------------------------------

create or replace function private.storage_upload_allowed(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_n     int := coalesce(array_length(v_parts, 1), 0);
  v_us    uuid;
  v_mem   uuid;
begin
  if v_n not in (3, 4) or v_parts[v_n] = '' then
    return false;
  end if;
  begin
    v_us := v_parts[1]::uuid;
    v_mem := v_parts[2]::uuid;
  exception when others then
    return false;
  end;
  if not (private.is_active_member(v_us) and private.us_is_open(v_us)) then
    return false;
  end if;

  if v_n = 3 then
    -- memory attachment: only the memory's author
    return exists (
      select 1 from public.memories m
      where m.id = v_mem and m.us_id = v_us and m.author_id = auth.uid() and not m.author_removed
    );
  end if;

  -- perspective voice clip: any current member, on a memory of this US
  return v_parts[3] = 'p'
     and exists (select 1 from public.memories m where m.id = v_mem and m.us_id = v_us);
end;
$$;

create or replace function private.storage_read_allowed(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memory_media mm
    where mm.storage_path = p_name
      and (private.is_active_member(mm.us_id) or mm.author_id = auth.uid())
  )
  or exists (
    -- same rule as reading the perspective itself
    select 1 from public.perspectives p
    where p.audio_path = p_name
      and (p.author_id = auth.uid()
           or (not p.is_private and private.is_active_member(p.us_id) and private.has_revealed(p.memory_id)))
  );
$$;
