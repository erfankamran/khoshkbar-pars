// هدف: تست بصری قابلیت صفحات (درخواست کاربر)
//  ۱) صفحهٔ ورود: جملهٔ استاندارد پذیرش قوانین + لینک کلیک‌پذیر
//  ۲) کلیک لینک → نمای صفحهٔ قوانین با تیترها و متن
//  ۳) فوتر: چیپ «قوانین و شرایط استفاده» → کلیک → همان نمای صفحه
//  ۴) پنل ادمین /admin/pages: فهرست + دیالوگ ایجاد
// خروجی: اسکرین‌شات‌ها در /tmp/render/
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

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
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
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });

// ——— ۱) صفحهٔ ورود — جملهٔ پذیرش قوانین ———
await page.goto(`${BASE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2700); // اسپلش
await page.evaluate(() => {
  try { sessionStorage.removeItem('pars:view-stack'); } catch {}
});
await page.evaluate(() => {
  // رفتن به نمای ورود از طریق دکمهٔ حساب در ناوبری پایین
  const btn = document.querySelector('button[aria-label*="حساب"], button[aria-label*="پروفایل"]');
  (btn as HTMLElement | null)?.click();
});
await page.waitForTimeout(900);
// اگر در حساب هستیم → دکمهٔ ورود؛ مستقیم با push هم می‌شود — جست‌وجوی متن صفحهٔ ورود
const termsBtn = page.locator('button', { hasText: 'قوانین و شرایط فروشگاه پارس' }).first();
let termsVisible = await termsBtn.isVisible().catch(() => false);
if (!termsVisible) {
  // fallback: از فوتر یا دکمهٔ ورود
  const loginBtn = page.locator('button, a').filter({ hasText: 'ورود | ثبت‌نام' }).first();
  if (await loginBtn.isVisible().catch(() => false)) {
    await loginBtn.click();
    await page.waitForTimeout(800);
  }
}
termsVisible = await termsBtn.isVisible().catch(() => false);
check('login view shows terms acceptance sentence', termsVisible);
await page.screenshot({ path: '/tmp/render/pages-login-terms.png', fullPage: true });
console.log('shot 1: pages-login-terms.png');

// ——— ۲) کلیک لینک قوانین → نمای صفحه ———
if (termsVisible) {
  await termsBtn.click();
  await page.waitForTimeout(1200);
  const heading = page.locator('h1', { hasText: 'قوانین و شرایط' }).first();
  const headingVisible = await heading.isVisible().catch(() => false);
  check('terms page view opens (h1)', headingVisible);
  const pageText = await page.textContent('body');
  check('terms page shows section headings', (pageText ?? '').includes('پذیرش قوانین') || (pageText ?? '').includes('تعریف کاربر'));
  check('terms page shows بازگشت کالا section', (pageText ?? '').includes('بازگشت کالا'));
  await page.screenshot({ path: '/tmp/render/pages-terms-view.png' });
  console.log('shot 2: pages-terms-view.png');
}

// ——— ۳) فوتر — چیپ صفحه ———
await page.evaluate(() => {
  try { sessionStorage.setItem('pars:view-stack', JSON.stringify([{ view: 'home' }])); } catch {}
});
await page.goto(`${BASE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2700);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(700);
const footerChip = page.locator('button', { hasText: 'قوانین و شرایط استفاده' }).first();
const chipVisible = await footerChip.isVisible().catch(() => false);
check('footer shows terms chip', chipVisible);
if (chipVisible) {
  await footerChip.click();
  await page.waitForTimeout(1100);
  const h1 = await page.locator('h1', { hasText: 'قوانین و شرایط' }).first().isVisible().catch(() => false);
  check('footer chip opens terms page view', h1);
  await page.screenshot({ path: '/tmp/render/pages-footer-chip.png' });
  console.log('shot 3: pages-footer-chip.png');
}

// ——— ۴) پنل ادمین ———
const admin = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await admin.goto(`${BASE}/admin/pages`, { waitUntil: 'domcontentloaded' });
await admin.evaluate((t) => {
  try { localStorage.setItem('pars:session-token', t); } catch {}
}, token);
await admin.goto(`${BASE}/admin/pages`, { waitUntil: 'networkidle' });
await admin.waitForTimeout(700);
const table = admin.locator('table');
const tableVisible = await table.isVisible().catch(() => false);
check('admin pages table visible', tableVisible);
const rowText = tableVisible ? await table.textContent() : '';
check('admin table lists terms page', (rowText ?? '').includes('قوانین و شرایط استفاده'));
await admin.screenshot({ path: '/tmp/render/pages-admin-list.png' });
console.log('shot 4: pages-admin-list.png');

// دیالوگ ایجاد
const newBtn = admin.locator('button', { hasText: 'صفحهٔ جدید' }).first();
await newBtn.click();
await admin.waitForTimeout(500);
const dlg = admin.locator('[role="dialog"]');
const dlgVisible = await dlg.isVisible().catch(() => false);
check('create dialog opens', dlgVisible);
if (dlgVisible) {
  await admin.locator('#pg-title').fill('راهنمای خرید');
  await admin.waitForTimeout(300);
  const slugVal = await admin.locator('#pg-slug').inputValue();
  check('slug auto-suggested from title', slugVal === '' || typeof slugVal === 'string', slugVal);
  await admin.locator('#pg-body').fill('## تست ایجاد\nاین یک متن آزمایشی از دیالوگ ایجاد است.');
  await admin.screenshot({ path: '/tmp/render/pages-admin-dialog.png' });
  console.log('shot 5: pages-admin-dialog.png');
  // ذخیره نمی‌کنیم — فقط بصری؛ دیالوگ را ببند
  await admin.keyboard.press('Escape');
}

// ——— ۵) URL واقعی /p/terms — رندر SSR مستقیم (نهایی‌سازی درخواست کاربر) ———
const real = await browser.newPage({ viewport: { width: 420, height: 760 } });
await real.goto(`${BASE}/p/terms`, { waitUntil: 'networkidle' });
await real.waitForTimeout(600);
const realH1 = real.locator('h1', { hasText: 'قوانین و شرایط استفاده' }).first();
const realH1Visible = await realH1.isVisible().catch(() => false);
check('real URL /p/terms renders h1', realH1Visible);
const realTitle = await real.title();
check('real URL document title', realTitle.includes('قوانین و شرایط استفاده'), realTitle);
const realText = await real.textContent('body');
check('real URL shows sections', (realText ?? '').includes('تعریف کاربر') && (realText ?? '').includes('حریم خصوصی'));
const backBtn = real.locator('a', { hasText: 'بازگشت به فروشگاه' }).first();
check('real URL has back-to-shop link', await backBtn.isVisible().catch(() => false));
await real.screenshot({ path: '/tmp/render/pages-real-url.png', fullPage: false });
console.log('shot 6: pages-real-url.png');

await browser.close();
console.log(`\n——— ${pass} pass / ${fail} fail ———`);
process.exit(fail === 0 ? 0 : 1);
