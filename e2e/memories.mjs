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

// Alice writes a memory in the past with a photo and a voice clip
await a.goto(`${BASE}/us/${us}`);
await a.click('text=留下一段回忆');
await a.fill('textarea', '第一次一起去镰仓。\n海风很大，你把围巾借给了我。');
await a.fill('input[type=date]', '2019-05-02');
await a.click('text=只记得哪个月');
await a.fill('input[maxlength="120"]', '镰仓');
await a.setInputFiles('.photo-pick input:not([capture])', `${FIXTURES}/photo.jpg`);
await a.locator('.pending-item img').first().waitFor();
await a.click('text=录一段声音');
await sleep(2200);
await a.click('text=停下');
await a.getByText(/^声音 0:0[12]/).waitFor();
await a.screenshot({ path: `${shots}/b1-form.png`, fullPage: true });
await a.click('button:has-text("留下来")');
await a.waitForURL(/\/m\/[0-9a-f-]{36}$/);
await a.getByRole('heading', { name: '2019年5月' }).waitFor();
await a.locator('.memory-meta').getByText('镰仓').waitFor();
await a.locator('.wash-photo-plain').waitFor();
const dims = await a.locator('.wash-photo-plain').evaluate((img) => [img.naturalWidth, img.naturalHeight]);
if (dims[0] !== 2048) throw new Error('photo not downscaled: ' + dims);
const src = await a.locator('.wash-photo-plain').getAttribute('src');
if (!src.includes('/object/sign/')) throw new Error('not a signed url: ' + src);
await a.locator('audio').waitFor({ state: 'attached' });
await a.screenshot({ path: `${shots}/b2-detail.png`, fullPage: true });

// Bob (guest) sees it in the list and opens it
await b.goto(`${BASE}/us/${us}`);
await b.getByText('第一次一起去镰仓。').waitFor();
await b.locator('.run-row').first().waitFor();
await b.screenshot({ path: `${shots}/b3-list.png`, fullPage: true });
await b.click('.run-row');
await b.getByText('小林 记下的').waitFor();
if (await b.getByText('修改').count()) throw new Error('bob can see edit');
await b.locator('.wash-photo-plain').waitFor();
const bImg = await b.locator('.wash-photo-plain').evaluate((img) => img.complete && img.naturalWidth);
if (!bImg) throw new Error('bob cannot load photo');

// Signed URL unusable without the token
const plain = src.split('?')[0].replace('/object/sign/', '/object/public/');
const r = await fetch(plain);
if (r.ok) throw new Error('media publicly readable!');

// Alice edits, removing the photo
await a.click('text=修改');
await a.click('text=移除 #1');
await a.click('button:has-text("保存")');
await a.waitForURL(/\/m\/[0-9a-f-]{36}$/);
await sleep(300);
if (await a.locator('.wash-photo-plain, .photo img').count()) throw new Error('photo not removed');

// ...and deletes it
a.once('dialog', (d) => d.accept());
await a.click('text=删除这段回忆');
await a.waitForURL(new RegExp(`/us/${us}$`));
await a.getByText('回忆会在这里慢慢出现。').waitFor();
const { execSync } = await import('node:child_process');
const left = execSync(`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -Atc "select count(*) from storage.objects where bucket_id='media'"`).toString().trim();
if (left !== '0') throw new Error('orphan files left: ' + left);
console.log('errors:', errors.length ? errors : 'none');
console.log('E2E memories OK');
await browser.close();
