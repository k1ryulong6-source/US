-- Personal colours: only you can set yours, only to a palette pigment,
-- and only people who share a US with you can see it.
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

\set ann      '''a6000000-0000-4000-8000-00000000000a'''
\set ben      '''b6000000-0000-4000-8000-00000000000b'''
\set outsider '''f6000000-0000-4000-8000-00000000000f'''

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (:ann,      'ann@pgtap.test', false, '{"display_name":"Ann"}'),
  (:ben,      'ben@pgtap.test', false, '{"display_name":"Ben"}'),
  (:outsider, null,             true,  '{}');

select pg_temp.login(:ann);
select create_us('两个人') as us \gset
select create_invitation(:'us') as inv \gset
select pg_temp.login(:ben);
select accept_invitation(:'inv');

select pg_temp.login(:ann);
select is((select color from profiles where id = :ann), null, 'no colour until one is chosen');
select lives_ok($$update profiles set color = '#2779BE' where id = auth.uid()$$, 'you can choose your own colour');
select is((select color from profiles where id = :ann), '#2779BE', 'and it is stored');
select throws_ok($$update profiles set color = '#123456' where id = auth.uid()$$, '23514', null,
  'only palette pigments are allowed');
update profiles set color = '#D2493C' where id = :ben;
select pg_temp.login(:ben);
select is((select color from profiles where id = :ben), null, 'you cannot change someone else''s colour');
select is((select color from profiles where id = :ann), '#2779BE', 'co-members see your colour');

select pg_temp.login(:outsider);
select is((select count(*)::int from profiles where id = :ann), 0, 'people outside your US cannot see it');

select * from finish();
rollback;
