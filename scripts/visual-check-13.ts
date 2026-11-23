/**
 * بررسی بصری فاز ۱۳ — صفحه محصول /p/[slug] + صفحه ادمین «فید و سئو»
 * اجرا: bun scripts/visual-check-13.ts
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = '/tmp/render';

const ADMIN_PHONE = '09120000000';

async function adminCookie(): Promise<string> {
  // OTP با شماره مدیر رسمی (admin-tests هم از همین استفاده می‌کند)
  const reqRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: ADMIN_PHONE }),
  });
  const reqBody = (await reqRes.json()) as { data?: { devCode?: string } };
  const code = reqBody.data?.devCode;
  if (!code) throw new Error('OTP devCode نگرفت');
  const verRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: ADMIN_PHONE, code }),
  });
  const setCookie = verRes.headers.get('set-cookie') ?? '';
  const m = setCookie.match(/pars_session=([a-f0-9]+)/);
  if (!m) throw new Error('کوکی نشست مدیر نگرفت');
  return m[1];
}

const browser = await chromium.launch();
try {
  // ۱) صفحه محصول — مهمان
  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page1 = await ctx1.newPage();
  await page1.goto(`${BASE}/p/pistachio-akbari`, { waitUntil: 'networkidle' });
  await page1.waitForTimeout(400);
  await page1.screenshot({ path: `${OUT}/13-product.png`, fullPage: false });

  // افزودن به سبد از صفحه محصول (عملکرد BuyBox)
  await page1.getByRole('button', { name: 'افزودن به سبد خرید' }).click();
  await page1.waitForTimeout(1200);
  await page1.screenshot({ path: `${OUT}/13-product-added.png`, fullPage: false });
  await ctx1.close();

  // ۲) صفحه ادمین فید و سئو — با نشست مدیر
  const token = await adminCookie();
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.addCookies([
    { name: 'pars_session', value: token, url: BASE, httpOnly: true, sameSite: 'Lax' },
  ]);
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/admin/feeds`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(600);
  await page2.screenshot({ path: `${OUT}/13-admin-feeds.png`, fullPage: false });
  await page2.screenshot({ path: `${OUT}/13-admin-feeds-full.png`, fullPage: true });
  await ctx2.close();

  console.log('✅ اسکرین‌شات‌ها ذخیره شدند:', OUT);
} finally {
  await browser.close();
}
