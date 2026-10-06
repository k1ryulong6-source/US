-- Phase (c): perspectives with simultaneous reveal, private perspectives,
-- perspective voice clips, and "我看见的你" seen notes.
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
create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

\set alice '''a0000000-0000-4000-8000-00000000000a'''
\set bob   '''b0000000-0000-4000-8000-00000000000b'''
\set carol '''c0000000-0000-4000-8000-00000000000c'''
\set dave  '''d0000000-0000-4000-8000-00000000000d'''
\set erin  '''e0000000-0000-4000-8000-00000000000e'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:alice, 'alice@example.com', '{"display_name":"Alice"}'),
  (:bob,   'bob@example.com',   '{"display_name":"Bob"}'),
  (:carol, 'carol@example.com', '{"display_name":"Carol"}'),
  (:dave,  'dave@example.com',  '{"display_name":"Dave"}'),
  (:erin,  'erin@example.com',  '{"display_name":"Erin"}');

-- US1: alice, bob, dave, erin. carol is outside.
select pg_temp.login(:alice);
select create_us('我们') as us1 \gset
select create_invitation(:'us1') as i1 \gset
select create_invitation(:'us1') as i2 \gset
select create_invitation(:'us1') as i3 \gset
select pg_temp.login(:bob);
select accept_invitation(:'i1') is not null as ok \gset
select pg_temp.login(:dave);
select accept_invitation(:'i2') is not null as ok \gset
select pg_temp.login(:erin);
select accept_invitation(:'i3') is not null as ok \gset
select pg_temp.login(:carol);
select create_us('Carol') is not null as ok \gset

select pg_temp.login(:alice);
insert into memories (us_id, body) values (:'us1', '那天的雨') returning id as m1 \gset

-- ------------------------------------------------------ simultaneous reveal --
select pg_temp.login(:bob);
select :'us1' || '/' || :'m1' || '/p/bob.m4a' as bob_audio \gset
select lives_ok(
  format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'media', :'bob_audio', :bob),
  'any member may upload a voice clip for their perspective');
insert into perspectives (memory_id, body, audio_path, audio_mime)
values (:'m1', '我记得是晴天', :'bob_audio', 'audio/mp4');
select is((select reason from reveal_states where memory_id = :'m1'), 'wrote'::reveal_reason,
  'writing my version reveals the others for me');

select pg_temp.login(:alice);
select is((select count(*)::int from perspectives where memory_id = :'m1'), 0,
  'before writing or skipping, alice cannot see bob''s version');
select is((select count(*)::int from storage.objects where name = :'bob_audio'), 0,
  '...nor fetch his voice clip');
select is(private.has_revealed(:'m1'), false, 'nothing hints that a version exists');

insert into perspectives (memory_id, body) values (:'m1', '我记得在下雨');
select is((select count(*)::int from perspectives where memory_id = :'m1'), 2,
  'after writing hers, alice sees both versions');
select is((select count(*)::int from storage.objects where name = :'bob_audio'), 1,
  'and can now play bob''s voice clip');

-- private perspective
select pg_temp.login(:dave);
select :'us1' || '/' || :'m1' || '/p/dave.m4a' as dave_audio \gset
select lives_ok(
  format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'media', :'dave_audio', :dave),
  'dave uploads a clip');
insert into perspectives (memory_id, body, is_private, audio_path, audio_mime)
values (:'m1', '只给自己看的', true, :'dave_audio', 'audio/mp4');
select is((select count(*)::int from perspectives where memory_id = :'m1'), 3,
  'dave (wrote, private) sees alice''s, bob''s and his own');

select pg_temp.login(:alice);
select is((select count(*)::int from perspectives where memory_id = :'m1' and author_id = :dave), 0,
  'a private perspective is invisible to others even after reveal');
select is((select count(*)::int from storage.objects where name = :'dave_audio'), 0,
  'and so is its voice clip');

-- skipping
select pg_temp.login(:erin);
select is((select count(*)::int from perspectives where memory_id = :'m1'), 0, 'erin sees nothing yet');
insert into reveal_states (memory_id) values (:'m1');
select is((select count(*)::int from perspectives where memory_id = :'m1'), 2,
  'after "跳过，直接看" erin sees the two public versions');
select throws_ok(format('insert into reveal_states (memory_id, user_id) values (%L, %L)', :'m1', :bob), '42501', null,
  'nobody can reveal on someone else''s behalf');

select pg_temp.login(:bob);
select is((select count(*)::int from reveal_states), 1, 'bob only sees his own reveal state');
select throws_ok(format('insert into perspectives (memory_id, body) values (%L, %L)', :'m1', 'again'), '23505', null,
  'one perspective per person per memory');
with u as (update perspectives set body = 'x' where author_id = :alice returning 1)
select is(count(*)::int, 0, 'bob cannot edit alice''s version') from u;
with d as (delete from perspectives where author_id = :alice returning 1)
select is(count(*)::int, 0, 'bob cannot delete alice''s version') from d;
select throws_ok(
  format('update perspectives set audio_path = %L where author_id = %L', :'dave_audio', :bob), '42501', null,
  'cannot point my perspective at someone else''s file');
select throws_ok(format('delete from reveal_states where memory_id = %L', :'m1'), '42501', null,
  'a reveal cannot be undone');

-- outsiders
select pg_temp.login(:carol);
select is((select count(*)::int from perspectives), 0, 'carol sees no perspectives');
select throws_ok(format('insert into reveal_states (memory_id) values (%L)', :'m1'), '42501', null,
  'carol cannot reveal a memory of a US she is not in');
select throws_ok(format('insert into perspectives (memory_id, body) values (%L, %L)', :'m1', 'x'), '42501', null,
  'carol cannot write a perspective in US1');
select throws_ok(
  format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'media', :'us1' || '/' || :'m1' || '/p/carol.m4a', :carol),
  '42501', null, 'carol cannot upload into US1');
select is((select count(*)::int from storage.objects where name = :'bob_audio'), 0, 'carol cannot fetch bob''s clip');

-- leaving
select pg_temp.login(:erin);
select leave_us(:'us1') is null as ok \gset
select is((select count(*)::int from perspectives where memory_id = :'m1'), 0,
  'erin (left) can no longer read the perspectives');

-- ---------------------------------------------- deleting keeps others' words --
select pg_temp.login(:alice);
select is(array_length(delete_memory(:'m1'), 1), null, 'alice deletes the memory she wrote');
select is((select author_removed from memories where id = :'m1'), true,
  'the memory stays as an empty shell because others wrote on it');
select is((select body from memories where id = :'m1'), '', 'alice''s words are gone');
select pg_temp.login(:bob);
select is((select body from perspectives where memory_id = :'m1' and author_id = :bob), '我记得是晴天',
  'bob''s version survives');

-- ------------------------------------------------------------- seen notes --
select pg_temp.login(:alice);
insert into seen_notes (us_id, to_id, body) values (:'us1', :bob, '你总是先问我累不累') returning id as n1 \gset
select throws_ok(format('insert into seen_notes (us_id, to_id, body) values (%L, %L, %L)', :'us1', :carol, 'x'),
  '42501', null, 'cannot write to someone who is not in this US');
select throws_ok(format('insert into seen_notes (us_id, from_id, to_id, body) values (%L, %L, %L, %L)',
  :'us1', :bob, :alice, 'x'), '42501', null, 'cannot write in someone else''s name');
select throws_ok(format('insert into seen_notes (us_id, to_id, body) values (%L, %L, %L)', :'us1', :alice, 'x'),
  null, null, 'cannot write a note to myself');

select pg_temp.login(:bob);
select is((select body from seen_notes where id = :'n1'), '你总是先问我累不累', 'the recipient can read it');
insert into seen_note_keeps (note_id) values (:'n1');
with d as (delete from seen_notes where id = :'n1' returning 1)
select is(count(*)::int, 0, 'the recipient cannot delete the author''s note') from d;

select pg_temp.login(:dave);
select is((select count(*)::int from seen_notes where id = :'n1'), 0, 'another member of the same US cannot read it');
select pg_temp.login(:carol);
select is((select count(*)::int from seen_notes where id = :'n1'), 0, 'an outsider cannot read it');

select pg_temp.login(:alice);
select is((select count(*)::int from seen_notes where id = :'n1'), 1, 'the author can read it');
select is((select count(*)::int from seen_note_keeps), 0, 'the author cannot tell whether it was kept');
select throws_ok(format('insert into seen_note_keeps (note_id) values (%L)', :'n1'), '42501', null,
  'only the recipient can keep a note');

select pg_temp.logout();
select * from finish();
rollback;
