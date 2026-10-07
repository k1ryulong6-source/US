-- Moving a session to another device: once, within 10 minutes, never readable by others.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

\set guest '''a9100000-0000-4000-8000-00000000000a'''
\set other '''b9100000-0000-4000-8000-00000000000b'''
\set l1 '''1111111111111111111111111111111111111111111111111111111111111111'''
\set l2 '''2222222222222222222222222222222222222222222222222222222222222222'''
\set l3 '''3333333333333333333333333333333333333333333333333333333333333333'''

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (:guest, null, true, '{}'),
  (:other, 'other@move.test', false, '{}');

select pg_temp.anon();
select throws_ok($$select create_device_transfer(repeat('a', 64), 'x')$$, '42501', null,
  'only a signed-in person can start a move');

select pg_temp.login(:guest);
select isnt(create_device_transfer(:l1, 'sealed-1'), null, 'a signed-in guest can start a move');
select throws_ok($$select create_device_transfer('not-a-hash', 'x')$$, '23514', null, 'the lookup must be a hash');
select throws_ok($$select * from device_transfers$$, '42501', null, 'nobody reads the table directly');

select pg_temp.login(:other);
select throws_ok($$select * from device_transfers$$, '42501', null, 'not even another signed-in person');

-- the new device, not signed in yet
select pg_temp.anon();
select is(device_transfer_status(:l1), 'waiting', 'the old device can see it is still waiting');
select is(take_device_transfer(:l2), null, 'a wrong code gets nothing');
select is(take_device_transfer(:l1), 'sealed-1', 'the right code gets the sealed session');
select is(take_device_transfer(:l1), null, 'but only once');
select is(device_transfer_status(:l1), 'taken', 'the old device learns it has moved');
select is(cancel_device_transfer(:l1), false, 'a taken session cannot be taken back');
reset role;
select is((select payload from device_transfers where lookup = :l1), null, 'the sealed session is not kept');

-- cancelled before anyone took it: the old device may use its session again
select pg_temp.login(:guest);
select create_device_transfer(:l2, 'sealed-2');
select pg_temp.anon();
select is(cancel_device_transfer(:l2), true, 'cancelling an untaken move is safe');
select is(take_device_transfer(:l2), null, 'and nobody can take it afterwards');
select is(device_transfer_status(:l2), 'over', 'it is over');

-- ten minutes pass
select pg_temp.login(:guest);
select create_device_transfer(:l3, 'sealed-3');
reset role;
update device_transfers set expires_at = now() - interval '1 second' where lookup = :l3;
select pg_temp.anon();
select is(take_device_transfer(:l3), null, 'an expired code gets nothing');
select is(device_transfer_status(:l3), 'over', 'it shows as over');
select is(cancel_device_transfer(:l3), true, 'and the old device gets its session back');

select * from finish();
