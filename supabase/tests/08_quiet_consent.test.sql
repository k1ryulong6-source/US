-- A proposal nobody declines within 14 days counts as agreed; any "no" still ends it.
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

\set ann      '''a8100000-0000-4000-8000-00000000000a'''
\set ben      '''b8100000-0000-4000-8000-00000000000b'''
\set cat      '''c8100000-0000-4000-8000-00000000000c'''
\set outsider '''f8100000-0000-4000-8000-00000000000f'''

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (:ann,      'ann@quiet.test', false, '{"display_name":"Ann"}'),
  (:ben,      'ben@quiet.test', false, '{"display_name":"Ben"}'),
  (:cat,      'cat@quiet.test', false, '{"display_name":"Cat"}'),
  (:outsider, 'out@quiet.test', false, '{}');

select pg_temp.login(:ann);
select create_us('三个人') as us \gset
select create_invitation(:'us') as inv \gset
select pg_temp.login(:ben);
select accept_invitation(:'inv');
select pg_temp.login(:ann);
select create_invitation(:'us') as inv2 \gset
select pg_temp.login(:cat);
select accept_invitation(:'inv2');

-- Ann proposes a new name; Ben agrees; Cat never answers
select pg_temp.login(:ann);
select propose(:'us', 'rename', '{"name":"我们"}') as p1 \gset
select pg_temp.login(:ben);
select respond_to_proposal(:'p1', 'accept');

select is(settle_proposals(:'us'), 0, 'a young proposal waits for everyone');
select is((select name from us_spaces where id = :'us'), '三个人', 'nothing changes yet');

-- two weeks of silence
reset role;
update proposals set created_at = now() - interval '14 days 1 minute' where id = :'p1';

select pg_temp.login(:outsider);
select is(settle_proposals(:'us'), 0, 'someone outside cannot settle it');
reset role;
select is((select status::text from proposals where id = :'p1'), 'pending', 'still pending after an outsider tries');

select pg_temp.login(:ben);
select is(settle_proposals(), 1, 'after 14 quiet days, opening the app settles it');
select is((select name from us_spaces where id = :'us'), '我们', 'the silence counted as agreement');
select is((select status::text from proposals where id = :'p1'), 'applied', 'and the proposal is applied');

-- a "no" still ends a proposal, however long it has waited
select pg_temp.login(:ann);
select propose(:'us', 'stage', '{"stage":"家人"}') as p2 \gset
select pg_temp.login(:cat);
select respond_to_proposal(:'p2', 'decline');
reset role;
update proposals set created_at = now() - interval '30 days' where id = :'p2';
select pg_temp.login(:ann);
select is(settle_proposals(:'us'), 0, 'a declined proposal is never settled');
select is((select stage from us_spaces where id = :'us'), null, 'its change never happens');

-- answering an old proposal applies it too
select propose(:'us', 'relabel', '{"preset_label":"friends"}') as p3 \gset
reset role;
update proposals set created_at = now() - interval '15 days' where id = :'p3';
select pg_temp.login(:ben);
select is(respond_to_proposal(:'p3', 'accept')::text, 'applied', 'agreeing to a long-quiet proposal applies it');

select pg_temp.login(:ann);
reset role;
set local role anon;
select throws_ok($$select settle_proposals()$$, '42501', null, 'anonymous visitors cannot call it');

select * from finish();
