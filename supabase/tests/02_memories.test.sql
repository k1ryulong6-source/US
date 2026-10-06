-- Phase (b): memories, memory_media and the private media bucket.
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

\set alice    '''a0000000-0000-4000-8000-00000000000a'''
\set bob      '''b0000000-0000-4000-8000-00000000000b'''
\set carol    '''c0000000-0000-4000-8000-00000000000c'''
\set dave     '''d0000000-0000-4000-8000-00000000000d'''
\set guest2   '''e0000000-0000-4000-8000-0000000000e2'''

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (:alice, 'alice@pgtap.test', false, '{"display_name":"Alice"}'),
  (:bob,   'bob@pgtap.test',   false, '{"display_name":"Bob"}'),
  (:carol, 'carol@pgtap.test', false, '{"display_name":"Carol"}'),
  (:dave,  'dave@pgtap.test',  false, '{"display_name":"Dave"}'),
  (:guest2, null,               true,  '{}');

-- US1: alice + bob (+ dave, who will leave). US2: carol + guest2.
select pg_temp.login(:alice);
select create_us('我们') as us1 \gset
select create_invitation(:'us1') as inv_b \gset
select create_invitation(:'us1') as inv_d \gset
select pg_temp.login(:bob);
select accept_invitation(:'inv_b') is not null as ok \gset
select pg_temp.login(:dave);
select accept_invitation(:'inv_d') is not null as ok \gset
select pg_temp.login(:carol);
select create_us('Carol 家') as us2 \gset
select create_invitation(:'us2') as inv_g \gset
select pg_temp.login(:guest2);
select accept_invitation(:'inv_g') is not null as ok \gset

-- ------------------------------------------------------------ memories --
select pg_temp.login(:alice);
insert into memories (us_id, body, happened_on, place)
values (:'us1', '第一次一起去镰仓', '2019-05-02', '镰仓')
returning id as m1 \gset
select is((select author_id from memories where id = :'m1'), :alice::uuid, 'author is set from the session');

select pg_temp.login(:dave);
insert into memories (us_id, body) values (:'us1', 'dave 的回忆') returning id as m_dave \gset
select lives_ok(format('select leave_us(%L, %L)', :'us1', 'keep'), 'dave leaves, keeping his content');

select pg_temp.login(:bob);
select is((select count(*)::int from memories where us_id = :'us1'), 2, 'bob sees both memories in US1');
select is((select body from memories where id = :'m_dave'), 'dave 的回忆', 'content of a member who left (keep) stays visible');
with u as (update memories set body = 'bob was here' where id = :'m1' returning 1)
select is(count(*)::int, 0, 'bob cannot edit alice''s memory') from u;
select throws_ok(format('insert into memories (us_id, author_id, body) values (%L, %L, %L)', :'us1', :alice, 'x'),
  '42501', null, 'cannot write a memory in someone else''s name');
select throws_ok(format('select delete_memory(%L)', :'m1'), 'P0002', null, 'bob cannot delete alice''s memory');
select throws_ok(format('delete from memories where id = %L', :'m1'), '42501', null, 'no direct deletes on memories');

select pg_temp.login(:carol);
select is((select count(*)::int from memories where id = :'m1'), 0, 'carol cannot read US1 memories by id');
select throws_ok(format('insert into memories (us_id, body) values (%L, %L)', :'us1', 'x'), '42501', null,
  'carol cannot write into US1');

select pg_temp.login(:guest2);
select is((select count(*)::int from memories where us_id = :'us1'), 0, 'guest of US2 cannot read US1 memories');

select pg_temp.login(:dave);
select is((select count(*)::int from memories where id = :'m1'), 0, 'dave (left) cannot read others'' memories');
select is((select count(*)::int from memories where id = :'m_dave'), 1, 'dave can still read what he wrote (for export)');
select throws_ok(format('insert into memories (us_id, body) values (%L, %L)', :'us1', 'x'), '42501', null,
  'dave (left) cannot add memories');

select pg_temp.login(:alice);
select throws_ok(format('update memories set us_id = %L where id = %L', :'us2', :'m1'), '42501', null,
  'a memory cannot be moved to another US');
