-- Phase (a): US spaces, members, invitations, proposals.
-- Proves that non-members, people who left, guests of another US and
-- not-signed-in visitors cannot read or change what they shouldn't.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- ---------------------------------------------------------------- helpers --
create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.login_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

\set alice    '''a0000000-0000-4000-8000-00000000000a'''
\set bob      '''b0000000-0000-4000-8000-00000000000b'''
\set carol    '''c0000000-0000-4000-8000-00000000000c'''
\set dave     '''d0000000-0000-4000-8000-00000000000d'''
\set guest1   '''e0000000-0000-4000-8000-0000000000e1'''
\set guest2   '''e0000000-0000-4000-8000-0000000000e2'''
\set stranger '''f0000000-0000-4000-8000-00000000000f'''

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (:alice,    'alice@example.com', false, '{"display_name":"Alice"}'),
  (:bob,      'bob@example.com',   false, '{"display_name":"Bob"}'),
  (:carol,    'carol@example.com', false, '{"display_name":"Carol"}'),
  (:dave,     'dave@example.com',  false, '{"display_name":"Dave"}'),
  (:guest1,   null,                true,  '{}'),
  (:guest2,   null,                true,  '{}'),
  (:stranger, null,                true,  '{}');

select is((select count(*)::int from profiles), 7, 'a profile is created for every new auth user');

-- ------------------------------------------------------------------ setup --
-- US1: alice + bob + guest1 (+ dave, who will leave). US2: carol + guest2.
select pg_temp.login(:alice);
select create_us('我们俩', '在东京认识', 'partners', '朋友', '2019-04-01') as us1 \gset
select create_invitation(:'us1') as inv_bob \gset
select create_invitation(:'us1') as inv_dave \gset
select create_invitation(:'us1') as inv_guest1 \gset
select create_invitation(:'us1') as inv_unused \gset

select pg_temp.login(:bob);
select is(accept_invitation(:'inv_bob'), :'us1'::uuid, 'bob joins US1 with his link');
select pg_temp.login(:dave);
select is(accept_invitation(:'inv_dave'), :'us1'::uuid, 'dave joins US1');
select pg_temp.login(:guest1);
select is(accept_invitation(:'inv_guest1'), :'us1'::uuid, 'anonymous guest joins US1 without registering');

select pg_temp.login(:carol);
select create_us('Carol 家') as us2 \gset
select create_invitation(:'us2') as inv_guest2 \gset
select pg_temp.login(:guest2);
select is(accept_invitation(:'inv_guest2'), :'us2'::uuid, 'guest2 joins US2');

-- dave leaves US1 (keeping his past content visible)
select pg_temp.login(:dave);
select lives_ok(format('select leave_us(%L, %L)', :'us1', 'keep'), 'dave can leave alone, no approval');

-- --------------------------------------------------------- members see it --
select pg_temp.login(:alice);
select is((select count(*)::int from us_spaces), 1, 'alice sees exactly her one US');
select is((select count(*)::int from us_members where us_id = :'us1' and left_at is null), 3,
  'alice sees the 3 current members of US1');
select is((select count(*)::int from relationship_history where us_id = :'us1'), 1,
  'initial stage is recorded in relationship history');
select is((select display_name from profiles where id = :bob), 'Bob', 'alice can read a co-member profile');

select pg_temp.login(:guest1);
select is((select count(*)::int from us_spaces where id = :'us1'), 1, 'guest1 can see US1');

-- -------------------------------------------------------- outsiders don't --
select pg_temp.login(:carol);
select is((select count(*)::int from us_spaces where id = :'us1'), 0, 'carol cannot read US1 even knowing its id');
select is((select count(*)::int from us_members where us_id = :'us1'), 0, 'carol cannot list US1 members');
select is((select count(*)::int from relationship_history where us_id = :'us1'), 0, 'carol cannot read US1 history');
select is((select count(*)::int from proposals where us_id = :'us1'), 0, 'carol cannot read US1 proposals');
select is((select count(*)::int from invitations where us_id = :'us1'), 0, 'carol cannot read US1 invitations');
select is((select count(*)::int from profiles where id = :alice), 0, 'carol cannot read alice''s profile');
select is((select count(*)::int from my_us_prefs where us_id = :'us1'), 0, 'carol cannot read anyone''s prefs for US1');
select is((select count(*)::int from my_us_list where id = :'us1'), 0, 'US1 not in carol''s home list');
select throws_ok(format('select create_invitation(%L)', :'us1'), '42501', null,
  'carol cannot create an invitation for US1');
select throws_ok(format('select propose(%L, %L, %L)', :'us1', 'rename', '{"name":"hacked"}'), '42501', null,
  'carol cannot propose changes to US1');
select throws_ok(format('select set_us_description(%L, %L)', :'us1', 'hacked'), '42501', null,
  'carol cannot edit US1 description');
