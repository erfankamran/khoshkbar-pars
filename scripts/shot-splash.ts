// هدف: اسکرین‌شات از اسپلش واقعی فروشگاه + کارت تنظیمات اسپلش در پنل
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

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ??
    '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });

// ——— ۱) اسپلش واقعی: بارگذاری اول نشست — sessionStorage خالی ———
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900); // انیمیشن ورود لوگو تمام شده باشد
await page.screenshot({ path: '/tmp/render/splash-live.png' });
console.log('shot 1: splash-live.png');

// ——— ۲) کارت تنظیمات اسپلش در پنل ———
const token = await otpLogin('09120000000');
if (!token) throw new Error('admin login failed');
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => {
  try { localStorage.setItem('pars:session-token', t); } catch {}
}, token);
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
// کارت اسپلش را به مرکز اسکرول ببر
const card = page.locator('section[aria-label="اسکرین اسپلش (صفحه آغازین)"]');
await card.waitFor({ state: 'visible', timeout: 15000 });
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/render/admin-splash-card.png' });
console.log('shot 2: admin-splash-card.png');

await browser.close();
console.log('done');
