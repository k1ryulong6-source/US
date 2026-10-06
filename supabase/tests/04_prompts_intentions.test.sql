-- Phase (d): weekly prompt and intentions ("想做的事").
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

insert into auth.users (id, email, raw_user_meta_data) values
  (:alice, 'alice@example.com', '{"display_name":"Alice"}'),
  (:bob,   'bob@example.com',   '{"display_name":"Bob"}'),
  (:carol, 'carol@example.com', '{"display_name":"Carol"}'),
  (:dave,  'dave@example.com',  '{"display_name":"Dave"}');

select pg_temp.login(:alice);
select create_us('我们') as us1 \gset
select create_invitation(:'us1') as i1 \gset
select create_invitation(:'us1') as i2 \gset
select pg_temp.login(:bob);
select accept_invitation(:'i1') is not null as ok \gset
select pg_temp.login(:dave);
select accept_invitation(:'i2') is not null as ok \gset
select pg_temp.login(:carol);
select create_us('Carol') is not null as ok \gset

-- --------------------------------------------------------------- prompt --
select pg_temp.login(:alice);
select is((select count(*)::int from my_weekly_prompt()), 1, 'exactly one question this week');
select is((select count(*)::int from prompts), 40, 'the bank holds 40 questions');
select ok((select count(*) from prompts where kind = 'seen') between 5 and 10, 'a few are "我看见的你" questions');

-- ------------------------------------------------------- private intention --
insert into intentions (us_id, body, prompt_id) values (:'us1', '给 bob 写张感谢卡', 1)
returning id as i_priv \gset
select is((select visibility from intentions where id = :'i_priv'), 'private'::intention_visibility,
  '"只有我知道" is the default');

select pg_temp.login(:bob);
select is((select count(*)::int from intentions where id = :'i_priv'), 0, 'bob cannot see alice''s private intention');
select throws_ok(format('select complete_intention(%L)', :'i_priv'), 'P0002', null,
  'bob cannot complete it either (and learns nothing about it)');
select pg_temp.login(:carol);
select is((select count(*)::int from intentions), 0, 'carol sees no intentions');

-- ------------------------------------------------------- shared intention --
select pg_temp.login(:alice);
insert into intentions (us_id, body, visibility) values (:'us1', '一起去爬一次山', 'shared')
returning id as i_shared \gset
select throws_ok(format('update intentions set status = %L where id = %L', 'done', :'i_shared'), '42501', null,
  'status only changes through the functions');
select throws_ok(format('select complete_intention(%L, null, %L)', :'i_shared', '只给自己'), '22023', null,
  'a private note cannot be attached to a shared plan');

select pg_temp.login(:bob);
select is((select body from intentions where id = :'i_shared'), '一起去爬一次山', 'bob sees the shared plan');
with u as (update intentions set body = 'x' where id = :'i_shared' returning 1)
select is(count(*)::int, 0, 'bob cannot rewrite alice''s plan') from u;
select throws_ok(format('select set_intention_status(%L, %L)', :'i_shared', 'let_go'), 'P0002', null,
  'only the author can let a plan go');
insert into memories (us_id, body) values (:'us1', '山顶的风') returning id as m_bob \gset
select lives_ok(format('select complete_intention(%L, %L)', :'i_shared', :'m_bob'),
  'any member can mark a shared plan done, with their memory');
select is((select memory_id from intentions where id = :'i_shared'), :'m_bob'::uuid, 'the memory is linked');
select throws_ok(format('select complete_intention(%L)', :'i_shared'), '55000', null, 'cannot complete twice');

select pg_temp.login(:dave);
select is((select count(*)::int from intentions where id = :'i_shared'), 1, 'dave sees the shared plan');
select leave_us(:'us1') is null as ok \gset
select is((select count(*)::int from intentions where id = :'i_shared'), 0, 'dave (left) no longer sees it');

-- ------------------------------------------------ completing a private one --
select pg_temp.login(:alice);
select throws_ok(format('select complete_intention(%L, %L)', :'i_priv', :'m_bob'), 'P0002', null,
  'cannot link someone else''s memory');
select lives_ok(format('select complete_intention(%L, null, %L)', :'i_priv', '他笑了很久'),
  'alice completes her private intention with a line for herself');
select is((select done_note from intentions where id = :'i_priv'), '他笑了很久', 'the note is kept');
select lives_ok(format('select set_intention_status(%L, %L)', :'i_priv', 'open'), 'and can reopen it');
select is((select done_note from intentions where id = :'i_priv'), null, 'reopening clears the note');
select lives_ok(format('select set_intention_status(%L, %L)', :'i_priv', 'let_go'), '"放下" is always allowed');

-- --------------------------------------------------------------- closed --
select propose(:'us1', 'state', '{"state":"closed"}') as p \gset
select pg_temp.login(:bob);
select respond_to_proposal(:'p', 'accept') = 'applied' as ok \gset
select throws_ok(format('insert into intentions (us_id, body) values (%L, %L)', :'us1', 'x'), '42501', null,
  'no new intentions once closed');

select pg_temp.logout();
select * from finish();
rollback;
