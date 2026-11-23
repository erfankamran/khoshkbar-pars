// شات + آزمون واقعی: جزئیات کاربر + کشیدن مارکر نقشه با موس
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3000';

async function otpLogin(phone: string): Promise<string | null> {
  await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  await new Promise((r) => setTimeout(r, 300));
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code: '123456' }),
  });
  const body = (await verifyRes.json()) as { data?: { sessionToken?: string } };
  return body.data?.sessionToken ?? null;
}

const token = await otpLogin('09120000000');
if (!token) throw new Error('admin login failed');

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ??
    '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 820 } });

const inject = async (url: string) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    try { localStorage.setItem('pars:session-token', t); } catch {}
  }, token);
  await page.goto(url, { waitUntil: 'networkidle' });
};

// ——— ۱) جزئیات کاربر: کلیک روی کارت اول ———
await inject(`${BASE}/admin/users`);
await page.waitForTimeout(800);
const card = page.locator('div[role="button"][aria-label^="مشاهده جزئیات"]').first();
await card.waitFor({ state: 'visible', timeout: 15000 });
await card.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/render/user-detail.png' });
console.log('shot 1: user-detail.png');
// بستن دیالوگ برای ادامه
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// ——— ۲) نقشه: مارکر را با موس بکش و مختصات را بسنج ———
await inject(`${BASE}/admin/settings`);
const latInput = page.locator('#st-map-lat');
const lngInput = page.locator('#st-map-lng');
const beforeLat = await latInput.inputValue();
const beforeLng = await lngInput.inputValue();
console.log('before drag:', beforeLat, beforeLng);

const pin = page.locator('.pars-map-pin').last();
await pin.waitFor({ state: 'visible', timeout: 15000 });
await pin.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);

const box = await pin.boundingBox();
if (!box) throw new Error('marker bounding box not found');
// مارکر وسط SVG آیکن است (iconAnchor پایین پین) — کمی بالاتر از وسط می‌گیریم
const startX = box.x + box.width / 2;
const startY = box.y + box.height * 0.6;
await page.mouse.move(startX, startY);
await page.mouse.down();
await page.mouse.move(startX + 90, startY - 50, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(800);

const afterLat = await latInput.inputValue();
const afterLng = await lngInput.inputValue();
console.log('after drag:', afterLat, afterLng);
const moved = afterLat !== beforeLat && afterLng !== beforeLng;
console.log(moved ? '✅ مارکر جابجا شد و مختصات به‌روز شد' : '❌ مختصات تغییری نکرد');

await page.screenshot({ path: '/tmp/render/map-picker-drag.png' });
console.log('shot 2: map-picker-drag.png');

await browser.close();
if (!moved) process.exit(1);
console.log('done');
