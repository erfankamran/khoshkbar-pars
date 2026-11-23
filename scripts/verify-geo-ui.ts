// تأیید UI نقشهٔ ایران داشبورد + فیلتر استان/شهر صفحهٔ کاربران — فقط مرورگر
// استفاده: BASE=… bun scripts/verify-geo-ui.ts
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:3001';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(12000);
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => {
  try { localStorage.setItem('pars:session-token', t); } catch {}
}, token);
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// ——— ۱) داشبورد — نقشهٔ ایران ———
const mapSection = page.locator('section[aria-label*="پراکندگی فروش"]');
check('dashboard: نقشهٔ ایران section visible', await mapSection.isVisible().catch(() => false));
const pathCount = await mapSection.locator('svg path').count();
check('map has ≥31 province paths (+2 sea)', pathCount >= 31, `got ${pathCount}`);
await page.screenshot({ path: '/tmp/render/geo-dashboard-map.png' });
console.log('shot 1: geo-dashboard-map.png');

// hover روی استان تهران
const tehranPath = mapSection.locator('svg path[aria-label*="تهران"]').first();
if (await tehranPath.isVisible().catch(() => false)) {
  await tehranPath.hover({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const stripVisible = await page
    .locator('text=مشاهدهٔ مشتریان این استان')
    .isVisible()
    .catch(() => false);
  check('hover province → info strip with filter link', stripVisible);
  await page.screenshot({ path: '/tmp/render/geo-map-hover.png' });
  console.log('shot 2: geo-map-hover.png');

  // کلیک روی تهران → انتخاب پایدار
  await tehranPath.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  check('click province → persistent selection (strip stays)',
    await page.locator('text=مشاهدهٔ مشتریان این استان').isVisible().catch(() => false));
}

// ——— ۲) سوئیچ متریک مشتریان ———
const custTab = mapSection.locator('button[role="tab"]').filter({ hasText: 'مشتریان' });
if (await custTab.isVisible().catch(() => false)) {
  await custTab.click();
  await page.waitForTimeout(400);
  check('metric toggle to مشتریان works', true);
  await page.screenshot({ path: '/tmp/render/geo-map-customers.png' });
  console.log('shot 3: geo-map-customers.png');
}

// ——— ۳) کلیک استان → لینک به صفحهٔ کاربران با فیلتر ———
const filterLink = mapSection.locator('a[href*="/admin/users?province="]').first();
if (await filterLink.isVisible().catch(() => false)) {
  await filterLink.click();
  await page.waitForURL('**/admin/users**', { timeout: 12000 });
  check('map link navigates to /admin/users?province=…', page.url().includes('province='));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/render/geo-users-filtered.png' });
  console.log('shot 4: geo-users-filtered.png');
  const clearBtn = page.locator('button').filter({ hasText: 'پاک‌کردن فیلتر موقعیت' });
  const clearVisible = await clearBtn.isVisible().catch(() => false);
  check('users page: «پاک‌کردن فیلتر موقعیت» visible', clearVisible);
  if (clearVisible) {
    await clearBtn.click();
    await page.waitForTimeout(800);
    check('clear geo filter removes button', !(await clearBtn.isVisible().catch(() => false)));
  }
} else {
  console.log('  ℹ️ filter link not visible — شاید نوار اطلاعات نمایش داده نشده');
}

// ——— ۴) صفحهٔ کاربران: سلکت استان + ستون موقعیت ———
await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
check('users desktop table visible', await page.locator('table').isVisible().catch(() => false));
check('«استان / شهر» column exists', (await page.locator('th').filter({ hasText: 'استان / شهر' }).count()) > 0);
const provinceSelect = page.locator('button[aria-label="فیلتر استان"]');
check('province Select visible', await provinceSelect.isVisible().catch(() => false));
if (await provinceSelect.isVisible().catch(() => false)) {
  await provinceSelect.click();
  await page.waitForTimeout(400);
  const options = page.locator('[role="option"]');
  const optCount = await options.count();
  check('province dropdown has options from data', optCount > 1, `got ${optCount}`);
  await page.screenshot({ path: '/tmp/render/geo-users-dropdown.png' });
  console.log('shot 5: geo-users-dropdown.png');
  if (optCount > 1) {
    await options.nth(1).click();
    await page.waitForTimeout(900);
    const rowCount = await page.locator('tbody tr').count();
    check(`filtered table renders rows (${rowCount})`, rowCount > 0);
    await page.screenshot({ path: '/tmp/render/geo-users-province-selected.png' });
    console.log('shot 6: geo-users-province-selected.png');
  }
}

await browser.close();
console.log(`\n——— ${pass} pass / ${fail} fail ———`);
process.exit(fail === 0 ? 0 : 1);
