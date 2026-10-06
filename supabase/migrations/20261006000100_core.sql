-- US · phase (a): profiles, US spaces, members, personal prefs, invitations,
-- proposals and relationship history.
--
-- Security model in one sentence: a user can only see or touch a row if they
-- are a *current* member of its us_id, checked against us_members in the
-- database. Structural changes (joining, leaving, renaming, closing...) only
-- happen through the security-definer functions below; there are no direct
-- INSERT/UPDATE/DELETE grants on those tables.

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------

-- Internal helpers live outside `public` so PostgREST does not expose them.
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.us_state as enum ('active', 'quiet', 'closed');
create type public.us_preset as enum ('family', 'partners', 'friends', 'work', 'other');
create type public.proposal_kind as enum ('rename', 'relabel', 'stage', 'state');
create type public.proposal_status as enum ('pending', 'applied', 'declined', 'withdrawn');
create type public.proposal_answer as enum ('accept', 'decline');
create type public.leave_mode as enum ('keep', 'remove');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  created_at   timestamptz not null default now()
);

-- No owner / created_by column on purpose: a US belongs to its members.
create table public.us_spaces (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  description  text not null default '' check (char_length(description) <= 500),
  preset_label public.us_preset,
  stage        text check (char_length(stage) <= 40),
  state        public.us_state not null default 'active',
  created_at   timestamptz not null default now()
);

