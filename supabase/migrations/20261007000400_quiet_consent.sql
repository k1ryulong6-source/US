-- A proposal nobody declines within 14 days counts as agreed.
--
-- Unanimity alone can stall a US for good: someone stops opening the app or loses their
-- guest identity, and there is no owner to remove them. Any member can still say no.
-- There is no timer in the database: the next time anyone here opens the US, the app
-- calls settle_proposals() and whatever has waited long enough is applied.

create function private.quiet_consent()
returns interval
language sql immutable set search_path = ''
as $$ select interval '14 days' $$;

create or replace function private.try_apply_proposal(p_proposal uuid)
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

  -- Everyone said yes, or nobody said no for 14 days (a decline ends a proposal at once,
  -- so a pending one has none). Silence doesn't block forever: people drift away, lose
  -- their phone, stop opening the app, and nobody can remove them.
  if v_p.created_at > now() - private.quiet_consent() and exists (
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

create function public.settle_proposals(p_us uuid default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_pid  uuid;
  v_n    integer := 0;
begin
  for v_pid in
    select p.id from public.proposals p
    join public.us_members m on m.us_id = p.us_id and m.user_id = v_user and m.left_at is null
    where p.status = 'pending'
      and p.created_at <= now() - private.quiet_consent()
      and (p_us is null or p.us_id = p_us)
  loop
    if private.try_apply_proposal(v_pid) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.settle_proposals(uuid) from public, anon;
grant execute on function public.settle_proposals(uuid) to authenticated;
