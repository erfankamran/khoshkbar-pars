// هدف: تست کلیک کاربر از داشبورد (درخواست کاربر)
//  ۱) کارت «کاربران» → رفتن به /admin/users
//  ۲) کلیک روی مشتری در «مشتریان اخیر» → دیالوگ جزئیات کامل با «مجموع خرید»
//  ۳) کلیک روی نام مشتری در «سفارش‌های اخیر» → همان دیالوگ
// خروجی: ۳ اسکرین‌شات در /tmp/render/
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// ورود به پنل
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => {
  try { localStorage.setItem('pars:session-token', t); } catch {}
}, token);
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// ——— ۱) بخش مشتریان اخیر رندر شده؟ ———
const recentUsersSection = page.locator('section[aria-label="مشتریان اخیر"]');
const sectionVisible = await recentUsersSection.isVisible().catch(() => false);
check('«مشتریان اخیر» section visible', sectionVisible);
await page.screenshot({ path: '/tmp/render/dashboard-full.png', fullPage: true });
console.log('shot 1: dashboard-full.png');

const userCards = recentUsersSection.locator('button').filter({ hasText: 'سفارش' });
const cardCount = await userCards.count();
console.log(`  ℹ️ recent user cards: ${cardCount}`);

// ——— ۲) کلیک روی اولین مشتری → دیالوگ ———
if (cardCount > 0) {
  await userCards.first().click();
  const dlg = page.locator('[role="dialog"]');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  const dlgText = await dlg.textContent();
  check('dialog opens from مشتریان اخیر', await dlg.isVisible());
  check('dialog shows جزئیات کاربر', (dlgText ?? '').includes('جزئیات کاربر'));
  check('dialog shows مجموع خرید', (dlgText ?? '').includes('مجموع خرید'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/render/dashboard-user-dialog.png' });
  console.log('shot 2: dashboard-user-dialog.png');

  // بستن دیالوگ — Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ——— ۳) کلیک روی نام مشتری در سفارش‌های اخیر (جدول دسکتاپ) ———
const orderCustomerBtn = page
  .locator('section[aria-label="سفارش‌های اخیر"] tbody button')
  .first();
const hasOrders = await orderCustomerBtn.isVisible().catch(() => false);
if (hasOrders) {
  await orderCustomerBtn.click();
  const dlg2 = page.locator('[role="dialog"]');
  await dlg2.waitFor({ state: 'visible', timeout: 8000 });
  const t2 = await dlg2.textContent();
  check('dialog opens from recent-order customer click', await dlg2.isVisible());
  check('dialog shows آدرس‌ها/سفارش‌های اخیر blocks', (t2 ?? '').includes('سفارش‌های اخیر'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/render/dashboard-order-customer-dialog.png' });
  console.log('shot 3: dashboard-order-customer-dialog.png');
  await page.keyboard.press('Escape');
} else {
  console.log('  ℹ️ سفارشی در جدول نیست — تست کلیک سفارش صرف‌نظر شد');
}

// ——— ۴) کارت «کاربران» → /admin/users ———
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
const usersCard = page.locator('a[href="/admin/users"]').filter({ hasText: 'کاربران' }).first();
const cardOk = await usersCard.isVisible().catch(() => false);
check('کاربران StatCard is clickable link', cardOk);
if (cardOk) {
  await usersCard.click();
  await page.waitForURL('**/admin/users', { timeout: 8000 });
  check('navigates to /admin/users', page.url().endsWith('/admin/users'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/render/dashboard-card-to-users.png' });
  console.log('shot 4: dashboard-card-to-users.png');
}

await browser.close();
console.log(`\n——— ${pass} pass / ${fail} fail ———`);
process.exit(fail === 0 ? 0 : 1);
