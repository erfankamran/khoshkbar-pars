import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { mintOtp } from './otp-fallback';

const BASE = 'http://localhost:3000';
mkdirSync('/tmp/render', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

// ۱) خانه
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/render/home.png' });

// ۲) لاگین ادمین
await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/render/admin-login.png' });

// ۳) ورود ادمین با fetch و تزریق کوکی نشست در مرورگر — کد از DB ضرب می‌شود (production-safe)
const code = await mintOtp('09121111111');
const verify = await fetch(`${BASE}/api/auth/otp/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '09121111111', code }),
});
const verifyBody = (await verify.json()) as { ok?: boolean };
if (!verifyBody.ok) throw new Error('admin login failed');
const setCookie = verify.headers.get('set-cookie') ?? '';
const session = /pars_session=([a-f0-9]+)/.exec(setCookie)?.[1];
if (!session) throw new Error('no session cookie');
const ctx = page.context();
await ctx.addCookies([
  { name: 'pars_session', value: session, url: BASE, httpOnly: true, sameSite: 'Lax' },
]);
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/render/admin-dashboard.png' });

// ۴) فهرست سفارش‌های ادمین
await page.goto(`${BASE}/admin/orders`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/render/admin-orders.png' });

await browser.close();
console.log('screenshots done');
