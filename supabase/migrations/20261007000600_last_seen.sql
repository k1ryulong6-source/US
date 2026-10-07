-- Wet marks that only you see.
--
-- What others added since you last came by is still wet when you arrive; next time it
-- has dried. When you last came by is yours alone: nobody can read it, not even you
-- directly, so it can never become "seen" receipts. It only answers "what's new for me".

create table public.us_last_seen (
  us_id   uuid not null references public.us_spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (us_id, user_id)
);

alter table public.us_last_seen enable row level security;
revoke all on public.us_last_seen from anon, authenticated;

-- Memories (and other people's shared versions of memories) that are new to me since
-- my last visit; and from now on, I have been here. The first visit marks nothing.
create function public.visit_us(p_us uuid)
returns uuid[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_user  uuid := private.require_user();
  v_since timestamptz;
  v_fresh uuid[] := '{}';
begin
  perform private.require_member(p_us);
  select seen_at into v_since from public.us_last_seen where us_id = p_us and user_id = v_user;
  if v_since is not null then
    select coalesce(array_agg(distinct x.id), '{}') into v_fresh from (
      select m.id from public.memories m
      where m.us_id = p_us and m.created_at > v_since
        and m.author_id is distinct from v_user and not m.author_removed
      union
      select p.memory_id from public.perspectives p
      where p.us_id = p_us and p.created_at > v_since
        and p.author_id is distinct from v_user and not p.is_private
    ) x;
  end if;
  insert into public.us_last_seen (us_id, user_id, seen_at) values (p_us, v_user, now())
  on conflict (us_id, user_id) do update set seen_at = excluded.seen_at;
  return v_fresh;
end;
$$;

-- For the home page: which of my US have something new for me, without marking a visit.
create function public.us_with_news()
returns setof uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
begin
  return query
  select s.us_id from public.us_last_seen s
  join public.us_members mb on mb.us_id = s.us_id and mb.user_id = v_user and mb.left_at is null
  where s.user_id = v_user
    and (
      exists (
        select 1 from public.memories m
        where m.us_id = s.us_id and m.created_at > s.seen_at
          and m.author_id is distinct from v_user and not m.author_removed
      )
      or exists (
        select 1 from public.perspectives p
        where p.us_id = s.us_id and p.created_at > s.seen_at
          and p.author_id is distinct from v_user and not p.is_private
      )
    );
end;
$$;

revoke all on function public.visit_us(uuid), public.us_with_news() from public, anon;
grant execute on function public.visit_us(uuid), public.us_with_news() to authenticated;
