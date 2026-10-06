-- US · phase (d): the weekly question and "想做的事" (intentions).
--
-- Each person gets their own question each week: the bank is walked in
-- order, starting at an offset derived from the user id, advancing once a
-- week (Monday, Asia/Shanghai). Not daily, never repeated as a nag.
--
-- Intentions are "只有我知道" (private: author only, never hinted to
-- anyone) or "我们一起" (shared: visible to current members). Completing one
-- can create a memory; that link lives on the intention row, so a private
-- intention never reveals that a memory came from it.

create type public.prompt_kind as enum ('general', 'seen');
create type public.intention_visibility as enum ('private', 'shared');
create type public.intention_status as enum ('open', 'done', 'let_go');

create table public.prompts (
  id       integer primary key,
  body     text not null,
  kind     public.prompt_kind not null default 'general',
  position integer not null unique,
  active   boolean not null default true
);

create table public.intentions (
  id         uuid primary key default gen_random_uuid(),
  us_id      uuid not null references public.us_spaces (id) on delete cascade,
  author_id  uuid default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  visibility public.intention_visibility not null default 'private',
  status     public.intention_status not null default 'open',
  done_at    timestamptz,
  memory_id  uuid references public.memories (id) on delete set null,
  -- "只留一句给自己" — only on private intentions, so it is never shared
  done_note  text check (char_length(done_note) <= 2000),
  prompt_id  integer references public.prompts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (done_note is null or visibility = 'private')
);
create index intentions_us_idx on public.intentions (us_id, status);
create index intentions_author_idx on public.intentions (author_id, status);

create trigger intentions_touch before update on public.intentions
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.prompts    enable row level security;
alter table public.intentions enable row level security;

create policy "prompts: readable when signed in" on public.prompts
  for select to authenticated using (active);

create policy "intentions: mine, or shared with my US" on public.intentions
  for select to authenticated
  using (author_id = auth.uid() or (visibility = 'shared' and private.is_active_member(us_id)));

create policy "intentions: write my own while open" on public.intentions
  for insert to authenticated
  with check (author_id = auth.uid() and private.is_active_member(us_id) and private.us_is_open(us_id));

create policy "intentions: edit my own while open" on public.intentions
  for update to authenticated
  using (author_id = auth.uid() and private.is_active_member(us_id) and private.us_is_open(us_id))
  with check (author_id = auth.uid() and (done_note is null or visibility = 'private'));

create policy "intentions: delete my own while open" on public.intentions
  for delete to authenticated
  using (author_id = auth.uid() and private.is_active_member(us_id) and private.us_is_open(us_id));

revoke all on public.prompts, public.intentions from anon, authenticated;
grant select on public.prompts to authenticated;
grant select, delete on public.intentions to authenticated;
grant insert (us_id, body, visibility, prompt_id) on public.intentions to authenticated;
grant update (body, visibility) on public.intentions to authenticated;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

create function public.my_weekly_prompt()
returns setof public.prompts
language sql stable security definer set search_path = ''
as $$
  with bank as (
    select p.*, row_number() over (order by p.position) - 1 as idx, count(*) over () as n
    from public.prompts p
    where p.active
  ),
  -- whole weeks since Monday 2024-01-01, in China/Japan local time
  week as (
    select ((now() at time zone 'Asia/Shanghai')::date - date '2024-01-01') / 7 as w
  )
  select b.id, b.body, b.kind, b.position, b.active
  from bank b, week
  where auth.uid() is not null
    and b.idx = (week.w + abs(hashtext(auth.uid()::text)::bigint)) % b.n;
$$;

