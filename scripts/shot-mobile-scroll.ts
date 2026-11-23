// اسکرین‌شات موبایل از انتهای صفحه اصلی — تشخیص «ادامهٔ بعد از منو»
import { chromium } from 'playwright-core';

const CHROME = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);

  // اندازه‌گیری اسکرول بدنه و نمای داخلی
  const metrics = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    // نمای اسکرول‌شوندهٔ داخلی (motion.div با overflow-y-auto)
    const scrollables: HTMLElement[] = [];
    document.querySelectorAll('div').forEach((d) => {
      const el = d as HTMLElement;
      if (el.scrollHeight > el.clientHeight + 4) {
        const st = getComputedStyle(el);
        if (st.overflowY === 'auto' || st.overflowY === 'scroll') scrollables.push(el);
      }
    });
    return {
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      htmlScrollHeight: html.scrollHeight,
      bodyCanScroll: body.scrollHeight > body.clientHeight + 2,
      scrollables: scrollables.slice(0, 5).map((el) => ({
        sh: el.scrollHeight,
        ch: el.clientHeight,
        firstLabel: el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? null,
        ariaLabel: el.getAttribute('aria-label'),
      })),
    };
  });
  console.log('METRICS:', JSON.stringify(metrics, null, 1));

  // اسکرول کامل به پایین داخل نمای داخلی
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div')) as HTMLElement[];
    const sc = els.find((el) => {
      const st = getComputedStyle(el);
      return st.overflowY === 'auto' && el.scrollHeight > el.clientHeight + 100;
    });
    if (sc) sc.scrollTop = sc.scrollHeight;
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '/tmp/render/mobile-bottom.png' });
  console.log('shot: /tmp/render/mobile-bottom.png');

  // یک اسکرین‌شات هم از بالای صفحه برای مقایسه
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div')) as HTMLElement[];
    const sc = els.find((el) => {
      const st = getComputedStyle(el);
      return st.overflowY === 'auto' && el.scrollHeight > el.clientHeight + 100;
    });
    if (sc) sc.scrollTop = 0;
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/render/mobile-top.png' });
  console.log('shot: /tmp/render/mobile-top.png');

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
