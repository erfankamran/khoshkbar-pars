/**
 * تست لینک‌های بیرونی env در فوتر (ترب/ایمالز/اینماد/ساماندهی — درخواست کاربر)
 * اجرا: bun scripts/test-env-links.ts
 * خروجی JSON وضعیت + اسکرین‌شات /tmp/render/footer-env.png
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
  await page.locator('footer[aria-label="فوتر فروشگاه"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => {
    const footer = document.querySelector('footer[aria-label="فوتر فروشگاه"]') as HTMLElement;
    const quick = Array.from(
      footer.querySelectorAll('nav[aria-label="دسترسی سریع"] button'),
    ) as HTMLElement[];
    const quickTexts = quick.map((b) => b.textContent?.trim() ?? '');

    // لینک‌های env دسترسی سریع
    const torobLink = quickTexts.includes('فروشگاه ما در ترب');
    const emallsLink = quickTexts.includes('فروشگاه ما در ایمالز');

    // نمادهای اعتماد — اینماد/ساماندهی با لینک env باید <a> شوند
    const badgeAnchors = Array.from(
      footer.querySelectorAll('[aria-label="نمادهای اعتماد"] a[target="_blank"]'),
    ) as HTMLAnchorElement[];
    const badgeHrefs = badgeAnchors.map((a) => a.href);

    // امنیت: هیچ javascript: نباید رندر شود
    const badProtocol = [...badgeHrefs].some((h) => h.startsWith('javascript:'));

    return { torobLink, emallsLink, badgeHrefs, badProtocol, quickCount: quick.length };
  });

  fs.mkdirSync('/tmp/render', { recursive: true });
  const footer = page.locator('footer[aria-label="فوتر فروشگاه"]');
  await footer.screenshot({ path: '/tmp/render/footer-env.png' });
  await browser.close();

  console.log('ENV_LINKS_CHECK', JSON.stringify(r, null, 2));
  if (r.badProtocol) {
    console.log('ENV_LINKS_FAIL (unsafe protocol rendered)');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('ENV_LINKS_ERROR', e);
  process.exit(1);
});
