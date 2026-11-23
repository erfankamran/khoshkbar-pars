/**
 * صحت‌سنجی بصری دیتای جدید — داشبورد مشتریان + فاکتورهای فروش + نقشهٔ ایران
 * خروجی: اسکرین‌شات در /tmp/render/ + متن استخراج‌شده برای چک داده
 * اجرا: bun scripts/shot-reseed-verify.ts
 */
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
console.log('✓ admin login ok');

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ??
    '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });

const setToken = () =>
  page.evaluate((t) => {
    try { localStorage.setItem('pars:session-token', t); } catch {}
  }, token);

// ——— ۱) داشبورد اصلی (نقشهٔ ایران + آمار) ———
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await setToken();
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const dashText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1800));
console.log('— DASHBOARD TEXT —');
console.log(dashText);
await page.screenshot({ path: '/tmp/render/verify-dashboard.png', fullPage: false });

// ——— ۲) داشبورد مشتریان (نقشهٔ پراکندگی + نام‌ها) ———
await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
const usersText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500));
console.log('— USERS TEXT —');
console.log(usersText);
await page.screenshot({ path: '/tmp/render/verify-users.png', fullPage: false });

// ——— ۳) فاکتورهای فروش ———
await page.goto(`${BASE}/admin/orders`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
const ordersText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500));
console.log('— ORDERS TEXT —');
console.log(ordersText);
await page.screenshot({ path: '/tmp/render/verify-orders.png', fullPage: false });

await browser.close();
console.log('✓ screenshots saved to /tmp/render/');
