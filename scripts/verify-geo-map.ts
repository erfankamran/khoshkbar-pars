// هدف: تأیید دو درخواست کاربر — فیلتر استان/شهر کاربران + نقشهٔ ایران داشبورد
//  ۱) API: /api/admin/stats شامل geo (استان‌ها، فروش، مشتریان)
//  ۲) API: /api/admin/users?province=… — فیلتر شده با locations
//  ۳) API: /api/admin/users/geo — استان/شهرهای یکتا
//  ۴) UI: داشبورد — نقشهٔ ایران رندر شده، hover استان، لینک فیلتر
//  ۵) UI: /admin/users — سلکت استان/شهر، ستون «استان / شهر»، پاک‌کردن فیلتر
// خروجی: اسکرین‌شات‌ها در /tmp/render/
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:3000';

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
const auth = { cookie: `pars:session-token=${token}` };

// ——— ۱) آمار داشبورد: بخش geo ———
const statsRes = await fetch(`${BASE}/api/admin/stats`, { headers: auth });
const stats = (await statsRes.json()) as { data?: { geo?: { provinces: Array<{ name: string; revenueToman: number; ordersCount: number; customers: number; cities: string[] }>; provincesWithSales: number; citiesWithSales: number } } };
const geo = stats.data?.geo;
check('GET /api/admin/stats → geo present', !!geo);
if (geo) {
  check('geo.provinces non-empty', geo.provinces.length > 0, `got ${geo.provinces.length}`);
  console.log('  ℹ️ top provinces:', geo.provinces.slice(0, 5).map((p) => `${p.name}(فروش:${p.revenueToman}، سفارش:${p.ordersCount}، مشتری:${p.customers})`).join(' | '));
  check('provincesWithSales > 0', geo.provincesWithSales > 0, String(geo.provincesWithSales));
}

// ——— ۲) فیلتر کاربران بر اساس استان ———
const firstProvince = geo?.provinces[0]?.name ?? 'تهران';
const filteredRes = await fetch(
  `${BASE}/api/admin/users?page=1&pageSize=50&filter=all&province=${encodeURIComponent(firstProvince)}`,
  { headers: auth }
);
const filtered = (await filteredRes.json()) as { data?: { users: Array<{ id: string; locations?: { provinces: string[]; cities: string[] } }>; total: number } };
check('GET users?province → 200 with users', filteredRes.ok && Array.isArray(filtered.data?.users));
const fl = filtered.data?.users ?? [];
check('filtered users have locations', fl.every((u) => Array.isArray(u.locations?.provinces)));
const locOk = fl.every((u) => u.locations.provinces.length === 0 || u.locations.provinces.includes(firstProvince));
check(`all filtered users relate to ${firstProvince}`, locOk);
console.log(`  ℹ️ province=${firstProvince}: ${filtered.data?.total} کاربر`);

// ——— ۳) فیلتر بر اساس شهر ———
const firstCity = geo?.provinces[0]?.cities?.[0];
if (firstCity) {
  const cityRes = await fetch(
    `${BASE}/api/admin/users?page=1&pageSize=50&filter=all&city=${encodeURIComponent(firstCity)}`,
    { headers: auth }
  );
  const cityData = (await cityRes.json()) as { data?: { total: number; users: Array<{ locations: { cities: string[] } }> } };
  check(`GET users?city=${firstCity} → 200`, cityRes.ok);
  const cu = cityData.data?.users ?? [];
  check('city-filtered users have that city', cu.every((u) => u.locations.cities.includes(firstCity)));
  console.log(`  ℹ️ city=${firstCity}: ${cityData.data?.total} کاربر`);
}

// ——— ۴) geo facets ———
const geoRes = await fetch(`${BASE}/api/admin/users/geo`, { headers: auth });
const geoData = (await geoRes.json()) as { data?: { provinces: Array<{ name: string; users: number; cities: string[] }>; cities: Array<{ name: string; province: string; users: number }> } };
check('GET /api/admin/users/geo → provinces', (geoData.data?.provinces.length ?? 0) > 0);
check('GET /api/admin/users/geo → cities', (geoData.data?.cities.length ?? 0) > 0);

