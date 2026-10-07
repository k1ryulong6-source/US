-- Moving to another device without an email.
--
-- A guest identity lives in one browser. On an iPhone, Safari and the home-screen app are
-- two separate browsers, so the person who joined from an invite link in Safari can't
-- open the installed app as themselves. A short code moves them across:
--
--   1. The old device makes a code, encrypts its session with it (on the device, with a
--      key derived from the code) and stores only the ciphertext here, under a hash of
--      the code. Then it stops using that session.
--   2. The new device enters the code, takes the ciphertext once, decrypts it and
--      continues the session.
--   3. If nobody takes it in 10 minutes, or the old device cancels, the old device
--      gets its session back. A session is only ever used on one device.
--
-- This database never sees the code or the session in the clear.

create table public.device_transfers (
  lookup       text primary key check (lookup ~ '^[0-9a-f]{64}$'),
  user_id      uuid not null references auth.users (id) on delete cascade,
  payload      text check (char_length(payload) <= 4000),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes',
  taken_at     timestamptz,
  cancelled_at timestamptz
);
create index device_transfers_user_idx on public.device_transfers (user_id);

-- Only reachable through the functions below.
alter table public.device_transfers enable row level security;
revoke all on public.device_transfers from anon, authenticated;

create function public.create_device_transfer(p_lookup text, p_payload text)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_expires timestamptz;
begin
  delete from public.device_transfers where created_at < now() - interval '1 day';
  insert into public.device_transfers (lookup, user_id, payload)
  values (p_lookup, v_user, p_payload)
  returning expires_at into v_expires;
  return v_expires;
end;
$$;

-- Once only, and only within 10 minutes. The ciphertext is dropped as it is taken.
create function public.take_device_transfer(p_lookup text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_payload text;
begin
  select payload into v_payload from public.device_transfers
  where lookup = p_lookup and taken_at is null and cancelled_at is null and expires_at > now()
  for update;
  if not found then
    return null;
  end if;
  update public.device_transfers set taken_at = now(), payload = null where lookup = p_lookup;
  return v_payload;
end;
$$;

-- 'waiting', 'taken', or 'over' (expired, cancelled, or never existed).
create function public.device_transfer_status(p_lookup text)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when taken_at is not null then 'taken'
      when cancelled_at is null and expires_at > now() then 'waiting'
      else 'over'
    end
    from public.device_transfers where lookup = p_lookup
  ), 'over')
$$;

-- True when the session was never taken: the old device may use it again.
create function public.cancel_device_transfer(p_lookup text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.device_transfers set cancelled_at = now(), payload = null
  where lookup = p_lookup and taken_at is null and cancelled_at is null;
  if found then
    return true;
  end if;
  -- cancelling twice is fine; only a taken session is gone for good
  return exists (select 1 from public.device_transfers where lookup = p_lookup and taken_at is null);
end;
$$;

revoke all on function
  public.create_device_transfer(text, text),
  public.take_device_transfer(text),
  public.device_transfer_status(text),
  public.cancel_device_transfer(text)
  from public, anon;

grant execute on function public.create_device_transfer(text, text) to authenticated;
-- the new device (and the old one, now signed out) call these before anyone is signed in
grant execute on function
  public.take_device_transfer(text),
  public.device_transfer_status(text),
  public.cancel_device_transfer(text)
  to anon, authenticated;