select lives_ok(format('update memories set body = %L where id = %L', '镰仓的海', :'m1'), 'alice edits her memory');

-- ---------------------------------------------------------------- media --
select pg_temp.login(:alice);
select :'us1' || '/' || :'m1' || '/photo.jpg' as p_ok \gset
select lives_ok(
  format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'media', :'p_ok', :alice),
  'alice uploads into her own memory folder');
select lives_ok(
  format('insert into memory_media (memory_id, kind, storage_path, mime) values (%L, %L, %L, %L)',
    :'m1', 'image', :'p_ok', 'image/jpeg'),
  'alice attaches it');
select is((select us_id from memory_media where storage_path = :'p_ok'), :'us1'::uuid, 'us_id is copied from the memory');
select throws_ok(
  format('insert into memory_media (memory_id, kind, storage_path, mime) values (%L, %L, %L, %L)',
    :'m1', 'image', :'us2' || '/' || :'m1' || '/x.jpg', 'image/jpeg'),
  '42501', null, 'media path must sit under its own US/memory');
select lives_ok(
  format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'media', :'us1' || '/' || :'m1' || '/orphan.jpg', :alice),
  'an upload without a memory_media row...');

select pg_temp.login(:bob);
select is((select count(*)::int from storage.objects where name = :'p_ok'), 1, 'bob can read the attached photo');
select is((select count(*)::int from storage.objects where name like '%/orphan.jpg'), 0,
  '...is not readable by anyone else');
select throws_ok(
  format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'media', :'us1' || '/' || :'m1' || '/bob.jpg', :bob),
  '42501', null, 'bob cannot upload into alice''s memory');
select throws_ok(
  format('insert into memory_media (memory_id, kind, storage_path, mime) values (%L, %L, %L, %L)',
    :'m1', 'image', :'p_ok', 'image/jpeg'),
  '42501', null, 'bob cannot attach media to alice''s memory');
with d as (delete from memory_media where storage_path = :'p_ok' returning 1)
select is(count(*)::int, 0, 'bob cannot detach alice''s media') from d;
-- the Storage API sets this flag for its own deletes; RLS still applies
select set_config('storage.allow_delete_query', 'true', true) is not null as ok \gset
with d as (delete from storage.objects where name = :'p_ok' returning 1)
select is(count(*)::int, 0, 'bob cannot delete alice''s file') from d;

select pg_temp.login(:carol);
select is((select count(*)::int from storage.objects where bucket_id = 'media'), 0, 'carol sees no US1 files');
select is((select count(*)::int from memory_media where us_id = :'us1'), 0, 'carol sees no US1 media rows');
select throws_ok(
  format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'media', :'us1' || '/' || :'m1' || '/c.jpg', :carol),
  '42501', null, 'carol cannot upload into US1');
select throws_ok(
  format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
    'media', 'not-a-uuid/whatever/c.jpg', :carol),
  '42501', null, 'malformed paths are refused, not errors');

select pg_temp.login(:dave);
select is((select count(*)::int from storage.objects where name = :'p_ok'), 0, 'dave (left) cannot read US1 files');

-- --------------------------------------------------------------- delete --
select pg_temp.login(:alice);
select is((select count(*)::int from storage.objects where name like '%/orphan.jpg'), 1,
  'the uploader can still see (and so delete) their own unattached file');
select is(delete_memory(:'m1'), array[:'p_ok'], 'deleting returns the files to clean up');
select is((select count(*)::int from memories where id = :'m1'), 0, 'memory with nobody else''s words is gone');
select pg_temp.login(:bob);
select is((select count(*)::int from storage.objects where name = :'p_ok'), 0, 'its file is no longer readable by others');
select pg_temp.login(:alice);

-- --------------------------------------------------------------- closed --
select propose(:'us1', 'state', '{"state":"closed"}') as p \gset
select pg_temp.login(:bob);
select respond_to_proposal(:'p', 'accept') = 'applied' as ok \gset
select throws_ok(format('insert into memories (us_id, body) values (%L, %L)', :'us1', 'x'), '42501', null,
  'no new memories once closed');
select is((select count(*)::int from memories where us_id = :'us1'), 1, 'history stays readable once closed');

select pg_temp.logout();
select * from finish();
rollback;
