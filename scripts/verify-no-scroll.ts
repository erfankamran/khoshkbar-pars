// بررسی حذف اسکرول بعد از منوی موبایل — صفحه اصلی
// اجرا: npx tsx scripts/verify-no-scroll.ts
import { chromium } from 'playwright-core';

const EXE = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';

async function main() {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const W = Number(process.env.VP_W ?? 390);
  const H = Number(process.env.VP_H ?? 844);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500); // پایان Splash + هیدراتیشن

  const m = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    docScrollHeight: document.documentElement.scrollHeight,
    docClientHeight: document.documentElement.clientHeight,
    bodyScrollHeight: document.body.scrollHeight,
    docScrollTop: document.documentElement.scrollTop,
  }));

  const bodyOverflow = m.docScrollHeight - m.docClientHeight;
  console.log(JSON.stringify(m, null, 2));
  console.log(bodyOverflow <= 0 ? 'NO-PAGE-SCROLL ✓' : `*** BODY STILL SCROLLS ${bodyOverflow}px ***`);

  // اسکرول پنجره تا انتها → اگر چیزی بعد از قاب باشد اینجا معلوم می‌شود
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const afterScroll = await page.evaluate(() => document.documentElement.scrollTop);
  console.log(afterScroll === 0 ? 'WINDOW-CANNOT-SCROLL ✓' : `*** WINDOW SCROLLED TO ${afterScroll}px ***`);

  // ارتفاع قاب اپ و دید بودن منوی پایین
  const frame = await page.evaluate(() => {
    const el = document.querySelector('nav[aria-label="ناوبری اصلی"]');
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    return { found: true, top: r.top, bottom: r.bottom, vpH: window.innerHeight };
  });
  console.log('bottomnav:', JSON.stringify(frame));
  console.log(frame.found && Math.abs(frame.bottom - frame.vpH) <= 1 ? 'NAV-VISIBLE-AT-BOTTOM ✓' : '*** NAV NOT AT BOTTOM ***');

  await page.screenshot({ path: '/tmp/render/mobile-noscroll.png' });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
