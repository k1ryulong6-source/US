-- US · phase (e): leaving with "带走我的内容", and the optional weekly
-- Web Push reminder.

-- ---------------------------------------------------------------------------
-- Leaving: remove only the leaver's own content, never anyone else's.
-- Allowed even when the US is closed: safety beats continuity.
-- ---------------------------------------------------------------------------

-- leave_us depends on it, so replace both
drop function public.leave_us(uuid, public.leave_mode);
drop function private.remove_member_content(uuid, uuid);

create function private.remove_member_content(p_us uuid, p_user uuid)
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_paths text[] := '{}';
  v_mem   uuid;
begin
  -- my memories: deleted, or emptied to a shell if others wrote on them
  for v_mem in select id from public.memories where us_id = p_us and author_id = p_user loop
    v_paths := v_paths || private.remove_memory(v_mem);
  end loop;

  -- my perspectives (and their voice clips)
  with gone as (
    delete from public.perspectives where us_id = p_us and author_id = p_user returning audio_path
  )
  select v_paths || coalesce(array_agg(audio_path) filter (where audio_path is not null), '{}')
  into v_paths from gone;

  -- notes I wrote; notes written *to* me belong to their authors and stay
  delete from public.seen_notes where us_id = p_us and from_id = p_user;

  -- my intentions, private and shared
  delete from public.intentions where us_id = p_us and author_id = p_user;

  return v_paths;
end;
$$;
revoke all on function private.remove_member_content(uuid, uuid) from public;

-- Returns storage paths the client should delete from the bucket (only when
-- p_mode = 'remove'; the files are unreadable to others either way).
create function public.leave_us(p_us uuid, p_mode public.leave_mode default 'keep')
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_user  uuid := private.require_user();
  v_pid   uuid;
  v_paths text[] := '{}';
begin
  perform private.require_member(p_us);

  update public.us_members set left_at = now(), left_mode = p_mode
  where us_id = p_us and user_id = v_user;

  delete from public.my_us_prefs where us_id = p_us and user_id = v_user;

  -- Links I handed out should not outlive my membership.
  update public.invitations set revoked_at = now()
  where us_id = p_us and created_by = v_user and used_at is null and revoked_at is null;

  update public.proposals set status = 'withdrawn', resolved_at = now()
  where us_id = p_us and proposed_by = v_user and status = 'pending';

  if p_mode = 'remove' then
    v_paths := private.remove_member_content(p_us, v_user);
  end if;

  -- With one fewer member, some pending proposals may now be unanimous.
  for v_pid in select id from public.proposals where us_id = p_us and status = 'pending' loop
    perform private.try_apply_proposal(v_pid);
  end loop;

  return v_paths;
end;
$$;

revoke all on function public.leave_us(uuid, public.leave_mode) from public, anon;
grant execute on function public.leave_us(uuid, public.leave_mode) to authenticated;

-- ---------------------------------------------------------------------------
-- Weekly reminder (opt-in, at most once a week, never a follow-up)
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint       text not null unique check (endpoint like 'https://%'),
  p256dh         text not null,
  auth           text not null,
  weekday        smallint not null default 0 check (weekday between 0 and 6),  -- 0 = Sunday
  hour           smallint not null default 20 check (hour between 0 and 23),
  tz             text not null default 'Asia/Shanghai' check (char_length(tz) <= 64),
  last_sent_week integer,
  created_at     timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: only mine" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (endpoint, p256dh, auth, weekday, hour, tz) on public.push_subscriptions to authenticated;
grant update (p256dh, auth, weekday, hour, tz) on public.push_subscriptions to authenticated;
