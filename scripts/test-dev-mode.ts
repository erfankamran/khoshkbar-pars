/**
 * تست E2E فلگ وضعیت توسعه (NEXT_PUBLIC_DEV_MODE=true در .env):
 *  ۱) /admin/login → باکس طلایی کد مادر + ورود سریع بدون پیامک
 *  ۲) نمای حساب فروشگاه → باکس طلایی لاگین
 *  ۳) خطای تزریقی سرور → کارت خطا علت فنی دقیق را نشان می‌دهد (حالت توسعه)
 *  ۴) پس از حذف تزریق → صفحهٔ اصلی سالم
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const CHROME = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const BASE = 'http://localhost:3000';
const SHOT = '/tmp/render';

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  await page.addInitScript(() => sessionStorage.setItem('pars:splash-shown', '1'));
  // نشانگر dev-overlay نکست روی آخرین تب BottomNav می‌نشیند و کلیک را می‌بلعد —
  // عنصر nextjs-portal به‌محض افزودن حذف می‌شود
  await page.addInitScript(() => {
    const kill = () =>
      document.querySelectorAll('nextjs-portal').forEach((el) => el.remove());
    new MutationObserver(kill).observe(document.documentElement, { childList: true, subtree: true });
    kill();
  });
  fs.mkdirSync(SHOT, { recursive: true });

  // ——— ۱) لاگین ادمین: باکس طلایی + ورود سریع (با شمارهٔ مدیر seed) ———
  await page.goto(BASE + '/admin/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const box = page.getByText('محیط تست — کد مادر');
  await box.scrollIntoViewIfNeeded();
  await page.screenshot({ path: SHOT + '/dev-admin-goldbox.png' });

  // ورود سریع با کد مادر از مرحلهٔ شماره هم نیازمند شمارهٔ معتبر است
  await page.getByPlaceholder('09123456789').fill('09120000000');
  await page.getByRole('button', { name: 'ورود سریع با کد مادر (بدون پیامک)' }).click();
  await page.waitForURL('**/admin', { timeout: 15000 });
  console.log('ADMIN_MASTER_LOGIN_OK ->', page.url());

  // ——— ۲) نمای حساب فروشگاه: باکس طلایی لاگین — زمینهٔ تازه (بدون نشست ادمین) ———
  const page2 = await browser.newPage({ viewport: { width: 414, height: 896 } });
  await page2.addInitScript(() => sessionStorage.setItem('pars:splash-shown', '1'));
  await page2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(3000);
  // کلیک حساب از طریق JS — نشانگر dev-overlay نکست روی این تب می‌نشیند
  await page2.evaluate(
    () => (document.querySelector('button[aria-label="حساب"]') as HTMLElement | null)?.click(),
  );
  await page2.waitForTimeout(1000);
  // حالت مهمان → دکمهٔ ورود → نمای لاگین
  await page2.getByText('ورود | ثبت‌نام').click();
  await page2.waitForTimeout(1500);
  const shopGoldBox = page2.getByText('محیط تست — کد مادر').first();
  await shopGoldBox.scrollIntoViewIfNeeded();
  await page2.screenshot({ path: SHOT + '/dev-shop-goldbox.png' });
  console.log('SHOP_GOLDEN_BOX_OK');
  await page2.close();

  // ——— ۳) خطای تزریقی با علت فنی — کارت خطا باید آن را نشان دهد ———
  await page.route('**/api/home**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: {
          code: 'INTERNAL',
          message: 'خطای غیرمنتظره سرور',
          details: {
            technical: 'TypeError: BOOM_CAUSE_E2E',
            stack: 'TypeError: BOOM_CAUSE_E2E\n at handler (route.ts:1:1)',
          },
        },
      }),
    }),
  );
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const errText = page.getByText('BOOM_CAUSE_E2E').first();
  await errText.waitFor({ state: 'visible', timeout: 8000 });
  await page.screenshot({ path: SHOT + '/dev-technical-error.png' });
  console.log('TECHNICAL_ERROR_SHOWN_OK');

  // ——— ۴) حذف تزریق → صفحه سالم ———
  await page.unroute('**/api/home**');
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOT + '/dev-home-healthy.png' });
  console.log('HOME_HEALTHY_AGAIN');

  await browser.close();
  console.log('DEV_MODE_TEST_PASS');
}

main().catch((e) => {
  console.error('DEV_MODE_TEST_ERROR', e);
  process.exit(1);
});
