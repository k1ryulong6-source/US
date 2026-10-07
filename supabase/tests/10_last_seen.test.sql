-- Wet marks only you see: what others added since your last visit, never who saw what.
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

\set ann      '''aa100000-0000-4000-8000-00000000000a'''
\set ben      '''ba100000-0000-4000-8000-00000000000b'''
\set outsider '''fa100000-0000-4000-8000-00000000000f'''

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (:ann,      'ann@seen.test', false, '{"display_name":"Ann"}'),
  (:ben,      'ben@seen.test', false, '{"display_name":"Ben"}'),
  (:outsider, 'out@seen.test', false, '{}');

select pg_temp.login(:ann);
select create_us('两个人') as us \gset
select create_invitation(:'us') as inv \gset
select pg_temp.login(:ben);
select accept_invitation(:'inv');

-- an old memory, from before anyone visited
reset role;
insert into memories (us_id, author_id, body, created_at) values (:'us', :ben, '很久以前', now() - interval '3 days');

select pg_temp.login(:ann);
select is(visit_us(:'us'), '{}'::uuid[], 'the first visit marks nothing as new');
select is((select count(*)::int from us_with_news()), 0, 'and home shows nothing new');

-- Ben adds a memory, and Ann adds one of her own
reset role;
update us_last_seen set seen_at = now() - interval '1 hour' where user_id = :ann;
insert into memories (us_id, author_id, body) values (:'us', :ben, 'Ben 写的') returning id as m_ben \gset
insert into memories (us_id, author_id, body) values (:'us', :ann, 'Ann 写的');

select pg_temp.login(:ann);
select is((select array_agg(x) from us_with_news() x), array[:'us'::uuid], 'home knows there is something new here');
select is(visit_us(:'us'), array[:'m_ben'::uuid], 'what someone else added is new; what I added is not');
select is((select count(*)::int from us_with_news()), 0, 'after the visit it has dried');
select is(visit_us(:'us'), '{}'::uuid[], 'and the next visit finds nothing new');

-- a version Ben writes on Ann's memory counts; a private one does not
-- (now() is fixed inside this test's transaction, so earlier rows are moved back in time)
reset role;
update memories set created_at = now() - interval '2 hours' where us_id = :'us';
update us_last_seen set seen_at = now() - interval '1 hour' where user_id = :ann;
insert into memories (us_id, author_id, body, created_at) values (:'us', :ann, '我的回忆', now() - interval '2 days')
  returning id as m_ann \gset
insert into perspectives (memory_id, us_id, author_id, body, is_private) values (:'m_ann', :'us', :ben, '我记得的版本', false);
select pg_temp.login(:ann);
select is(visit_us(:'us'), array[:'m_ann'::uuid], 'someone''s new version makes that memory new');

reset role;
update perspectives set created_at = now() - interval '2 hours' where us_id = :'us';
update us_last_seen set seen_at = now() - interval '1 hour' where user_id = :ann;
insert into perspectives (memory_id, us_id, author_id, body, is_private) values (:'m_ben', :'us', :ben, '只给自己', true);
select pg_temp.login(:ann);
select is(visit_us(:'us'), '{}'::uuid[], 'a private note is nobody''s news');

-- nobody can read when anyone last came by
select throws_ok($$select * from us_last_seen$$, '42501', null, 'last visits cannot be read, not even your own');
select pg_temp.login(:ben);
select throws_ok($$select * from us_last_seen$$, '42501', null, 'nor anyone else''s');

select pg_temp.login(:outsider);
select throws_ok(format('select visit_us(%L)', :'us'), null, null, 'only members can visit');

select * from finish();
