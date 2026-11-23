// شات و راستی‌آزمایی نقشهٔ ایران در داشبورد و فاکتورهای فروش — با اسکرول به بخش نقشه
// خروجی: /tmp/render/map-dashboard.png و /tmp/render/map-orders.png + شمارش path استان‌ها
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3000';

async function otpLogin(phone: string): Promise<string | null> {
  await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  await new Promise((r) => setTimeout(r, 300));
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code: '123456' }),
  });
  const body = (await verifyRes.json()) as { data?: { sessionToken?: string } };
  return body.data?.sessionToken ?? null;
}

const token = await otpLogin('09120000000');
if (!token) throw new Error('admin login failed');

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ??
    '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([
  { name: 'pars_session', value: token, domain: 'localhost', path: '/' },
]);
const page = await ctx.newPage();

async function shootMap(url: string, shot: string, label: string) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // پایین‌ترین عنصر نقشه را پیدا و اسکرول کن
  const svg = page.locator('svg').filter({ has: page.locator('path') }).last();
  const mapHeading = page.getByText(/نقشهٔ ایران|نقشه ایران/).first();
  const hasHeading = await mapHeading.isVisible().catch(() => false);
  if (hasHeading) await mapHeading.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(600);
  const pathCount = await page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll('svg'));
    const map = svgs
      .filter((s) => s.querySelectorAll('path').length > 20)
      .sort((a, b) => b.querySelectorAll('path').length - a.querySelectorAll('path').length)[0];
    if (!map) return 0;
    map.scrollIntoView({ block: 'center' });
    return map.querySelectorAll('path').length;
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `/tmp/render/${shot}`, fullPage: false });
  console.log(`${label}: heading=${hasHeading} mapPaths=${pathCount} → /tmp/render/${shot}`);
}

await shootMap('/admin', 'map-dashboard.png', 'dashboard');
await shootMap('/admin/orders', 'map-orders.png', 'orders');
await browser.close();
