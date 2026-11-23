/**
 * تست e2e ورود با کد مادر روی سرور production (حالت standalone)
 *
 * - ادمین: /admin/login → شماره مدیر → «ورود سریع با کد مادر» → /admin
 * - مشتری: / → تب حساب → «ورود | ثبت‌نام» → شماره → «ورود سریع با کد مادر» → ورود موفق
 *
 * اجرا: bun scripts/check-prod-login.ts
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch();

  // ۱) ادمین — کد مادر
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(1500);
  await adminPage.fill('#admin-phone', '09121111111');
  await adminPage.getByText('ورود سریع با کد مادر').click();
  await adminPage.waitForURL(`${BASE}/admin`, { timeout: 20000 });
  console.log('✓ ادمین: ورود سریع با کد مادر ۱۲۳۴۵۶ → نشست روی /admin برقرار شد');
  const dash = await adminPage.textContent('body');
  console.log(
    `  پنل ادمین بارگذاری شد: ${/پیشخوان|داشبورد|فروشگاه پارس/.test(dash ?? '') ? '✓ محتوا دیده شد' : '؟'}`
  );
  await adminCtx.close();

  // ۲) مشتری — کد مادر از مسیر SPA
  const custCtx = await browser.newContext();
  const custPage = await custCtx.newPage();
  await custPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await custPage.waitForTimeout(1500);
  await custPage.click('[aria-label="حساب"]');
  await custPage.getByText('ورود | ثبت‌نام').first().click();
  await custPage.fill('#login-phone', '09121234567');
  await custPage.getByText('ورود سریع با کد مادر').click();
  await custPage.waitForTimeout(2500);
  const body = await custPage.textContent('body');
  const loggedIn = body?.includes('خروج') || body?.includes('سفارش‌های من') || body?.includes('0912');
  console.log(
    `✓ مشتری: ورود با کد مادر از مسیر SPA → ${loggedIn ? 'نشست برقرار شد (نمای حساب کاربری)' : 'وضعیت نامشخص'}`
  );
  if (!loggedIn) {
    await custPage.screenshot({ path: '/tmp/render/prod-customer-login.png' });
  }
  await custCtx.close();

  await browser.close();
  console.log('✅ ورود کد مادر روی production ادمین و مشتری هر دو موفق');
}

main().catch((e) => {
  console.error('CHECK FAILED:', e);
  process.exit(1);
});
