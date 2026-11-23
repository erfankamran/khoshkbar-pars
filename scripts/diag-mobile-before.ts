/**
 * عکس‌برداری وضعیت فعلی موبایل پنل — قبل از تغییر (diagnostic)
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  // ورود با کد مادر
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.fill('#admin-phone', '09121111111');
  await page.getByText('ورود سریع با کد مادر').click();
  await page.waitForURL(`${BASE}/admin`, { timeout: 20000 });
  console.log('✓ ورود انجام شد');

  // صفحه محصولات
  await page.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/render/before-products-top.png' });

  // اسکرول پایین — نوار بالا می‌چسبد؟
  const headerBox1 = await page.locator('header').boundingBox();
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(800);
  const headerBox2 = await page.locator('header').boundingBox();
  await page.screenshot({ path: '/tmp/render/before-products-scrolled.png' });
  console.log(`header y before scroll: ${headerBox1?.y}, after 600px scroll: ${headerBox2?.y} → sticky ${headerBox2?.y === 0 ? 'کار می‌کند' : 'خراب است'}`);

  // باز کردن دیالوگ ویرایش
  await page.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'ویرایش' }).first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/render/before-edit-dialog.png' });

  // عرض جدول — آیا افقی بیرون می‌زند؟
  const doc = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  console.log(`document scrollWidth=${doc.scrollW} clientWidth=${doc.clientW} → ${doc.scrollW > doc.clientW + 2 ? 'افقی سرریز!' : 'بدون سرریز'}`);

  await browser.close();
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
