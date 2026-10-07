import { BASE, launch, phone, login, inviteLink, joinAsGuest, resetDb, sleep, SHOTS, FIXTURES } from './lib.mjs';
import { execSync } from 'node:child_process';
const shots = process.argv[2] ?? SHOTS;
const psql = (q) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -Atc "${q}"`).toString().trim();
await resetDb();
const errors = [];
const browser = await launch();
const a = await phone(browser, errors, 'A');
await login(a, 'alice@example.com', '小林');

// Create a US with a stage that started in the past
await a.goto(BASE + '/new');
await a.fill('input[maxlength="60"]', '我们俩');
await a.fill('input[placeholder="比如：朋友、恋人、异地"]', '朋友');
await a.fill('input[type=date]', '2019-04-01');
await a.click('text=建好了');
await a.locator('.letter').waitFor();
const us = a.url().split('/us/')[1].split('/')[0];
const link = await inviteLink(a, us);
const b = await phone(browser, errors, 'B', 'Pixel 7');
await joinAsGuest(b, link, '阿树');

// Alice: a memory from 2019 and a shared plan done without a memory
await a.goto(`${BASE}/us/${us}/m/new`);
await a.fill('textarea', '第一次见面，在东京的书店');
await a.fill('input[type=date]', '2019-04-03');
await a.click('button:has-text("留下来")');
await a.waitForURL(/\/m\/[0-9a-f-]{36}$/);
const aliceMem = a.url();
await a.goto(`${BASE}/answer?us=${us}`);
await a.fill('textarea', '一起看一场电影');
await a.click('text=我们一起');
await a.click('button:has-text("记下了")');
await a.waitForURL(/\/intentions$/);
await a.click('text=做到了');
await a.click('text=不用了，就这样');
await a.waitForURL(/\/intentions$/);

// Bob: a memory with a photo, and his version of alice's memory
await b.goto(`${BASE}/us/${us}/m/new`);
await b.fill('textarea', '阿树记得的冬天');
await b.setInputFiles('input[type=file]', `${FIXTURES}/photo.jpg`);
await b.locator('.pending-item img').first().waitFor();
await b.click('button:has-text("留下来")');
await b.waitForURL(/\/m\/[0-9a-f-]{36}$/);
await b.goto(aliceMem);
await b.fill('section textarea', '我记得是在咖啡店');
await b.click('button:has-text("写好了")');
await b.getByText('你记得的', { exact: true }).waitFor();

// Timeline
await a.goto(`${BASE}/us/${us}`);
await a.getByText('一起做到了：一起看一场电影').waitFor();
await a.getByText('从「朋友」开始').waitFor();
await a.getByText('阿树记得的冬天').waitFor();
const years = (await a.locator('.run-year').allInnerTexts()).map((y) => y.trim());
if (years.join(',') !== '2019') throw new Error('year markers (this year is not written): ' + years);
await a.screenshot({ path: `${shots}/e1-timeline.png`, fullPage: true });

// Export (alice)
await a.goto(`${BASE}/me/export`);
const [download] = await Promise.all([a.waitForEvent('download'), a.click('text=开始导出')]);
const zipPath = `${shots}/export.zip`;
await download.saveAs(zipPath);
const listing = execSync(`unzip -l ${zipPath}`).toString();
if (!listing.includes('data.json') || !listing.includes('README.txt') || !/media\/.+\.jpg/.test(listing)) {
  throw new Error('export incomplete:\n' + listing);
}
const data = JSON.parse(execSync(`unzip -p ${zipPath} data.json`).toString());
if (!data.memories.some((m) => m.body === '阿树记得的冬天')) throw new Error('shared memory missing in export');
await a.getByText('好了，文件已经开始下载。').waitFor();

// Bob leaves and takes his content with him
const bobFiles = psql(`select count(*) from storage.objects where owner_id = (select id::text from auth.users where is_anonymous)`);
if (bobFiles !== '1') throw new Error('expected 1 bob file, got ' + bobFiles);
await b.goto(`${BASE}/us/${us}/leave`);
await b.click('text=带走我的内容');
await b.screenshot({ path: `${shots}/e2-leave.png`, fullPage: true });
await b.click('text=确定离开');
await b.waitForURL(BASE + '/');
const left = psql(`select count(*) from storage.objects where owner_id = (select id::text from auth.users where is_anonymous)`);
if (left !== '0') throw new Error('bob files not cleaned: ' + left);

await a.goto(`${BASE}/us/${us}`);
await a.getByText('第一次见面').waitFor();
if (await a.getByText('阿树记得的冬天').count()) throw new Error('bob memory still visible');
await a.goto(aliceMem);
await a.getByText('第一次见面').waitFor();
await sleep(500);
if (await a.getByText('我记得是在咖啡店').count()) throw new Error('bob perspective still visible');

console.log('errors:', errors.length ? errors : 'none');
console.log('E2E phase e OK');
await browser.close();
