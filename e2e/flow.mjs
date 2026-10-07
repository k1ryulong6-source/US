import { launch, SHOTS } from './lib.mjs';
import { chromium, devices } from 'playwright';
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:5173';
const MAIL = 'http://127.0.0.1:54324/api/v1';
const shots = process.argv[2] ?? SHOTS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function codeFor(email) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAIL}/search?query=${encodeURIComponent('to:' + email)}`);
    const list = await res.json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAIL}/message/${list.messages[0].ID}`)).json();
      const m = (msg.Text || '').match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
    await sleep(500);
  }
  throw new Error('no code for ' + email);
}

const browser = await launch();
const phone = devices['iPhone 13'];
const a = await (await browser.newContext({ ...phone, permissions: ['clipboard-read','clipboard-write'] })).newPage();
const errors = [];
a.on('pageerror', (e) => errors.push('A ' + e.message));

await fetch(MAIL + '/messages', { method: 'DELETE' });
// Alice signs in with an emailed code
await a.goto(BASE + '/');
await a.waitForURL(/login/);
await a.screenshot({ path: `${shots}/01-login.png` });
await a.click('text=用邮箱登录');
await a.fill('input[type=email]', 'alice@example.com');
await a.click('text=发送验证码');
const code = await codeFor('alice@example.com');
await a.fill('input[inputmode=numeric]', code);
await a.getByText('大家怎么称呼你？').waitFor();
await a.fill('input', '小林');
await a.click('button.primary');
await a.getByText('这里还很安静').waitFor();
await a.screenshot({ path: `${shots}/02-home-empty.png` });

// Create a US
await a.click('text=新建一个 US');
await a.fill('input[maxlength="60"]', '我们俩');
await a.fill('textarea', '我们是在东京认识的朋友');
await a.click('text=伴侣');
await a.fill('input[maxlength="40"]', '朋友');
await a.screenshot({ path: `${shots}/03-create.png`, fullPage: true });
await a.click('text=建好了');
await a.locator('.letter').waitFor();

// Invite link
await a.getByRole('button', { name: '邀请一个人' }).click();
await a.click('text=生成一个邀请链接');
const link = (await a.locator('code').innerText()).trim();
await a.screenshot({ path: `${shots}/04-about.png`, fullPage: true });

// Guest opens link on another phone
const b = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();
b.on('pageerror', (e) => errors.push('B ' + e.message));
await b.goto(link);
await b.getByText('「我们俩」').waitFor();
await b.getByText('小林 在这里等你').waitFor();
await b.screenshot({ path: `${shots}/05-invite.png` });
await b.fill('input', '阿树');
await b.click('text=进来吧');
await b.waitForURL(/\/us\//);
await b.locator('.people').getByText('小林').waitFor();
await b.screenshot({ path: `${shots}/06-guest-us.png` });
if (b.url().includes('/i/')) throw new Error('token still in url');

// Alice proposes a rename; it waits for the guest
await a.reload();
await a.getByRole('button', { name: '换一个名字' }).click();
await a.fill('input[placeholder="新名字"]', '我们');
await a.click('text=提出来');
await a.getByText('你已经同意了，等其他人看看。').waitFor();

// Guest sees a gentle note, accepts
await b.reload();
await b.getByText('有一个提议，等你看看。').waitFor();
await b.screenshot({ path: `${shots}/07-guest-proposal-note.png` });
await b.click('text=有一个提议，等你看看。');
await b.click('button:has-text("同意")');
await b.locator('.waiting').waitFor({ state: 'detached' });
await sleep(500);
await b.goto(BASE + '/');
await b.getByText('我们', { exact: true }).waitFor();
await b.screenshot({ path: `${shots}/08-guest-home.png` });

// Guest's "我" page offers binding an email
await b.getByRole('link', { name: 'Me', exact: true }).click();
await b.getByText('你现在是访客').waitFor();
await b.screenshot({ path: `${shots}/09-guest-me.png` });

// Re-opening the used link as the same guest just takes them home
await b.goto(link);
await b.waitForURL(/\/us\//);

// A stranger re-using the same link is refused
const c = await (await browser.newContext({ ...phone })).newPage();
await c.goto(link);
await c.getByText('这个链接已经用过').waitFor();

// Alice hides it for herself only, then leaves alone
await a.goto(BASE + '/');
await a.click('.us-wash-name:has-text("我们")');
await a.click('text=About');
await a.getByRole('button', { name: '更多' }).click();
await a.click('text=从我的视野里收起');
await a.goto(BASE + '/');
await a.getByText('收起来的（1）').waitFor();
await a.screenshot({ path: `${shots}/10-home-hidden.png` });

await b.goto(BASE + '/');
await b.getByText('我们', { exact: true }).waitFor(); // still visible for the guest

console.log('errors:', errors.length ? errors : 'none');
console.log('E2E OK');
await browser.close();
