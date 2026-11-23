/**
 * تست فوتر بازطراحی‌شده (نسخهٔ ۲ — بازخورد کاربر)
 * بررسی‌ها:
 *  ۱) وکتور لبهٔ فوتر روی درز قرار دارد (مرکزش ≈ لبهٔ بالای فوتر) با z-index=20
 *  ۲) نوار مزیت‌ها خارج از فوتر و بعد از FAQ؛ شفاف، بوردر سبز، ۲ آیتم در ردیف، بدون بریدگی متن
 *  ۳) بخش لینک‌ها بالای بخش تماس (زیر هم)
 *  ۴) دقیقاً ۴ جایگاه نماد اعتماد هم‌اندازه در انتهای فوتر
 *  ۵) اسکرین‌شات لبهٔ بالایی + فوتر کامل
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const CHROME = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  await page.addInitScript(() => sessionStorage.setItem('pars:splash-shown', '1'));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  // اطمینان از رندر فوتر و بخش مزیت‌ها
  await page.locator('footer[aria-label="فوتر فروشگاه"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  const r = await page.evaluate(() => {
    const footer = document.querySelector('footer[aria-label="فوتر فروشگاه"]') as HTMLElement;
    const strip = document.querySelector('section[aria-label="خدمات فروشگاه"]') as HTMLElement;
    const crest = footer.querySelector('div > svg')?.parentElement as HTMLElement | null;
    const crestBox = crest?.getBoundingClientRect();
    const footBox = footer.getBoundingClientRect();

    const crestOnEdge = crestBox
      ? Math.abs((crestBox.top + crestBox.bottom) / 2 - footBox.top) < 6
      : false;
    const crestZ = crest ? Number(getComputedStyle(crest).zIndex) : -1;

    // نوار مزیت‌ها: بعد از FAQ، قبل از فوتر، شفاف، بوردر سبز
    const stripBox = strip?.getBoundingClientRect();
    const stripStyle = strip ? getComputedStyle(strip) : null;
    const stripOrder = stripBox && footBox ? stripBox.bottom < footBox.top + 1 : false;
    const stripTransparent = stripStyle ? stripStyle.backgroundColor === 'rgba(0, 0, 0, 0)' : false;
    const stripBorder = stripStyle ? parseFloat(stripStyle.borderTopWidth) > 0 : false;

    // دو آیتم در هر ردیف + بدون بریدگی
    const items = Array.from(
      strip?.querySelectorAll(':scope > div > div') ?? [],
    ) as HTMLElement[];
    const rowTops = items.map((el) => Math.round(el.getBoundingClientRect().top));
    const twoPerRow =
      items.length === 4 &&
      rowTops[0] === rowTops[1] &&
      rowTops[1] < rowTops[2] &&
      rowTops[2] === rowTops[3];
    const noClip = items.every(
      (el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
    );

    // لینک‌ها بالای تماس
    const nav = footer.querySelector('nav[aria-label="دسترسی سریع"]') as HTMLElement;
    const contact = footer.querySelector('[aria-label="تماس با ما"]') as HTMLElement;
    const stacked = contact
      ? contact.getBoundingClientRect().top >= nav.getBoundingClientRect().bottom - 2
      : false;
    const linkCount = footer.querySelectorAll('nav[aria-label="دسترسی سریع"] button').length;

    // ۴ جایگاه نماد اعتماد هم‌اندازه
    const tiles = Array.from(
      footer.querySelectorAll('[aria-label="نمادهای اعتماد"] .aspect-\\[5\\/4\\]'),
    ) as HTMLElement[];
    const w0 = tiles[0]?.getBoundingClientRect().width ?? 0;
    const h0 = tiles[0]?.getBoundingClientRect().height ?? 0;
    const badgeRow = tiles.length === 4 && tiles.every((t) => {
      const b = t.getBoundingClientRect();
      return Math.abs(b.width - w0) < 1 && Math.abs(b.height - h0) < 1;
    });

    return {
      crestOnEdge,
      crestZ,
      stripOrder,
      stripTransparent,
      stripBorder,
      twoPerRow,
      noClip,
      stacked,
      linkCount,
      badgeRow,
    };
  });
  console.log('FOOTER_CHECK', JSON.stringify(r, null, 2));

  fs.mkdirSync('/tmp/render', { recursive: true });

  // اسکرین‌شات لبهٔ بالایی فوتر (وکتور روی درز)
  await page.evaluate(() => {
    const f = document.querySelector('footer[aria-label="فوتر فروشگاه"]') as HTMLElement;
    let sc: HTMLElement | null = f;
    while (sc && sc.scrollHeight <= sc.clientHeight + 5) sc = sc.parentElement;
    (sc ?? document.scrollingElement)?.scrollTo({ top: f.offsetTop - 420, behavior: 'instant' });
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/render/footer-edge-v2.png' });

  // اسکرین‌شات فوتر کامل
  const footer = page.locator('footer[aria-label="فوتر فروشگاه"]');
  await footer.screenshot({ path: '/tmp/render/footer-full-v2.png' });

  const pass =
    r.crestOnEdge &&
    r.crestZ >= 20 &&
    r.stripOrder &&
    r.stripTransparent &&
    r.stripBorder &&
    r.twoPerRow &&
    r.noClip &&
    r.stacked &&
    r.linkCount >= 5 &&
    r.badgeRow;

  await browser.close();
  console.log(pass ? 'FOOTER_TEST_PASS' : 'FOOTER_TEST_FAIL');
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error('FOOTER_TEST_ERROR', e);
  process.exit(1);
});
