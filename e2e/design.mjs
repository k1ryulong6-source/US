// The watercolour design end to end: colours, avatar, relationship photo, memory with photo,
// perspectives, plans, seen notes. Screenshots of every page at phone size.
import { execSync } from 'node:child_process';
import { BASE, launch, login, createUs, inviteLink, joinAsGuest, resetDb, sleep, SHOTS, FIXTURES } from './lib.mjs';
// software GL in this sandbox is slow: phone-sized viewports at 1x density keep the paint animating
async function phone(browser, errors, tag) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag} ${e.message}`));
  return page;
}
const shots = process.argv[2] ?? SHOTS;
const here = FIXTURES;
const sql = (q) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -qAtc "${q}"`).toString().trim();
await resetDb();
const errors = [];
const browser = await launch();
const a = await phone(browser, errors, 'A');
a.on('console', (m) => m.type() === 'error' && errors.push('A console ' + m.text()));
await login(a, 'lin@example.com', '小林');
const us = await createUs(a, '我们俩');
const link = await inviteLink(a, us);
const b = await phone(browser, errors, 'B');
await joinAsGuest(b, link, '阿蓝');

process.on('unhandledRejection', async (e) => {
  console.log('FAILED', e.message.split('\n')[0]);
  console.log(errors.join('\n'));
  await a.screenshot({ path: `${shots}/fail-a.png` }).catch(() => {});
  await b.screenshot({ path: `${shots}/fail-b.png` }).catch(() => {});
  process.exit(1);
});
const shot = async (page, name) => {
  await sleep(1200);
  await page.screenshot({ path: `${shots}/${name}.png` });
};

// B picks a colour
await b.goto(`${BASE}/me`);
await b.getByRole('radio', { name: '群青' }).click();
await b.getByRole('radio', { name: '群青', checked: true }).waitFor();
if (sql(`select color from profiles where display_name = '阿蓝'`) !== '#2779BE') throw new Error('colour not saved');

await b.goto('about:blank');
// A: avatar from the album
await a.goto(`${BASE}/me`);
await a.getByRole('button', { name: '头像' }).click();
await a.getByRole('dialog', { name: '头像' }).waitFor();
const cam = await a.locator('.sheet input[type=file]').first().getAttribute('capture');
if (cam !== 'user') throw new Error('avatar camera should face the user, got ' + cam);
await a.locator('.sheet input[type=file]').nth(1).setInputFiles(`${here}/photo_wall.jpg`);
await a.locator('.me-photo-hint').waitFor({ state: 'detached' });
if (!sql(`select avatar_path from profiles where display_name = '小林'`).startsWith('avatars/')) throw new Error('avatar not saved');
await shot(a, 'm1-me');
await a.getByRole('button', { name: '头像' }).click();
await shot(a, 'm2-sheet');
await a.getByRole('button', { name: '算了' }).click();

// A: the relationship photo
await a.goto(`${BASE}/us/${us}`);
await a.getByRole('button', { name: '这段关系的照片' }).click();
const cam2 = await a.locator('.sheet input[type=file]').first().getAttribute('capture');
if (cam2 !== 'environment') throw new Error('cover camera should face out, got ' + cam2);
await a.locator('.sheet input[type=file]').nth(1).setInputFiles(`${here}/photo_sea.jpg`);
await a.locator('.cover-wash').waitFor();

// A: a memory with a photo
await a.click('text=留下一段回忆');
await a.locator('.wet-sheet').waitFor();
const formCam = await a.locator('.photo-pick input').first().getAttribute('capture');
if (formCam !== 'environment') throw new Error('memory camera missing');
await a.fill('textarea', '雨下得很突然。我们在便利店门口站了快一个小时，买了两次热饮。\n其实雨小了两次，谁都没提要走。');
await a.fill('input[maxlength="120"]', '便利店门口');
await a.locator('.photo-pick input').nth(1).setInputFiles(`${here}/photo_rain.jpg`);
await a.locator('.pending-item img').first().waitFor();
await shot(a, 'n1-new');
await a.click('button:has-text("留下来")');
await a.waitForURL(/\/m\/[0-9a-f-]{36}$/);
const mid = a.url().split('/m/')[1];
await a.locator('.memory-wash').waitFor();
await shot(a, 'r1-memory-before');

// B writes their version; then A sees both colours
await b.goto(`${BASE}/us/${us}/m/${mid}`);
await b.getByText('你记得的版本是？').waitFor();
await b.fill('textarea', '我记得那天你一直在看玻璃上的水珠，数到第七颗的时候笑了。');
await b.click('button:has-text("写好了")');
await b.getByText('你记得的', { exact: true }).waitFor();
await shot(b, 'r2-memory-after-b');
await b.goto('about:blank');

// more history, plans and notes (written straight into the db; their UI is unchanged)
const alin = sql(`select id from profiles where display_name = '小林'`);
const blan = sql(`select id from profiles where display_name = '阿蓝'`);
sql(`insert into memories (us_id, author_id, body, happened_on, happened_precision) values
  ('${us}', '${blan}', '她说那句话，我记了三年。', '2026-08-02', 'day'),
  ('${us}', '${alin}', '第一次一起做饭，盐放了两次。', '2026-09-14', 'day'),
  ('${us}', '${alin}', '认识的那天。', '2023-11-12', 'month');
  insert into relationship_history (us_id, from_stage, to_stage, happened_on) values ('${us}', '朋友', '恋人', '2024-04-01');
  insert into intentions (us_id, author_id, body, visibility) values
  ('${us}', '${alin}', '一起去一次京都', 'shared'), ('${us}', '${blan}', '学会她外婆的红烧肉', 'shared');
  insert into seen_notes (us_id, from_id, to_id, body) values
  ('${us}', '${blan}', '${alin}', '你把伞往我这边歪了一路，自己的肩膀湿了。'),
  ('${us}', '${alin}', '${blan}', '你记得我不吃香菜，从来没问过第二次。');`);

await a.goto(`${BASE}/us/${us}`);
await a.locator('.run-row').first().waitFor();
await shot(a, 'u1-us-top');
await a.mouse.wheel(0, 520);
await shot(a, 'u2-us-middle');
await a.mouse.wheel(0, 700);
await shot(a, 'u3-us-bottom');

await a.goto(`${BASE}/us/${us}/m/${mid}`);
await a.locator('.memory-wash').waitFor();
await shot(a, 'r3-memory-a');

await a.goto(`${BASE}/us/${us}/seen`);
await a.locator('.seen-note').first().waitFor();
await shot(a, 's1-seen');
await a.goto(`${BASE}/intentions`);
await a.locator('.intent-row').first().waitFor();
await shot(a, 'i1-intentions');
await a.goto(`${BASE}/`);
await a.locator('.us-wash').first().waitFor();
await shot(a, 'h1-home');

// no WebGL: photos still show, plainly
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const nogl = await ctx.newPage();
await nogl.addInitScript(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return type === 'webgl' ? null : orig.call(this, type, ...rest);
  };
});
await ctx.addCookies(await a.context().cookies());
const state = await a.evaluate(() => JSON.stringify(localStorage));
await nogl.goto(BASE + '/login');
await nogl.evaluate((s) => Object.entries(JSON.parse(s)).forEach(([k, v]) => localStorage.setItem(k, v)), state);
await nogl.goto(`${BASE}/us/${us}`);
await nogl.locator('.painted-photo-plain').first().waitFor();
await shot(nogl, 'x1-no-webgl');

await browser.close();
console.log('errors:', errors.length ? errors : 'none');
