/** تشخیص سریع: چه چیزی در /admin/settings رندر می‌شود؟ */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)));

  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.fill('#admin-phone', '09121111111');
  await page.getByText('ورود سریع با کد مادر').click();
  await page.waitForURL(`${BASE}/admin`, { timeout: 20000 });
  await page.waitForTimeout(2000);

  console.log('URL now:', page.url());
  console.log('header count:', await page.locator('header').count());
  console.log('nav count:', await page.locator('header nav').count());
  console.log('nav[aria-label] count:', await page.locator('nav[aria-label="ناوبری مدیریت"]').count());
  console.log('aside count:', await page.locator('aside').count());
  const body = await page.textContent('body');
  console.log('body snippet:', body?.replace(/\s+/g, ' ').slice(0, 300));
  console.log('console errors:', errors.length ? errors.slice(0, 5) : 'هیچ');
  await page.screenshot({ path: '/tmp/render/debug-admin.png' });
  await browser.close();
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
