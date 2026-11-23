// شات هدفمند از بالای کارت اسپلش (کلید فعال/غیرفعال + پیش‌نمایش زنده)
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
const page = await browser.newPage({ viewport: { width: 420, height: 820 } });
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => {
  try { localStorage.setItem('pars:session-token', t); } catch {}
}, token);
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });

// بالای کارت اسپلش: سوییچ «نمایش صفحه آغازین»
const sw = page.locator('button[role="switch"][aria-label="نمایش صفحه آغازین (اسپلش)"]');
await sw.waitFor({ state: 'visible', timeout: 15000 });
await sw.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/render/admin-splash-top.png' });
console.log('shot: admin-splash-top.png');

await browser.close();
console.log('done');
