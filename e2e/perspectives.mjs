import { BASE, launch, phone, login, createUs, inviteLink, joinAsGuest, resetDb, sleep, SHOTS, FIXTURES } from './lib.mjs';
const shots = process.argv[2] ?? SHOTS;
await resetDb();
const errors = [];
const browser = await launch();
const a = await phone(browser, errors, 'A');
await login(a, 'alice@example.com', '小林');
const us = await createUs(a, '我们俩');
const link = await inviteLink(a, us);
const b = await phone(browser, errors, 'B', 'Pixel 7');
await joinAsGuest(b, link, '阿树');

await a.goto(`${BASE}/us/${us}/m/new`);
await a.fill('textarea', '镰仓的那场雨');
await a.click('button:has-text("留下来")');
await a.waitForURL(/\/m\/[0-9a-f-]{36}$/);
const memUrl = a.url();

// Bob writes his version (text + voice), without seeing anything first
await b.goto(memUrl);
await b.getByText('你记得的版本是？').waitFor();
await b.fill('section textarea', '我记得那天其实是晴天，雨是傍晚才下的。');
await b.click('text=录一段声音');
await sleep(1500);
await b.click('text=停下');
await b.click('button:has-text("写好了")');
await b.getByText('你记得的', { exact: true }).waitFor();
await b.getByText('还没有其他人的版本。').waitFor();

// Alice: still the prompt, bob's words not in the page at all
await a.reload();
await a.getByText('你记得的版本是？').waitFor();
if (await a.getByText('晴天').count()) throw new Error('bob version leaked before reveal');
await a.screenshot({ path: `${shots}/c1-prompt.png`, fullPage: true });
await a.click('text=跳过，直接看');
await a.getByText('我记得那天其实是晴天').waitFor();
await a.locator('.version audio').waitFor({ state: 'attached' });
await a.screenshot({ path: `${shots}/c2-revealed.png`, fullPage: true });
// Alice can still write hers after skipping
await a.fill('section textarea', '我只记得你的围巾。');
await a.click('button:has-text("写好了")');
await a.getByText('我只记得你的围巾。').waitFor();

// Bob makes his version private -> alice no longer sees it
await b.reload();
await b.getByText('我只记得你的围巾。').waitFor();
await b.click('section >> text=修改');
await b.click('text=只给自己看');
await b.click('button:has-text("写好了")');
await b.getByText('只有你能看到').waitFor();
await a.reload();
await a.getByText('还没有其他人的版本。').waitFor();

// Seen notes
await a.goto(`${BASE}/us/${us}/seen`);
await a.fill('textarea', '那天你明明很累，还是先问我吃饭了没有。');
await a.click('text=交给 TA');
await a.getByText('已经交给 TA 了。').waitFor();
await b.goto(`${BASE}/us/${us}/seen`);
await b.getByText('小林 写给你').waitFor();
await b.click('text=收好');
await b.getByText('已收好').waitFor();
await b.screenshot({ path: `${shots}/c3-seen.png`, fullPage: true });
await b.goto(`${BASE}/me/kept`);
await b.getByText('那天你明明很累').waitFor();
await b.screenshot({ path: `${shots}/c4-kept.png`, fullPage: true });
// alice cannot tell
await a.reload();
if (await a.getByText('已收好').count()) throw new Error('keep leaked to author');

console.log('errors:', errors.length ? errors : 'none');
console.log('E2E perspectives OK');
await browser.close();
