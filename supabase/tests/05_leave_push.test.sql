-- Phase (e): leaving with "带走我的内容", and push subscriptions.
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

insert into auth.users (id, email, raw_user_meta_data) values
  (:alice, 'alice@pgtap.test', '{"display_name":"Alice"}'),
  (:bob,   'bob@pgtap.test',   '{"display_name":"Bob"}');

select pg_temp.login(:alice);
select create_us('我们') as us1 \gset
select create_invitation(:'us1') as inv \gset
select pg_temp.login(:bob);
select accept_invitation(:'inv') is not null as ok \gset

-- alice's content
select pg_temp.login(:alice);
insert into memories (us_id, body) values (:'us1', 'alice 的回忆') returning id as ma \gset
insert into seen_notes (us_id, to_id, body) values (:'us1', :bob, '写给 bob') returning id as n_a \gset

-- bob's content
select pg_temp.login(:bob);
insert into memories (us_id, body) values (:'us1', 'bob 的回忆，没人写过') returning id as mb1 \gset
insert into memories (us_id, body) values (:'us1', 'bob 的回忆，alice 写过') returning id as mb2 \gset
select :'us1' || '/' || :'mb1' || '/a.jpg' as mb1_file \gset
insert into storage.objects (bucket_id, name, owner_id) values ('media', :'mb1_file', :bob);
insert into memory_media (memory_id, kind, storage_path, mime) values (:'mb1', 'image', :'mb1_file', 'image/jpeg');
select :'us1' || '/' || :'ma' || '/p/bob.m4a' as bob_clip \gset
insert into storage.objects (bucket_id, name, owner_id) values ('media', :'bob_clip', :bob);
insert into perspectives (memory_id, body, audio_path, audio_mime) values (:'ma', 'bob 的版本', :'bob_clip', 'audio/mp4');
insert into seen_notes (us_id, to_id, body) values (:'us1', :alice, '写给 alice');
insert into intentions (us_id, body, visibility) values (:'us1', 'bob 的计划', 'shared');
insert into intentions (us_id, body) values (:'us1', 'bob 的秘密');

select pg_temp.login(:alice);
insert into perspectives (memory_id, body) values (:'mb2', 'alice 记得的');

-- close the US first: leaving and taking your content must still work
select propose(:'us1', 'state', '{"state":"closed"}') as p \gset
select pg_temp.login(:bob);
select respond_to_proposal(:'p', 'accept') = 'applied' as ok \gset

select set_config('test.paths', array_to_string(leave_us(:'us1', 'remove'), ','), true) is not null as ok \gset
select is(string_to_array(current_setting('test.paths'), ',')::text[] @> array[:'mb1_file', :'bob_clip'], true,
  'leaving with "remove" returns my files to clean up');

select pg_temp.login(:alice);
select is((select count(*)::int from memories where id = :'mb1'), 0, 'bob''s memory nobody else wrote on is gone');
select is((select author_removed from memories where id = :'mb2'), true, 'bob''s memory alice wrote on is a shell');
select is((select body from memories where id = :'mb2'), '', '...without bob''s words');
select is((select body from perspectives where memory_id = :'mb2'), 'alice 记得的', 'alice''s perspective survives');
select is((select count(*)::int from perspectives where author_id = :bob), 0, 'bob''s perspectives are gone');
select is((select count(*)::int from seen_notes where from_id = :bob), 0, 'notes bob wrote are gone');
select is((select count(*)::int from seen_notes where id = :'n_a'), 1, 'the note alice wrote to bob stays hers');
select is((select count(*)::int from intentions where author_id = :bob), 0, 'bob''s shared plan is gone');
select is((select body from memories where id = :'ma'), 'alice 的回忆', 'alice''s memory is untouched');
select is((select count(*)::int from storage.objects where name in (:'mb1_file', :'bob_clip')), 0,
  'bob''s files are no longer readable by alice');

select pg_temp.login(:bob);
select is((select count(*)::int from storage.objects where name in (:'mb1_file', :'bob_clip')), 2,
  'bob can still see his own files, so the app can delete them from storage');

-- ---------------------------------------------------------- push --
select pg_temp.login(:alice);
insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/alice', 'k', 'a');
select pg_temp.login(:bob);
select is((select count(*)::int from push_subscriptions), 0, 'bob cannot see alice''s push subscription');
select throws_ok(format('insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (%L, %L, %L, %L)',
  :alice, 'https://push.example/x', 'k', 'a'), '42501', null, 'cannot subscribe someone else');
with d as (delete from push_subscriptions returning 1)
select is(count(*)::int, 0, 'cannot delete someone else''s subscription') from d;

select pg_temp.logout();
select * from finish();
rollback;
