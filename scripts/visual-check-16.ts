/**
 * بررسی بصری فاز ۱۶ — درگاه پرداخت زیبال
 *
 * اسکرین‌شات‌ها در /tmp/render:
 *  16-admin-gateway.png    — تنظیمات پنل با درگاه زیبال انتخاب‌شده + راهنمای مرچنت
 *  16-callback-invalid.png — صفحه بازگشت پرداخت با پارامتر ناقص (حالت خطا)
 *
 * اجرا: bun scripts/visual-check-16.ts
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = '/tmp/render';
const ADMIN_PHONE = '09120000000';

async function adminCookie(): Promise<string> {
  const reqRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: ADMIN_PHONE }),
  });
  const reqBody = (await reqRes.json()) as { data?: { devCode?: string } };
  const verRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: ADMIN_PHONE, code: reqBody.data?.devCode }),
  });
  const setCookie = verRes.headers.get('set-cookie') ?? '';
  return setCookie.match(/pars_session=([a-f0-9]+)/)?.[1] ?? '';
}

async function putSettings(token: string, values: Record<string, string>) {
  await fetch(`${BASE}/api/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-pars-session': token },
    body: JSON.stringify({ values }),
  });
}

const browser = await chromium.launch();
try {
  const token = await adminCookie();

  // درگاه را برای اسکرین‌شات روی زیبال + مرچنت تست می‌گذاریم
  const adm = await fetch(`${BASE}/api/admin/settings`, {
    headers: { 'x-pars-session': token },
  }).then((r) => r.json() as Promise<{ data?: { settings: { key: string; value: string }[] } }>);
  const original: Record<string, string> = {};
  for (const s of adm.data?.settings ?? []) original[s.key] = s.value;
  await putSettings(token, { ...original, gatewayProvider: 'ZIBAL', gatewayMerchantId: 'zibal' });

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([
    {
      name: 'pars_session',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  // ——— ۱) پنل تنظیمات — بخش درگاه پرداخت ———
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.getByText('درگاه پرداخت', { exact: true }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/16-admin-gateway.png` });
  console.log('✅ 16-admin-gateway.png');
  await page.close();
  await ctx.close();

  // بازگردانی تنظیمات به حالت قبل
  await putSettings(token, original);

  // ——— ۲) صفحه بازگشت پرداخت — حالت پارامتر ناقص ———
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/payment/callback`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(600);
  await page2.screenshot({ path: `${OUT}/16-callback-invalid.png` });
  console.log('✅ 16-callback-invalid.png');
  await page2.close();
  await ctx2.close();

  console.log('تمام شد');
} finally {
  await browser.close();
}