-- Mark an intention done. The author can always; for a shared intention any
-- current member can (it was a plan for all of us). Optionally link a memory
-- I just wrote in the same US, or (private only) keep a line for myself.
create function public.complete_intention(
  p_intention uuid,
  p_memory uuid default null,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_i    public.intentions%rowtype;
begin
  select * into v_i from public.intentions where id = p_intention for update;
  if not found
     or not (v_i.author_id = v_user or v_i.visibility = 'shared')
     or not private.is_active_member(v_i.us_id) then
    raise exception 'intention not found' using errcode = 'P0002';
  end if;
  perform private.require_open(v_i.us_id);
  if v_i.status <> 'open' then
    raise exception 'already settled' using errcode = '55000';
  end if;

  if p_memory is not null and not exists (
    select 1 from public.memories m
    where m.id = p_memory and m.us_id = v_i.us_id and m.author_id = v_user
  ) then
    raise exception 'memory not found' using errcode = 'P0002';
  end if;

  if nullif(btrim(p_note), '') is not null and (v_i.visibility <> 'private' or v_i.author_id <> v_user) then
    raise exception 'a private note belongs on a private intention' using errcode = '22023';
  end if;

  update public.intentions
  set status = 'done', done_at = now(), memory_id = p_memory, done_note = nullif(btrim(p_note), '')
  where id = p_intention;
end;
$$;

-- "放下" (let go) or reopen. Only the author decides about their intention.
create function public.set_intention_status(p_intention uuid, p_status public.intention_status)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_i    public.intentions%rowtype;
begin
  if p_status = 'done' then
    raise exception 'use complete_intention' using errcode = '22023';
  end if;
  select * into v_i from public.intentions where id = p_intention for update;
  if not found or v_i.author_id <> v_user then
    raise exception 'intention not found' using errcode = 'P0002';
  end if;
  perform private.require_member(v_i.us_id);
  perform private.require_open(v_i.us_id);
  update public.intentions
  set status = p_status,
      done_at = null,
      memory_id = case when p_status = 'open' then null else memory_id end,
      done_note = case when p_status = 'open' then null else done_note end
  where id = p_intention;
end;
$$;

revoke all on function public.my_weekly_prompt(),
  public.complete_intention(uuid, uuid, text),
  public.set_intention_status(uuid, public.intention_status)
  from public, anon;
grant execute on function public.my_weekly_prompt(),
  public.complete_intention(uuid, uuid, text),
  public.set_intention_status(uuid, public.intention_status)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The question bank. "seen" prompts are spread through the list so they come
-- up roughly once a month for each person.
-- ---------------------------------------------------------------------------

insert into public.prompts (id, body, kind, position) values
  (1,  '有没有一件事，你一直想感谢某个人？', 'general', 1),
  (2,  '有没有一个人，你很久没有认真听 TA 说话了？', 'general', 2),
  (3,  '有没有一个你答应过、却还没做到的小约定？', 'general', 3),
  (4,  '有没有谁最近过得不太容易，也许在等你问一声？', 'general', 4),
  (5,  '最近你在 TA 身上看见了什么好？', 'seen', 5),
  (6,  '上一次和家人好好吃一顿饭，是什么时候？', 'general', 6),
  (7,  '有没有一个人，你想约 TA 出来走走？', 'general', 7),
  (8,  '有没有一句"对不起"，一直放在心里？', 'general', 8),
  (9,  '有没有一个只属于你们的地方，好久没一起去了？', 'general', 9),
  (10, '有没有一个瞬间，你觉得 TA 很了不起？', 'seen', 10),
  (11, '有没有一件小事，可以让某个人今天轻松一点？', 'general', 11),
  (12, '你想给谁打一个不为什么的电话？', 'general', 12),
  (13, '有没有一个老朋友，你常常想起，却很少联系？', 'general', 13),
  (14, '有没有一件你们说过"以后一起做"的事？', 'general', 14),
  (15, '最近 TA 做的哪件小事，让你记住了？', 'seen', 15),
  (16, '有没有谁的生日或纪念日快到了？', 'general', 16),
  (17, '有没有一个人，你想为 TA 做一顿饭？', 'general', 17),
  (18, '有没有谁教会过你一件事，你还没告诉过 TA？', 'general', 18),
  (19, '有没有一张旧照片，你想发给照片里的人？', 'general', 19),
  (20, 'TA 身上有什么，是你一直欣赏却没说出口的？', 'seen', 20),
  (21, '有没有一个人，你想陪 TA 安静地待一会儿？', 'general', 21),
  (22, '有没有一件事，你想和某个人再一起做一次？', 'general', 22),
  (23, '有没有谁一直在默默照顾你？', 'general', 23),
  (24, '这周，你想把一点时间留给谁？', 'general', 24),
  (25, '有没有一个时刻，你觉得被 TA 照顾到了？', 'seen', 25),
  (26, '有没有一个你欠了很久的回信或回电？', 'general', 26),
  (27, '有没有一个人，你想问问 TA 最近在想什么？', 'general', 27),
  (28, '有没有谁的一个小愿望，你可以帮 TA 实现？', 'general', 28),
  (29, '有没有一个你们之间的玩笑，好久没提起了？', 'general', 29),
  (30, '最近 TA 有没有哪里，比以前更勇敢了？', 'seen', 30),
  (31, '有没有一件事，你想当面告诉某个人，而不是发消息？', 'general', 31),
  (32, '有没有一个人，你想带 TA 去你喜欢的地方？', 'general', 32),
  (33, '有没有谁让你觉得，被理解是一件很好的事？', 'general', 33),
  (34, '有没有一个人，你想写一封信给 TA？', 'general', 34),
  (35, 'TA 的哪一个习惯，让你觉得很安心？', 'seen', 35),
  (36, '有没有一个周末的下午，可以留给一个人？', 'general', 36),
  (37, '有没有一个人，你想和 TA 一起看一次日落？', 'general', 37),
  (38, '有没有一件你一直想为家人做、却总说"下次"的事？', 'general', 38),
  (39, '有没有一个人，你想告诉 TA："有你真好"？', 'general', 39),
  (40, '如果要告诉 TA 一件你看见的好事，会是什么？', 'seen', 40);
