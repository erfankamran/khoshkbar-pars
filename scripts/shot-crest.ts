/**
 * پیش‌نمایش بصری وکتور لبهٔ فوتر — اسکرین‌شات درز کرم/تیره
 */
import { chromium } from 'playwright-core';

const CHROME = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 460, height: 400 } });
  await page.goto('file:///home/z/my-project/scripts/crest-preview.html');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/render/crest-preview.png' });
  await browser.close();
  console.log('CREST_PREVIEW_OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
