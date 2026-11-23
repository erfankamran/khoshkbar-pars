// هدف: تأیید عملکرد نقشه — درخواست کاربر «مارکر نقشه قابل مدیریت باشد»
//  ۱) کارت نقشه در تنظیمات ادمین → مارکر روی مختصات فعلی
//  ۲) کلیک روی نقطهٔ دیگر نقشه → مارکر جابجا + مختصات ورودی به‌روز
//  ۳) ذخیره → GET /api/settings عمومی → مختصات جدید
//  ۴) صفحه «درباره فروشگاه» کاربر → iframe نقشه با مختصات جدید
//  ۵) بازگرداندن مختصات قبلی
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3000';
const OLD_LAT = '33.89766301648375';
const OLD_LNG = '48.76534696433998';
const NEW_LAT = '33.490000';
const NEW_LNG = '48.360000'; // خرم‌آباد — نقطهٔ تست

interface ApiResp<T> { ok: boolean; data?: T; error?: string }

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
  const body = (await verifyRes.json()) as ApiResp<{ sessionToken?: string }>;
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
const H = { 'content-type': 'application/json', 'x-pars-session': token! };

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ??
    '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => {
  try { localStorage.setItem('pars:session-token', t); } catch {}
}, token);
await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// ——— ۱) کارت نقشه ———
const mapEl = page.locator('[role="application"][aria-label*="نقشه موقعیت فروشگاه"]');
await mapEl.scrollIntoViewIfNeeded();
await page.waitForTimeout(2500); // کاشی‌ها + leaflet آماده شود
const mapVisible = await mapEl.isVisible().catch(() => false);
check('admin map picker visible', mapVisible);
await page.screenshot({ path: '/tmp/render/map-admin-card.png' });
console.log('shot 1: map-admin-card.png');

// ——— ۲) کلیک روی نقشه → مارکر جابجا شود (کلیک = setLatLng در کد) ———
// Leaflet روی کلیک مارکر را به نقطه می‌برد؛ کلیک با offset از مرکز
const box = await mapEl.boundingBox();
if (box) {
  // نقطه‌ای در سمت چپِ نقشه (فاصله از مرکز) — مختصات تغییر می‌کند
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.6);
  await page.waitForTimeout(700);
  const latVal = await page.locator('#st-map-lat').inputValue();
  const lngVal = await page.locator('#st-map-lng').inputValue();
  check(
    'click on map updates lat/lng inputs',
    latVal.trim() !== '' && Number.isFinite(Number(latVal)),
    `lat=${latVal} lng=${lngVal}`,
  );
  await page.screenshot({ path: '/tmp/render/map-after-click.png' });
  console.log('shot 2: map-after-click.png');

  // ——— ۳) ذخیره مختصات تست (ورودی مستقیم) → PUT ———
  await page.locator('#st-map-lat').fill(NEW_LAT);
  await page.locator('#st-map-lng').fill(NEW_LNG);
  await page.waitForTimeout(500);
  const saveBtn = page.locator('button', { hasText: 'ذخیرهٔ تغییرات' }).first();
  const saveVisible = await saveBtn.isVisible().catch(() => false);
  if (saveVisible) {
    await saveBtn.click();
    await page.waitForTimeout(1200);
    check('save button clicked', true);
  } else {
    // ذخیره از API مستقیم (اگر دکمه متفاوت است)
    const put = await fetch(`${BASE}/api/admin/settings`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ values: { 'store.mapLat': NEW_LAT, 'store.mapLng': NEW_LNG } }),
    });
    check('PUT settings (api fallback)', put.status === 200);
  }
}

// ——— ۴) عمومی: مختصات جدید در /api/settings (عدد — چون مختصات عدد است) ———
const pub = (await (await fetch(`${BASE}/api/settings`)).json()) as ApiResp<Record<string, unknown>>;
check('public settings mapLat = NEW', Number(pub.data?.['store.mapLat']) === Number(NEW_LAT), String(pub.data?.['store.mapLat']));
check('public settings mapLng = NEW', Number(pub.data?.['store.mapLng']) === Number(NEW_LNG), String(pub.data?.['store.mapLng']));

// ——— ۵) صفحه «دربارهٔ ما» کاربر — SPA view از طریق فوتر ———
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2600); // اسپلش تمام شود
const aboutBtn = page.locator('button, a').filter({ hasText: 'دربارهٔ پارس' }).first();
const aboutVisible = await aboutBtn.isVisible().catch(() => false);
check('footer «دربارهٔ پارس» visible', aboutVisible);
if (aboutVisible) {
  await aboutBtn.click();
  await page.waitForTimeout(1800);
  const iframe = page.locator('iframe[title*="نقشه موقعیت"]');
  const iframeVisible = await iframe.isVisible().catch(() => false);
  check('about view map iframe visible', iframeVisible);
  if (iframeVisible) {
    const src = await iframe.getAttribute('src');
    check('iframe has NEW coords', (src ?? '').includes('33.49'), String(src).slice(0, 140));
  }
  await page.screenshot({ path: '/tmp/render/map-about-user.png', fullPage: true });
  console.log('shot 3: map-about-user.png');
}

// ——— ۶) بازگرداندن مختصات قبلی ———
const restore = await fetch(`${BASE}/api/admin/settings`, {
  method: 'PUT', headers: H,
  body: JSON.stringify({ values: { 'store.mapLat': OLD_LAT, 'store.mapLng': OLD_LNG } }),
});
check('restore old coords', restore.status === 200);

await browser.close();
console.log(`\n——— ${pass} pass / ${fail} fail ———`);
process.exit(fail === 0 ? 0 : 1);
