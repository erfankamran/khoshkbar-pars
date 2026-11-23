/**
 * بازبینی بصری پنل مدیریت (فاز ۱۱.۱) — اسکرین‌شات ورود + داشبورد
 * اجرا: bun scripts/admin-visual.ts [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const ADMIN_PHONE = '09120000000';

interface ApiResp<T> {
  ok: boolean;
  data?: T;
}

async function otpLogin(phone: string): Promise<string> {
  const req = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const reqBody = (await req.json()) as ApiResp<{ devCode?: string }>;
  if (!reqBody.data?.devCode) throw new Error('OTP request failed');
  const verify = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: reqBody.data.devCode }),
  });
  const verifyBody = (await verify.json()) as ApiResp<{ sessionToken?: string }>;
  if (!verifyBody.data?.sessionToken) throw new Error('OTP verify failed');
  return verifyBody.data.sessionToken;
}

async function main() {
  const token = await otpLogin(ADMIN_PHONE);
  const browser = await chromium.launch({ headless: true });

  // ——— ۱) صفحه ورود (بدون نشست) ———
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/admin-check/login.png' });
  console.log('✓ login.png');

  // ——— ۲) گیت: /admin بدون نشست → باید به login برود ———
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const gated = page.url().includes('/admin/login');
  console.log(`${gated ? '✓' : '❌'} گیت بدون نشست → /admin/login (url=${page.url()})`);

  // ——— ۳) داشبورد با توکن (فال‌بک هدر در مرورگر واقعی) ———
  await page.evaluate((t) => localStorage.setItem('pars:session-token', t), token);
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=داشبورد', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/admin-check/dashboard.png', fullPage: true });
  const body = (await page.textContent('body')) ?? '';
  const hasStats = body.includes('فروش امروز') && body.includes('پرفروش');
  console.log(`${hasStats ? '✓' : '❌'} داشبورد با داده رندر شد`);
  console.log('✓ dashboard.png');

  // ——— ۴) نمای موبایل ———
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await mpage.addInitScript((t) => localStorage.setItem('pars:session-token', t), token);
  await mpage.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  // «فروش امروز» فقط در محتوای داشبورد هست (سلکتور text=داشبورد به لینک
  // مخفیِ سایدبار در نمای موبایل هم می‌خورد و visible نمی‌شود)
  await mpage.waitForSelector('text=فروش امروز', { timeout: 15000 });
  await mpage.waitForTimeout(800);
  await mpage.screenshot({ path: '/tmp/admin-check/dashboard-mobile.png', fullPage: true });
  console.log('✓ dashboard-mobile.png');

  await browser.close();
  process.exit(gated && hasStats ? 0 : 1);
}

main().catch((e) => {
  console.error('VISUAL CHECK FAILED:', e);
  process.exit(1);
});
