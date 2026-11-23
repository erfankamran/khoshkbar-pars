/**
 * تست عملی درگ با ماوس روی ردیف‌های محصول صفحهٔ اصلی (فروشگاه پارس)
 * — سرور فعال موجود استفاده می‌شود؛ هیچ سروری اجرا/kill نمی‌شود.
 */
import { chromium } from 'playwright-core';

const EXE =
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const BASE = 'http://localhost:3000/';

async function main() {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  // رد شدن Splash — بدون این، overlay تمام‌صفحه همهٔ رویدادهای ماوس را می‌بلعد
  await page.addInitScript(() => {
    window.sessionStorage.setItem('pars:splash-shown', '1');
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const row = page
    .locator('div.no-scrollbar.overflow-x-auto')
    .filter({ has: page.locator('article[role="link"]') })
    .first();
  await row.waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForTimeout(1000);

  // در ویوپورت پهن ممکن است ردیف سرریز نداشته باشد → باریک‌تر می‌کنیم
  let scrollable = await row.evaluate((el) => el.scrollWidth > el.clientWidth);
  if (!scrollable) {
    await page.setViewportSize({ width: 780, height: 900 });
    await page.waitForTimeout(800);
    scrollable = await row.evaluate((el) => el.scrollWidth > el.clientWidth);
  }
  const before = await row.evaluate((el) => el.scrollLeft);
  console.log('BEFORE scrollLeft =', before, '| scrollable =', scrollable);
  if (!scrollable) throw new Error('ردیف اصلاً سرریز ندارد — تست نامعتبر');

  const box = await row.boundingBox();
  if (!box) throw new Error('boundingBox پیدا نشد');
  // ردیف ممکن است زیر BottomNav باشد → اول داخل دید بیاوریم
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box2 = await row.boundingBox();
  if (!box2) throw new Error('boundingBox2 پیدا نشد');
  // نقطهٔ درگ: بالای کارت‌ها — دور از ناوبری پایین و هدر
  const cx = Math.min(box2.x + box2.width / 2, 700);
  const cy = Math.max(120, box2.y + 40);
  console.log(
    'DRAG_AT =',
    Math.round(cx),
    Math.round(cy),
    '| rowTop =',
    Math.round(box2.y)
  );

  // درگ به راست — در RTL آیتم‌های بعدی از سمت چپ وارد دید می‌شوند (scrollLeft منفی)
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(cx + i * 25, cy, { steps: 2 });
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);

  const after = await row.evaluate((el) => el.scrollLeft);
  const delta = after - before;
  console.log('AFTER scrollLeft =', after, '| delta =', delta);

  // کلیکِ رهاکردن بعد از درگ نباید ناوبری کند — هنوز باید «پیشنهاد پارس» دیده شود
  const stillHome = await page
    .getByText('پیشنهاد پارس')
    .first()
    .isVisible()
    .catch(() => false);
  console.log('STILL_HOME_AFTER_DRAG =', stillHome);

  // کلیک عادی (بدون حرکت) باید صفحهٔ محصول را باز کند
  const card = row.locator('article[role="link"]').first();
  await card.click();
  const buyBtn = page
    .getByRole('button', { name: 'افزودن به سبد', exact: true })
    .first();
  await buyBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const detailOpened = await buyBtn.isVisible().catch(() => false);
  console.log('NORMAL_CLICK_OPENS_DETAIL =', detailOpened);

  await browser.close();

  const pass =
    scrollable && Math.abs(delta) > 50 && stillHome && detailOpened;
  console.log(pass ? 'DRAG_TEST_PASS ✅' : 'DRAG_TEST_FAIL ❌');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
