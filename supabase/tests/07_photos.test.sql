-- Avatars and relationship photos: who may upload, set and see them.
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

\set ann      '''a7000000-0000-4000-8000-00000000000a'''
\set ben      '''b7000000-0000-4000-8000-00000000000b'''
\set outsider '''f7000000-0000-4000-8000-00000000000f'''

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (:ann,      'ann7@pgtap.test', false, '{"display_name":"Ann"}'),
  (:ben,      'ben7@pgtap.test', false, '{"display_name":"Ben"}'),
  (:outsider, null,              true,  '{}');

select pg_temp.login(:ann);
select create_us('两个人') as us \gset
select create_invitation(:'us') as inv \gset
select pg_temp.login(:ben);
select accept_invitation(:'inv');
select pg_temp.login(:outsider);
select create_us('别处') as other \gset

\set ann_avatar '''avatars/a7000000-0000-4000-8000-00000000000a/me.jpg'''
select format('covers/%s/sea.jpg', :'us') as cover \gset
select format('covers/%s/x.jpg', :'other') as foreign_cover \gset

-- avatars
select pg_temp.login(:ann);
select lives_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'media', :ann_avatar, :ann),
  'you can upload into your own avatar folder');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
  'media', 'avatars/b7000000-0000-4000-8000-00000000000b/fake.jpg', :ann), '42501', null,
  'but not into someone else''s');
select lives_ok(format('update profiles set avatar_path = %L where id = auth.uid()', :ann_avatar), 'you can set your avatar');
select throws_ok($$update profiles set avatar_path = 'avatars/b7000000-0000-4000-8000-00000000000b/fake.jpg' where id = auth.uid()$$,
  '23514', null, 'an avatar must live in your own folder');

select pg_temp.login(:ben);
select is((select count(*)::int from storage.objects where name = :ann_avatar), 1, 'co-members can see your avatar');
select pg_temp.login(:outsider);
select is((select count(*)::int from storage.objects where name = :ann_avatar), 0, 'people outside your US cannot');

-- relationship photo
select pg_temp.login(:ben);
select lives_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)', 'media', :'cover', :ben),
  'any member can upload a photo for the US');
select lives_ok(format('select set_us_cover(%L, %L)', :'us', :'cover'), 'and set it, without asking anyone');
select pg_temp.login(:ann);
select is((select cover_path from us_spaces where id = :'us'), :'cover', 'everyone in the US sees the same photo');
select is((select count(*)::int from storage.objects where name = :'cover'), 1, 'and can load it');
select throws_ok(format('select set_us_cover(%L, %L)', :'us', 'covers/' || :'other' || '/x.jpg'), '23514', null,
  'a US photo must come from that US''s folder');

select pg_temp.login(:outsider);
select is((select count(*)::int from storage.objects where name = :'cover'), 0, 'outsiders cannot load it');
select throws_ok(format('select set_us_cover(%L, null)', :'us'), '42501', null, 'outsiders cannot change it');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
  'media', format('covers/%s/intruder.jpg', :'us'), :outsider), '42501', null, 'or upload into its folder');

select pg_temp.login(:ann);
select lives_ok(format('select set_us_cover(%L, null)', :'us'), 'the photo can be taken away');
select pg_temp.login(:ben);
select is((select count(*)::int from storage.objects where name = :'cover'), 1,
  'the uploader still sees their own file so it can be cleaned up');
select pg_temp.login(:ann);
select is((select count(*)::int from storage.objects where name = :'cover'), 0, 'others no longer can');

select * from finish();
rollback;