select throws_ok(format('insert into us_members (us_id, user_id) values (%L, %L)', :'us1', :carol), '42501', null,
  'carol cannot insert herself into us_members directly');
select throws_ok(format('insert into my_us_prefs (user_id, us_id) values (%L, %L)', :carol, :'us1'), '42501', null,
  'carol cannot attach US1 to her home list');
with u as (update profiles set display_name = 'hacked' where id = :alice returning 1)
select is(count(*)::int, 0, 'carol cannot rename alice') from u;

select pg_temp.login(:guest2);
select is((select count(*)::int from us_spaces where id = :'us1'), 0, 'guest of US2 cannot read US1');
select is((select count(*)::int from us_members where us_id = :'us1'), 0, 'guest of US2 cannot list US1 members');
select is((select count(*)::int from profiles where id in (:alice, :bob)), 0, 'guest of US2 cannot read US1 profiles');

select pg_temp.login(:stranger);
select is((select count(*)::int from us_spaces), 0, 'signed-in stranger sees no US');
select is((select count(*)::int from us_members), 0, 'signed-in stranger sees no members');
select is((select count(*)::int from profiles), 1, 'signed-in stranger sees only their own profile');
select throws_ok(format('select accept_invitation(%L)', 'not-a-real-token'), 'P0002', null,
  'a made-up token does not work');
select throws_ok(format('select accept_invitation(%L)', :'inv_bob'), 'P0002', null,
  'a used invitation cannot be reused by someone else');

select pg_temp.login(:alice);
select create_invitation(:'us1') as inv_expired \gset
select create_invitation(:'us1') as inv_revoked \gset
select revoke_invitation((select id from invitations where us_id = :'us1' order by created_at desc, id limit 1)) is null as ok \gset
select pg_temp.logout();
update invitations set expires_at = now() - interval '1 minute'
  where token_hash = encode(sha256(convert_to(:'inv_expired', 'UTF8')), 'hex');
update invitations set revoked_at = now()
  where token_hash = encode(sha256(convert_to(:'inv_revoked', 'UTF8')), 'hex');
select pg_temp.login(:stranger);
select throws_ok(format('select accept_invitation(%L)', :'inv_expired'), 'P0002', null, 'an expired link does not work');
select throws_ok(format('select accept_invitation(%L)', :'inv_revoked'), 'P0002', null, 'a revoked link does not work');
select is((select count(*)::int from invitation_preview(:'inv_expired')), 0, 'an expired link previews nothing');

-- ------------------------------------------------------------ people who left --
select pg_temp.login(:dave);
select is((select count(*)::int from us_spaces where id = :'us1'), 0, 'dave (left) can no longer read US1');
select is((select count(*)::int from us_members where us_id = :'us1' and user_id <> :dave), 0,
  'dave (left) can no longer list other members');
select is((select count(*)::int from profiles where id = :alice), 0, 'dave (left) can no longer read alice''s profile');
select throws_ok(format('select create_invitation(%L)', :'us1'), '42501', null, 'dave (left) cannot invite');
select throws_ok(format('select leave_us(%L)', :'us1'), '42501', null, 'cannot leave twice');

select pg_temp.login(:alice);
select is((select display_name from profiles where id = :dave), 'Dave',
  'remaining members still see the name of someone who left (their kept content stays attributed)');

-- ------------------------------------------------------ direct writes blocked --
select pg_temp.login(:alice);
select throws_ok(format('update us_spaces set name = %L where id = %L', 'x', :'us1'), '42501', null,
  'even a member cannot rename a US directly (needs a proposal)');
select throws_ok(format('delete from us_spaces where id = %L', :'us1'), '42501', null,
  'nobody can delete a US');
select throws_ok(format('update us_members set left_at = now() where us_id = %L and user_id = %L', :'us1', :bob),
  '42501', null, 'nobody can remove another member directly');
select throws_ok('select token_hash from invitations', '42501', null, 'invitation token hashes are not readable');
select is((select count(*)::int from invitations where us_id = :'us1'), 6, 'members can see US1 invitations (no tokens)');

-- --------------------------------------------------------------- my prefs --
select pg_temp.login(:alice);
update my_us_prefs set hidden = true where us_id = :'us1';
select is((select hidden from my_us_list where id = :'us1'), true, 'alice hid US1 for herself');
select pg_temp.login(:bob);
select is((select count(*)::int from my_us_prefs), 1, 'bob only sees his own prefs');
select is((select hidden from my_us_list where id = :'us1'), false, 'alice hiding US1 does not hide it for bob');

-- -------------------------------------------------------------- proposals --
select pg_temp.login(:alice);
select propose(:'us1', 'rename', '{"name":"我们"}') as p_rename \gset
select is((select name from us_spaces where id = :'us1'), '我们俩', 'rename waits for everyone');
select throws_ok(format('select propose(%L, %L, %L)', :'us1', 'rename', '{"name":"again"}'), '23505', null,
  'only one pending proposal of a kind at a time');

