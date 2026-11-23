/**
 * تست سوایپ بنر (RTL) + درگ چیپ‌های صفحهٔ دسته — روی سرور dev فعال
 */
import { chromium } from 'playwright-core';

const EXE =
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const BASE = 'http://localhost:3000/';

async function dragRight(
  page: import('playwright-core').Page,
  el: import('playwright-core').Locator,
  px: number
) {
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = await el.boundingBox();
  if (!box) throw new Error('no box');
  const cx = Math.min(box.x + box.width / 2, 720);
  const cy = Math.max(130, Math.min(box.y + box.height / 2, 790));
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(cx + (i * px) / 10, cy, { steps: 2 });
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    viewport: { width: 780, height: 900 },
  });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CERR:', m.text().slice(0, 250));
  });
  await page.addInitScript(() => {
    window.sessionStorage.setItem('pars:splash-shown', '1');
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // ——— ۱) سوایپ بنر ———
  const bannerSection = page.locator('section[aria-label="بنرهای ویژه"]');
  await bannerSection.waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForTimeout(800);
  const dots = bannerSection.locator('button[role="tab"]');
  const dotCount = await dots.count();
  console.log('BANNER_DOTS =', dotCount);

  let bannerPass = true;
  if (dotCount >= 2) {
    const sel0 = await bannerSection
      .locator('button[role="tab"][aria-selected="true"]')
      .getAttribute('aria-label');
    console.log('BANNER_SELECTED before =', sel0);
    await dragRight(page, bannerSection, 140);
    console.log(
      'after drag: section visible =',
      await bannerSection.isVisible().catch(() => false),
      '| dots =',
      await dots.count()
    );
    const allDots = await bannerSection
      .locator('button[role="tab"]')
      .evaluateAll((els) =>
        els.map((e) => `${e.getAttribute('aria-label')}=${e.getAttribute('aria-selected')}`)
      );
    console.log('DOTS_STATE =', JSON.stringify(allDots));
    const sel1 = allDots.find((s) => s.endsWith('=true'))?.split('=')[0] ?? 'none';
    console.log('BANNER_SELECTED after drag-right =', sel1);
    const advanced = sel0 !== sel1;

    // کلیک بعد از درگ نباید CTA را باز کند — هنوز خانه باشیم
    const stillHome = await page
      .getByText('پیشنهاد پارس')
      .first()
      .isVisible()
      .catch(() => false);
    console.log('STILL_HOME_AFTER_BANNER_DRAG =', stillHome);

    // دات‌ها همچنان کار می‌کنند
    await bannerSection.locator('button[aria-label="بنر ۱"]').click();
    await page.waitForTimeout(600);
    const sel2 = await bannerSection
      .locator('button[role="tab"][aria-selected="true"]')
      .getAttribute('aria-label');
    console.log('DOT_CLICK_BACK_TO =', sel2);

    bannerPass = advanced && stillHome && sel2 === 'بنر ۱';
  } else {
    console.log('SKIP banner swipe — کمتر از دو بنر');
  }

  // ——— ۲) درگ چیپ‌های صفحهٔ دسته ———
  const catNav = page.locator('nav[aria-label="دسته‌بندی محصولات"]');
  await catNav.locator('button').first().click();
  const chips = page.locator('nav[aria-label="انتخاب دسته‌بندی"]');
  await chips.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(600);

  const s0 = await chips.evaluate((el) => el.scrollLeft);
  const scrollable = await chips.evaluate(
    (el) => el.scrollWidth > el.clientWidth
  );
  await dragRight(page, chips, 220);
  const s1 = await chips.evaluate((el) => el.scrollLeft);
  const delta = s1 - s0;
  console.log(
    'CHIPS scrollLeft before/after =',
    s0,
    '→',
    s1,
    '| delta =',
    delta,
    '| scrollable =',
    scrollable
  );
  const chipsPass = scrollable && Math.abs(delta) > 50;

  await browser.close();
  const pass = bannerPass && chipsPass;
  console.log(pass ? 'SWIPE_TEST_PASS ✅' : 'SWIPE_TEST_FAIL ❌');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
