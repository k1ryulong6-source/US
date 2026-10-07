// Moving to another device with a code, wet marks for what's new to you, 那年今天,
// and proposals that pass after 14 quiet days.
import { execSync } from 'node:child_process';
import { BASE, launch, phone, createUs, inviteLink, joinAsGuest, sleep } from './lib.mjs';

const sql = (q) =>
  execSync(`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -qAtc "${q}"`).toString().trim();
const errors = [];
const browser = await launch();
const step = (s) => process.stdout.write(`  ${s}\n`);

// A guest starts on one device (say, Safari)
const a = await phone(browser, errors, 'A');
await a.goto(BASE + '/');
await a.waitForURL(/login/);
await a.getByRole('button', { name: '开始', exact: true }).click();
await a.getByText('大家怎么称呼你？').waitFor();
await a.fill('input', '搬家的人');
await a.click('button.primary');
await a.getByRole('link', { name: 'US', exact: true }).waitFor();
const us = await createUs(a, '试一试');
const who = sql(`select id from profiles where display_name = '搬家的人'`);

// …and moves to another (say, the home-screen app)
await a.goto(`${BASE}/me`);
await a.getByRole('button', { name: '换到另一台设备' }).click();
await a.getByRole('button', { name: '生成换设备码' }).click();
await a.waitForURL(/login/);
const code = (await a.locator('.move-code').innerText()).trim();
if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) throw new Error('odd code ' + code);
step('code shown on the old device');

const b = await phone(browser, errors, 'B');
await b.goto(BASE + '/login');
await b.click('text=我有换设备码');
await b.fill('input.move-input', 'wrong-code');
await b.click('text=换过来');
await b.getByText('这个码不对，或者已经过期了。').waitFor();
await b.fill('input.move-input', code.toLowerCase());
await b.click('text=换过来');
await b.getByRole('link', { name: 'US', exact: true }).waitFor();
await b.locator('.us-wash-name', { hasText: '试一试' }).waitFor();
const bUser = await b.evaluate(() => JSON.parse(localStorage.getItem('us-auth')).user.id);
if (bUser !== who) throw new Error('the new device is someone else');
step('the new device is the same person');

await a.getByText('已经换过去了。这台设备上不再有你的身份。').waitFor({ timeout: 15000 });
if (await a.evaluate(() => localStorage.getItem('us-auth'))) throw new Error('old device kept a session');
step('the old device let go');

// changing your mind gives the session back
await b.goto(`${BASE}/me`);
await b.getByRole('button', { name: '换到另一台设备' }).click();
await b.getByRole('button', { name: '生成换设备码' }).click();
await b.waitForURL(/login/);
await b.click('text=不换了，回到这里');
await b.locator('.us-wash-name', { hasText: '试一试' }).waitFor();
step('cancelling brings you back');

// someone else joins and adds a memory while B is away
await b.goto(`${BASE}/us/${us}`); // first visit: nothing is new yet
await b.locator('.today').waitFor();
await sleep(800);
const link = await inviteLink(b, us);
const c = await phone(browser, errors, 'C');
await joinAsGuest(c, link, '小周');
await c.close();
const cid = sql(`select id from profiles where display_name = '小周'`);
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const twoYearsAgo = `${now.getFullYear() - 2}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
sql(`insert into memories (us_id, author_id, body, happened_on) values ('${us}', '${cid}', '你走之后写的', current_date);
  insert into memories (us_id, author_id, body, happened_on, happened_precision, created_at)
  values ('${us}', '${cid}', '两年前的今天', '${twoYearsAgo}', 'day', now() - interval '2 years');`);

await b.goto(BASE + '/');
await b.locator('.us-wash-name', { hasText: '有你还没看过的' }).waitFor();
await b.goto(`${BASE}/us/${us}`);
await b.locator('.run-row.fresh', { hasText: '你走之后写的' }).waitFor();
if ((await b.locator('.run-row.fresh').count()) !== 1) throw new Error('only the new memory is wet');
step('what is new is wet');
await b.locator('.on-this-day', { hasText: `那年今天 · ${now.getFullYear() - 2}` }).waitFor();
await b.locator('.on-this-day', { hasText: '两年前的今天' }).waitFor();
step('那年今天 surfaces');
await b.reload();
await b.locator('.run-row').first().waitFor();
await sleep(800);
if (await b.locator('.run-row.fresh').count()) throw new Error('it should have dried');
step('and it dries after the visit');

// a proposal nobody declines takes effect after 14 days
await b.goto(`${BASE}/us/${us}/about`);
await b.getByRole('button', { name: '换一个名字' }).click();
await b.fill('input[placeholder="新名字"]', '三个人');
await b.click('text=提出来');
await b.getByText('前没有人婉拒，就会生效。').waitFor();
sql(`update proposals set created_at = now() - interval '15 days' where us_id = '${us}' and status = 'pending'`);
await b.goto(`${BASE}/us/${us}`);
await b.locator('.us-title', { hasText: '三个人' }).waitFor();
step('14 quiet days count as agreement');

await browser.close();
console.log('errors:', errors.length ? errors : 'none');