create table public.us_members (
  us_id     uuid not null references public.us_spaces (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  left_mode public.leave_mode,
  primary key (us_id, user_id)
);
create index us_members_user_idx on public.us_members (user_id) where left_at is null;

-- Personal, invisible-to-others preferences: hand-set order and "收起".
create table public.my_us_prefs (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  us_id      uuid not null references public.us_spaces (id) on delete cascade,
  sort_order integer not null default 0,
  hidden     boolean not null default false,
  primary key (user_id, us_id)
);

create table public.invitations (
  id         uuid primary key default gen_random_uuid(),
  us_id      uuid not null references public.us_spaces (id) on delete cascade,
  token_hash text not null unique,              -- sha256 of the link token; plain token is never stored
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz,
  used_by    uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz
);
create index invitations_us_idx on public.invitations (us_id);

create table public.proposals (
  id          uuid primary key default gen_random_uuid(),
  us_id       uuid not null references public.us_spaces (id) on delete cascade,
  kind        public.proposal_kind not null,
  payload     jsonb not null default '{}'::jsonb,
  proposed_by uuid references public.profiles (id) on delete set null,
  status      public.proposal_status not null default 'pending',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
-- At most one open proposal of each kind per US.
create unique index proposals_one_pending_per_kind
  on public.proposals (us_id, kind) where status = 'pending';

create table public.proposal_responses (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  answer      public.proposal_answer not null,
  created_at  timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create table public.relationship_history (
  id          uuid primary key default gen_random_uuid(),
  us_id       uuid not null references public.us_spaces (id) on delete cascade,
  from_stage  text,
  to_stage    text,
  happened_on date,
  proposal_id uuid references public.proposals (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index relationship_history_us_idx on public.relationship_history (us_id);

-- ---------------------------------------------------------------------------
-- Helpers used by policies (security definer so they can read us_members
-- without recursing into its own RLS policy)
-- ---------------------------------------------------------------------------

create function private.is_active_member(p_us uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.us_members m
    where m.us_id = p_us and m.user_id = auth.uid() and m.left_at is null
  );
$$;

create function private.us_is_open(p_us uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.us_spaces s where s.id = p_us and s.state <> 'closed');
$$;

-- I may see a profile if that person is (or was) in a US I am currently in.
create function private.can_see_profile(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user = auth.uid() or exists (
    select 1
    from public.us_members me
    join public.us_members them on them.us_id = me.us_id
    where me.user_id = auth.uid() and me.left_at is null and them.user_id = p_user
  );
$$;

revoke all on function private.is_active_member(uuid), private.us_is_open(uuid),
  private.can_see_profile(uuid) from public;
grant execute on function private.is_active_member(uuid), private.us_is_open(uuid),
  private.can_see_profile(uuid) to authenticated;

create function private.require_user()
returns uuid
language plpgsql stable set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  return auth.uid();
end;
$$;

create function private.require_member(p_us uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_user();
  if not private.is_active_member(p_us) then
    raise exception 'not a member of this US' using errcode = '42501';
  end if;
end;
$$;

create function private.require_open(p_us uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.us_is_open(p_us) then
    raise exception 'this US is closed' using errcode = '55000';
  end if;
end;
$$;

revoke all on function private.require_user(), private.require_member(uuid),
  private.require_open(uuid) from public;
grant execute on function private.require_user(), private.require_member(uuid),
  private.require_open(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- New auth user -> profile
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.us_spaces            enable row level security;
alter table public.us_members           enable row level security;
alter table public.my_us_prefs          enable row level security;
alter table public.invitations          enable row level security;
alter table public.proposals            enable row level security;
alter table public.proposal_responses   enable row level security;
alter table public.relationship_history enable row level security;

create policy "profiles: visible to co-members" on public.profiles
  for select to authenticated using (private.can_see_profile(id));
create policy "profiles: edit own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "us_spaces: members read" on public.us_spaces
  for select to authenticated using (private.is_active_member(id));

create policy "us_members: members read" on public.us_members
  for select to authenticated
  using (user_id = auth.uid() or private.is_active_member(us_id));

create policy "my_us_prefs: only me" on public.my_us_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and private.is_active_member(us_id));

create policy "invitations: members read" on public.invitations
  for select to authenticated using (private.is_active_member(us_id));

create policy "proposals: members read" on public.proposals
  for select to authenticated using (private.is_active_member(us_id));

-- Only my own answer is readable: we never show who is "holding things up".
create policy "proposal_responses: only mine" on public.proposal_responses
  for select to authenticated using (user_id = auth.uid());

create policy "relationship_history: members read" on public.relationship_history
  for select to authenticated using (private.is_active_member(us_id));

-- ---------------------------------------------------------------------------
-- Table privileges (defense in depth on top of RLS)
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.us_spaces, public.us_members, public.my_us_prefs,
  public.invitations, public.proposals, public.proposal_responses,
  public.relationship_history
  from anon, authenticated;

grant select on public.profiles, public.us_spaces, public.us_members,
  public.proposals, public.proposal_responses, public.relationship_history
  to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, delete on public.my_us_prefs to authenticated;
grant update (sort_order, hidden) on public.my_us_prefs to authenticated;
-- token_hash / created_by / used_by are deliberately not readable.
grant select (id, us_id, created_at, expires_at, used_at, revoked_at)
  on public.invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Home list: my current US spaces in the order I set by hand.
create view public.my_us_list with (security_invoker = true) as
select s.id, s.name, s.description, s.preset_label, s.stage, s.state,
       coalesce(p.sort_order, 0) as sort_order,
       coalesce(p.hidden, false) as hidden
from public.us_spaces s
join public.us_members m on m.us_id = s.id and m.user_id = auth.uid() and m.left_at is null
left join public.my_us_prefs p on p.us_id = s.id and p.user_id = auth.uid();

revoke all on public.my_us_list from anon, authenticated;
grant select on public.my_us_list to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: US lifecycle
-- ---------------------------------------------------------------------------

create function private.add_member(p_us uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.us_members (us_id, user_id)
  values (p_us, p_user)
  on conflict (us_id, user_id)
    do update set left_at = null, left_mode = null, joined_at = now();

  insert into public.my_us_prefs (user_id, us_id, sort_order, hidden)
  values (
    p_user, p_us,
    (select coalesce(max(sort_order), 0) + 1 from public.my_us_prefs where user_id = p_user),
    false
  )
  on conflict (user_id, us_id) do update set hidden = false;
end;
$$;
revoke all on function private.add_member(uuid, uuid) from public;

create function public.create_us(
  p_name text,
  p_description text default '',
  p_preset public.us_preset default null,
  p_stage text default null,
  p_stage_since date default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_us   uuid;
begin
  if (select count(*) from public.us_members where user_id = v_user and left_at is null) >= 100 then
    raise exception 'too many US spaces' using errcode = '54000';
  end if;

  insert into public.us_spaces (name, description, preset_label, stage)
  values (btrim(p_name), coalesce(p_description, ''), p_preset, nullif(btrim(p_stage), ''))
  returning id into v_us;

  perform private.add_member(v_us, v_user);

  if nullif(btrim(p_stage), '') is not null then
    insert into public.relationship_history (us_id, from_stage, to_stage, happened_on)
    values (v_us, null, btrim(p_stage), p_stage_since);
  end if;

  return v_us;
end;
$$;

-- Description is ordinary content: any member may edit it while the US is open.
create function public.set_us_description(p_us uuid, p_description text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_member(p_us);
  perform private.require_open(p_us);
  update public.us_spaces set description = coalesce(p_description, '') where id = p_us;
end;
$$;

-- Reorder my home list. Order is personal and never visible to others.
create function public.reorder_my_us(p_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
begin
  update public.my_us_prefs p
  set sort_order = o.ord
  from unnest(p_ids) with ordinality as o(us_id, ord)
  where p.user_id = v_user and p.us_id = o.us_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: invitations
-- ---------------------------------------------------------------------------

create function private.hash_token(p_token text)
returns text
language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex'); $$;
revoke all on function private.hash_token(text) from public;

-- Returns the plain token exactly once; only its hash is stored.
create function public.create_invitation(p_us uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text;
begin
  perform private.require_member(p_us);
  perform private.require_open(p_us);

  if (select count(*) from public.invitations
      where us_id = p_us and used_at is null and revoked_at is null and expires_at > now()) >= 20 then
    raise exception 'too many open invitations' using errcode = '54000';
  end if;

  -- two v4 UUIDs = 244 random bits from the server's CSPRNG
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.invitations (us_id, token_hash, created_by)
  values (p_us, private.hash_token(v_token), auth.uid());

  return v_token;
end;
$$;

create function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_us uuid;
begin
  select us_id into v_us from public.invitations where id = p_invitation;
  if v_us is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  perform private.require_member(v_us);
  update public.invitations set revoked_at = now()
  where id = p_invitation and revoked_at is null and used_at is null;
end;
$$;

-- What the invite landing page may show to whoever holds a valid token:
-- the US name and the first names of its current members. Nothing else.
create function public.invitation_preview(p_token text)
returns table (us_name text, member_names text[])
language sql stable security definer set search_path = ''
as $$
  select s.name,
         array(
           select p.display_name from public.us_members m
           join public.profiles p on p.id = m.user_id
           where m.us_id = s.id and m.left_at is null and p.display_name <> ''
           order by m.joined_at
         )
  from public.invitations i
  join public.us_spaces s on s.id = i.us_id
  where i.token_hash = private.hash_token(p_token)
    and i.used_at is null and i.revoked_at is null and i.expires_at > now()
    and s.state <> 'closed';
$$;

create function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_inv  public.invitations%rowtype;
begin
  select * into v_inv from public.invitations
  where token_hash = private.hash_token(p_token)
  for update;

  if not found or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'invitation is not valid' using errcode = 'P0002';
  end if;

  -- Already inside: do not burn the link.
  if exists (select 1 from public.us_members
             where us_id = v_inv.us_id and user_id = v_user and left_at is null) then
    return v_inv.us_id;
  end if;

  if v_inv.used_at is not null then
    raise exception 'invitation is not valid' using errcode = 'P0002';
  end if;

  perform private.require_open(v_inv.us_id);

  if (select count(*) from public.us_members where us_id = v_inv.us_id and left_at is null) >= 50 then
    raise exception 'this US is full' using errcode = '54000';
  end if;

  perform private.add_member(v_inv.us_id, v_user);
  update public.invitations set used_at = now(), used_by = v_user where id = v_inv.id;

  return v_inv.us_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: proposals (relationship-defining changes need every current member)
-- ---------------------------------------------------------------------------

-- Applies the proposal if every current member has accepted. Called after
-- each answer and whenever membership shrinks.
create function private.try_apply_proposal(p_proposal uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_p public.proposals%rowtype;
  v_old_stage text;
begin
  select * into v_p from public.proposals where id = p_proposal and status = 'pending' for update;
  if not found then
    return false;
  end if;

  if not exists (select 1 from public.us_members where us_id = v_p.us_id and left_at is null) then
    return false;
  end if;

  if exists (
    select 1 from public.us_members m
    where m.us_id = v_p.us_id and m.left_at is null
      and not exists (
        select 1 from public.proposal_responses r
        where r.proposal_id = v_p.id and r.user_id = m.user_id and r.answer = 'accept'
      )
  ) then
    return false;
  end if;

  case v_p.kind
    when 'rename' then
      update public.us_spaces set name = v_p.payload ->> 'name' where id = v_p.us_id;
    when 'relabel' then
      update public.us_spaces
      set preset_label = (v_p.payload ->> 'preset_label')::public.us_preset
      where id = v_p.us_id;
    when 'stage' then
      select stage into v_old_stage from public.us_spaces where id = v_p.us_id;
      update public.us_spaces set stage = v_p.payload ->> 'stage' where id = v_p.us_id;
      insert into public.relationship_history (us_id, from_stage, to_stage, happened_on, proposal_id)
      values (v_p.us_id, v_old_stage, v_p.payload ->> 'stage',
              (v_p.payload ->> 'happened_on')::date, v_p.id);
    when 'state' then
      update public.us_spaces
      set state = (v_p.payload ->> 'state')::public.us_state
      where id = v_p.us_id;
  end case;

  update public.proposals set status = 'applied', resolved_at = now() where id = v_p.id;
  return true;
end;
$$;
revoke all on function private.try_apply_proposal(uuid) from public;

create function public.propose(p_us uuid, p_kind public.proposal_kind, p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user  uuid := private.require_user();
  v_space public.us_spaces%rowtype;
  v_clean jsonb;
  v_id    uuid;
begin
  perform private.require_member(p_us);
  select * into v_space from public.us_spaces where id = p_us;

  -- A closed US is frozen; the only thing left to propose is reopening it.
  if v_space.state = 'closed' and p_kind <> 'state' then
    raise exception 'this US is closed' using errcode = '55000';
  end if;

  case p_kind
    when 'rename' then
      if char_length(btrim(coalesce(p_payload ->> 'name', ''))) not between 1 and 60 then
        raise exception 'invalid name' using errcode = '22023';
      end if;
      v_clean := jsonb_build_object('name', btrim(p_payload ->> 'name'));
    when 'relabel' then
      v_clean := jsonb_build_object(
        'preset_label', (nullif(p_payload ->> 'preset_label', ''))::public.us_preset);
    when 'stage' then
      if char_length(btrim(coalesce(p_payload ->> 'stage', ''))) not between 1 and 40 then
        raise exception 'invalid stage' using errcode = '22023';
      end if;
      v_clean := jsonb_build_object(
        'stage', btrim(p_payload ->> 'stage'),
        'happened_on', coalesce((p_payload ->> 'happened_on')::date, current_date));
    when 'state' then
      if p_payload ->> 'state' is null
         or (p_payload ->> 'state')::public.us_state = v_space.state then
        raise exception 'already in that state' using errcode = '22023';
      end if;
      v_clean := jsonb_build_object('state', (p_payload ->> 'state')::public.us_state);
  end case;

  insert into public.proposals (us_id, kind, payload, proposed_by)
  values (p_us, p_kind, v_clean, v_user)
  returning id into v_id;

  insert into public.proposal_responses (proposal_id, user_id, answer)
  values (v_id, v_user, 'accept');

  perform private.try_apply_proposal(v_id);
  return v_id;
end;
$$;

create function public.respond_to_proposal(p_proposal uuid, p_answer public.proposal_answer)
returns public.proposal_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_p    public.proposals%rowtype;
begin
  select * into v_p from public.proposals where id = p_proposal;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  perform private.require_member(v_p.us_id);
  if v_p.status <> 'pending' then
    return v_p.status;
  end if;

  insert into public.proposal_responses (proposal_id, user_id, answer)
  values (p_proposal, v_user, p_answer)
  on conflict (proposal_id, user_id) do update set answer = excluded.answer, created_at = now();

  if p_answer = 'decline' then
    update public.proposals set status = 'declined', resolved_at = now() where id = p_proposal;
  else
    perform private.try_apply_proposal(p_proposal);
  end if;

  return (select status from public.proposals where id = p_proposal);
end;
$$;

create function public.withdraw_proposal(p_proposal uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
begin
  update public.proposals set status = 'withdrawn', resolved_at = now()
  where id = p_proposal and proposed_by = v_user and status = 'pending';
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: leaving. Always allowed, alone, no approval needed — even when closed.
-- ---------------------------------------------------------------------------

-- Removes the leaving member's own content. Extended by later phases as more
-- content tables appear. Never touches anyone else's rows.
create function private.remove_member_content(p_us uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  null;
end;
$$;
revoke all on function private.remove_member_content(uuid, uuid) from public;

create function public.leave_us(p_us uuid, p_mode public.leave_mode default 'keep')
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_pid  uuid;
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
    perform private.remove_member_content(p_us, v_user);
  end if;

  -- With one fewer member, some pending proposals may now be unanimous.
  for v_pid in select id from public.proposals where us_id = p_us and status = 'pending' loop
    perform private.try_apply_proposal(v_pid);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: only signed-in users may call RPCs, except the invite
-- preview which the landing page calls before anyone signs in.
-- ---------------------------------------------------------------------------

revoke all on function
  public.create_us(text, text, public.us_preset, text, date),
  public.set_us_description(uuid, text),
  public.reorder_my_us(uuid[]),
  public.create_invitation(uuid),
  public.revoke_invitation(uuid),
  public.invitation_preview(text),
  public.accept_invitation(text),
  public.propose(uuid, public.proposal_kind, jsonb),
  public.respond_to_proposal(uuid, public.proposal_answer),
  public.withdraw_proposal(uuid),
  public.leave_us(uuid, public.leave_mode)
  from public, anon;

grant execute on function
  public.create_us(text, text, public.us_preset, text, date),
  public.set_us_description(uuid, text),
  public.reorder_my_us(uuid[]),
  public.create_invitation(uuid),
  public.revoke_invitation(uuid),
  public.invitation_preview(text),
  public.accept_invitation(text),
  public.propose(uuid, public.proposal_kind, jsonb),
  public.respond_to_proposal(uuid, public.proposal_answer),
  public.withdraw_proposal(uuid),
  public.leave_us(uuid, public.leave_mode)
  to authenticated;

grant execute on function public.invitation_preview(text) to anon;