select pg_temp.login(:bob);
select is((select count(*)::int from proposal_responses where proposal_id = :'p_rename'), 0,
  'bob cannot see how others answered');
select is(respond_to_proposal(:'p_rename', 'accept'), 'pending'::proposal_status, 'still pending after bob');

select pg_temp.login(:dave);
select throws_ok(format('select respond_to_proposal(%L, %L)', :'p_rename', 'accept'), '42501', null,
  'dave (left) cannot answer proposals');
select pg_temp.login(:carol);
select throws_ok(format('select respond_to_proposal(%L, %L)', :'p_rename', 'accept'), '42501', null,
  'carol cannot answer US1 proposals');

select pg_temp.login(:guest1);
select is(respond_to_proposal(:'p_rename', 'accept'), 'applied'::proposal_status,
  'applied once every current member (guest included) accepts');
select is((select name from us_spaces where id = :'us1'), '我们', 'US1 is renamed');

select pg_temp.login(:alice);
select propose(:'us1', 'stage', '{"stage":"恋人","happened_on":"2021-06-01"}') as p_stage \gset
select pg_temp.login(:bob);
select is(respond_to_proposal(:'p_stage', 'decline'), 'declined'::proposal_status, 'one decline is enough to stop it');
select is((select stage from us_spaces where id = :'us1'), '朋友', 'stage unchanged after decline');

-- a single-member US is fully usable on its own
select pg_temp.login(:alice);
select create_us('只有我') as us_solo \gset
select propose(:'us_solo', 'stage', '{"stage":"独处","happened_on":"2024-01-01"}') as p_solo \gset
select is((select status from proposals where id = :'p_solo'), 'applied'::proposal_status,
  'in a one-person US proposals apply immediately');
select is((select count(*)::int from relationship_history where us_id = :'us_solo'), 1,
  'stage change writes relationship history');

-- leaving can complete a pending proposal
select pg_temp.login(:alice);
select propose(:'us1', 'relabel', '{"preset_label":"friends"}') as p_label \gset
select pg_temp.login(:bob);
select respond_to_proposal(:'p_label', 'accept') is not null as ok \gset
select pg_temp.login(:guest1);
select lives_ok(format('select leave_us(%L, %L)', :'us1', 'remove'), 'guest1 leaves');
select pg_temp.login(:alice);
select is((select preset_label from us_spaces where id = :'us1'), 'friends'::us_preset,
  'a pending proposal applies when the last holdout leaves');

-- ------------------------------------------------------------- closing --
select pg_temp.login(:alice);
select propose(:'us1', 'state', '{"state":"closed"}') as p_close \gset
select pg_temp.login(:bob);
select is(respond_to_proposal(:'p_close', 'accept'), 'applied'::proposal_status, 'US1 closed by both');
select throws_ok(format('select create_invitation(%L)', :'us1'), '55000', null, 'a closed US accepts no invitations');
select throws_ok(format('select propose(%L, %L, %L)', :'us1', 'rename', '{"name":"x"}'), '55000', null,
  'a closed US cannot be renamed');
select throws_ok(format('select set_us_description(%L, %L)', :'us1', 'x'), '55000', null,
  'a closed US is frozen');
select pg_temp.login(:carol);
select throws_ok(format('select accept_invitation(%L)', :'inv_unused'), '55000', null,
  'old links stop working once closed');
select pg_temp.login(:alice);
select is((select count(*)::int from us_spaces where id = :'us1'), 1, 'closed US is still readable by members');
select lives_ok(format('select propose(%L, %L, %L)', :'us1', 'state', '{"state":"active"}'),
  'members may propose reopening');

-- ------------------------------------------------------------ rejoin --
select pg_temp.login(:bob);
select lives_ok(format('select leave_us(%L)', :'us1'), 'bob can leave a closed US');
select is((select count(*)::int from us_spaces where id = :'us1'), 0, 'bob no longer sees US1');

-- ------------------------------------------------------- not signed in --
select pg_temp.login_anon();
select throws_ok('select * from us_spaces', '42501', null, 'anon role cannot read us_spaces at all');
select throws_ok('select * from profiles', '42501', null, 'anon role cannot read profiles at all');
select throws_ok(format('select accept_invitation(%L)', 'x'), '42501', null, 'anon role cannot accept invitations');

select pg_temp.logout();
select pg_temp.login(:carol);
select create_invitation(:'us2') as inv_preview \gset
select pg_temp.login_anon();
select is((select us_name from invitation_preview(:'inv_preview')), 'Carol 家', 'invite link holder can preview the US name');
select is((select count(*)::int from invitation_preview('bogus')), 0, 'bogus token previews nothing');

select pg_temp.logout();
select * from finish();
rollback;
