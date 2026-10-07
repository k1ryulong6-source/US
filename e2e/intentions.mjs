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

// Home: this week's question
await a.goto(BASE + '/');
await a.locator('.question').waitFor();
await a.screenshot({ path: `${shots}/d1-home.png` });
const q = await a.locator('.question-body').innerText();
await a.locator('.question').click();
await sleep(1500);
if (a.url().includes('/answer')) await a.getByText(q).waitFor();
else await a.goto(BASE + '/answer'); // a "我看见的你" question opens the seen notes instead
await a.fill('textarea', '这个周末一起去爬山');
await a.click('text=我们一起');
await a.screenshot({ path: `${shots}/d2-answer.png`, fullPage: true });
await a.click('button:has-text("记下了")');
await a.getByText('记下了。去做吧，这里会等你。').waitFor();

// A private one from the US page
await a.goto(`${BASE}/us/${us}`);
await a.getByRole('link', { name: '写一件想做的事' }).click();
await a.fill('textarea', '偷偷给阿树准备生日礼物');
await a.click('button:has-text("记下了")');
await a.waitForURL(/\/intentions$/);
await a.screenshot({ path: `${shots}/d3-intentions.png`, fullPage: true });

// Bob: sees the shared plan only
await b.goto(`${BASE}/us/${us}`);
await b.getByText('这个周末一起去爬山').waitFor();
if (await b.getByText('生日礼物').count()) throw new Error('private intention leaked');
await b.goto(`${BASE}/intentions`);
if (await b.getByText('生日礼物').count()) throw new Error('private intention leaked (list)');

// Bob marks the shared plan done, as a memory
await b.click('text=做到了');
await b.getByText('做到了。').waitFor();
await b.click('text=存为我们的回忆');
await b.fill('textarea', '山顶的风很大，我们分了一个橘子。');
await b.click('button:has-text("留下来")');
await b.waitForURL(/\/m\/[0-9a-f-]{36}$/);
await b.getByText('山顶的风很大').waitFor();

// Alice completes the private one with a note only she keeps
await a.goto(`${BASE}/intentions`);
await a.locator('.intention', { hasText: '生日礼物' }).getByText('做到了').click();
await a.click('text=只留一句给自己');
await a.fill('textarea', '他拆开的时候愣了好久。');
await a.click('button:has-text("留下")');
await a.waitForURL(/\/intentions$/);
await a.click('text=做到了的');
await a.getByText('他拆开的时候愣了好久。').waitFor();
await a.getByText('看看那段回忆').waitFor(); // the shared one bob completed
await a.screenshot({ path: `${shots}/d4-done.png`, fullPage: true });

// A seen question goes to the seen page with the question shown
await a.goto(`${BASE}/answer?prompt=5`);
await a.waitForURL(/\/seen$/);
await a.getByText('最近你在 TA 身上看见了什么好？').waitFor();

console.log('errors:', errors.length ? errors : 'none');
console.log('E2E intentions OK');
await browser.close();
