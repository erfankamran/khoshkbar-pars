/**
 * بررسی بصری فاز ۱۴ — صفحات جدید پنل مدیریت
 * محصولات، سفارش‌ها، نظرات، کاربران، اطلاع‌رسانی، تنظیمات
 * اجرا: bun scripts/visual-check-14.ts
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
  const token = await adminCookie();
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

  const pages: Array<[string, string]> = [
    ['/admin/products', '14-admin-products.png'],
    ['/admin/orders', '14-admin-orders.png'],
    ['/admin/categories', '14-admin-categories.png'],
    ['/admin/reviews', '14-admin-reviews.png'],
    ['/admin/users', '14-admin-users.png'],
    ['/admin/notifications', '14-admin-notifications.png'],
    ['/admin/settings', '14-admin-settings.png'],
    ['/p/pistachio-akbari', '14-product-reviews.png'],
  ];

  for (const [path, file] of pages) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    // صفحه محصول: اسکرول به بخش نظرات
    if (path === '/p/pistachio-akbari') {
      await page.locator('#reviews').scrollIntoViewIfNeeded().catch(() => undefined);
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
    await page.close();
    console.log(`✅ ${path} → ${file}`);
  }

  // فرم محصول جدید — دیالوگ
  const page2 = await ctx.newPage();
  await page2.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' });
  await page2.getByRole('button', { name: 'محصول جدید' }).click();
  await page2.waitForTimeout(600);
  await page2.screenshot({ path: `${OUT}/14-admin-product-form.png`, fullPage: false });
  console.log('✅ فرم محصول جدید');

  console.log('اسکرین‌شات‌ها در /tmp/render ذخیره شدند');
} finally {
  await browser.close();
}