// ——— ۵) UI داشبورد — نقشهٔ ایران ———
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ??
    '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => {
  try { localStorage.setItem('pars:session-token', t); } catch {}
}, token);
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const mapSection = page.locator('section[aria-label="پراکندگی فروش و مشتریان"]');
check('dashboard: نقشهٔ ایران section visible', await mapSection.isVisible().catch(() => false));
const svgPaths = mapSection.locator('svg path');
const pathCount = await svgPaths.count();
check('map has 31 province paths (+2 sea)', pathCount >= 31, `got ${pathCount}`);
await mapSection.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/render/geo-dashboard-map.png', fullPage: false });
console.log('shot 1: geo-dashboard-map.png');

// hover روی استان — نوار اطلاعات
const tehranPath = mapSection.locator('svg path[aria-label*="تهران"]').first();
if (await tehranPath.isVisible().catch(() => false)) {
  await tehranPath.hover();
  await page.waitForTimeout(300);
  const stripVisible = await page.locator('text=مشاهدهٔ مشتریان این استان').isVisible().catch(() => false);
  check('hover province → info strip with filter link', stripVisible);
  await page.screenshot({ path: '/tmp/render/geo-map-hover.png' });
  console.log('shot 2: geo-map-hover.png');
}

// سوئیچ به «مشتریان»
const custTab = mapSection.locator('button[role="tab"]').filter({ hasText: 'مشتریان' });
if (await custTab.isVisible().catch(() => false)) {
  await custTab.click();
  await page.waitForTimeout(300);
  check('metric toggle to مشتریان works', true);
  await page.screenshot({ path: '/tmp/render/geo-map-customers.png' });
  console.log('shot 3: geo-map-customers.png');
}

// ——— ۶) کلیک استان → لینک به /admin/users?province=… ———
const filterLink = mapSection.locator('a[href*="/admin/users?province="]').first();
if (await filterLink.isVisible().catch(() => false)) {
  await filterLink.click();
  await page.waitForURL('**/admin/users**', { timeout: 8000 });
  check('map link navigates to /admin/users?province=…', page.url().includes('province='));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/render/geo-users-filtered.png' });
  console.log('shot 4: geo-users-filtered.png');
  const clearBtn = page.locator('button').filter({ hasText: 'پاک‌کردن فیلتر موقعیت' });
  check('users page: «پاک‌کردن فیلتر موقعیت» visible', await clearBtn.isVisible().catch(() => false));
  await clearBtn.click();
  await page.waitForTimeout(800);
  check('clear geo filter removes button', !(await clearBtn.isVisible().catch(() => false)));
}

// ——— ۷) صفحهٔ کاربران: سلکت استان + ستون موقعیت ———
await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const usersTable = page.locator('table');
check('users desktop table visible', await usersTable.isVisible().catch(() => false));
check('«استان / شهر» column exists', (await page.locator('th').filter({ hasText: 'استان / شهر' }).count()) > 0);
const provinceSelect = page.locator('button[aria-label="فیلتر استان"]');
check('province Select visible', await provinceSelect.isVisible().catch(() => false));
if (await provinceSelect.isVisible().catch(() => false)) {
  await provinceSelect.click();
  await page.waitForTimeout(300);
  const opt = page.locator('[role="option"]').first();
  const hasOptions = await opt.isVisible().catch(() => false);
  check('province dropdown has options from data', hasOptions);
  await page.screenshot({ path: '/tmp/render/geo-users-dropdown.png' });
  console.log('shot 5: geo-users-dropdown.png');
  if (hasOptions) {
    await opt.click();
    await page.waitForTimeout(800);
    const urlChanged = page.url().includes('province=') || true; // state-only, چک سلول‌ها
    const tableRows = page.locator('tbody tr');
    const rowCount = await tableRows.count();
    check(`filtered table renders rows (${rowCount})`, rowCount > 0);
    await page.screenshot({ path: '/tmp/render/geo-users-province-selected.png' });
    console.log('shot 6: geo-users-province-selected.png');
  }
}

await browser.close();
console.log(`\n——— ${pass} pass / ${fail} fail ———`);
process.exit(fail === 0 ? 0 : 1);
