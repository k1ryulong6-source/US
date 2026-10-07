import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Targets the local stack: `npx supabase start` + `npm run dev` (see README.md here).
export const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:5173';
export const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));
export const SHOTS = process.env.E2E_SHOTS ?? fileURLToPath(new URL('./shots', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const MAIL = 'http://127.0.0.1:54324/api/v1';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function codeFor(email) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAIL}/search?query=${encodeURIComponent('to:' + email)}`);
    const list = await res.json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAIL}/message/${list.messages[0].ID}`)).json();
      const m = (msg.Text || msg.HTML || '').match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
    await sleep(500);
  }
  throw new Error('no code for ' + email);
}

export async function launch() {
  return chromium.launch({
    // CHROMIUM_PATH: use an installed Chromium instead of Playwright's own download
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      ...(process.env.GL === '1' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--disable-webgl'])],
  });
}

export async function phone(browser, errors, tag, device = 'iPhone 13') {
  const ctx = await browser.newContext({ ...devices[device], permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag} ${e.message}`));
  return page;
}

export async function login(page, email, name) {
  await fetch(`${MAIL}/messages`, { method: 'DELETE' });
  await page.goto(BASE + '/');
  await page.waitForURL(/login/);
  await page.fill('input[type=email]', email);
  await page.click('button.primary');
  await page.fill('input[inputmode=numeric]', await codeFor(email));
  await page.click('button.primary');
  if (name) {
    await page.getByText('大家怎么称呼你？').waitFor();
    await page.fill('input', name);
    await page.click('button.primary');
  }
  await page.getByRole('link', { name: 'US', exact: true }).waitFor();
}

export async function createUs(page, name) {
  await page.goto(BASE + '/new');
  await page.fill('input[maxlength="60"]', name);
  await page.click('text=建好了');
  await page.locator('.page-sub', { hasText: '关于我们' }).waitFor();
  return page.url().split('/us/')[1].split('/')[0];
}

export async function inviteLink(page, usId) {
  await page.goto(`${BASE}/us/${usId}/about`);
  await page.click('text=生成一个邀请链接');
  return (await page.locator('code').innerText()).trim();
}

export async function joinAsGuest(page, link, name) {
  await page.goto(link);
  await page.fill('input', name);
  await page.click('text=进来吧');
  await page.waitForURL(/\/us\//);
}

export async function resetDb() {
  const { execSync } = await import('node:child_process');
  execSync(`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -qc "delete from auth.users; delete from public.us_spaces; set storage.allow_delete_query = true; delete from storage.objects;"`);
}
