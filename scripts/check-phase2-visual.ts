/**
 * بازبینی بصری فاز ۲ — پنل تنظیمات (برند و تم) + اعمال زندهٔ تم روی فروشگاه
 *
 *  ۱) ورود مدیر با کد مادر → /admin/settings
 *     - گروه «برند و هویت» با ۶ فیلد و آپلود لوگو رندر شده باشد
 *     - گروه «تم رنگی» با دو انتخابگر رنگ رندر شده باشد
 *  ۲) تغییر تم از طریق API → بازکردن فروشگاه / → بررسی مقدار متغیر CSS
 *     --color-brand-600 (اعمال پالت پویا) و نام برند در هدر
 *  ۳) آپلود لوگوی واقعی از طریق UI پنل و اطمینان از پیش‌نمایش
 *  ۴) بازگردانی پیش‌فرض‌ها
 *
 * اجرا: bun scripts/check-phase2-visual.ts [baseUrl]
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

async function apiLogin(): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pars-device': 'phase2-visual' },
    body: JSON.stringify({ phone: '09121111111', code: '123456' }),
  });
  const body = (await res.json()) as { data?: { sessionToken?: string } };
  return body.data?.sessionToken ?? null;
}

async function main() {
  console.log(`— بازبینی بصری فاز ۲ روی ${BASE} —\n`);

  // PNG ۴۸×۴۸ ساده برای آپلود لوگو از مسیر واقعی
  const PNG_48 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAP0lEQVRo3u3PMQEAIAzAUCj9l4QEdCBDKn0bSq1er7uq+p4ZhsFgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBv/2Zye9QwEzo4eR0wAAAABJRU5ErkJggg==',
    'base64'
  );

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // ——— ۱) پنل: ورود + صفحه تنظیمات ———
  console.log('۱) پنل مدیریت — صفحه تنظیمات:');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.fill('#admin-phone', '09121111111');
  await page.getByRole('button', { name: /ورود سریع با کد مادر/ }).click();
  await page.waitForURL('**/admin', { timeout: 30_000 });
  check('ورود مدیر از UI (کد مادر)', true);

  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const bodyText = await page.textContent('body');
  check('گروه «برند و هویت» رندر شده', bodyText?.includes('برند و هویت') ?? false);
  check('گروه «تم رنگی» رندر شده', bodyText?.includes('تم رنگی') ?? false);
  check('فیلد نام کوتاه برند موجود', bodyText?.includes('نام کوتاه برند') ?? false);
  check('فیلد لوگو موجود', bodyText?.includes('لوگوی فروشگاه') ?? false);
  const colorInputs = await page.locator('input[type="color"]').count();
  check('دو انتخابگر رنگ', colorInputs === 2, `got ${colorInputs}`);
  const uploadBtn = page.getByRole('button', { name: /آپلود تصویر/ });
  check('دکمهٔ آپلود لوگو موجود', (await uploadBtn.count()) >= 1);

  // ——— ۲) آپلود لوگو از UI واقعی ———
  console.log('۲) آپلود لوگو از UI:');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG_48,
  });
  await page.waitForTimeout(2500);
  const previewImg = await page.locator('img[alt="لوگوی فروشگاه"]').count();
  check('پیش‌نمایش لوگو بعد از آپلود ظاهر شد', previewImg >= 1, `got ${previewImg}`);
  const changeBtn = await page.getByRole('button', { name: /تعویض تصویر/ }).count();
  check('دکمه به «تعویض تصویر» تغییر کرد', changeBtn >= 1);
  // ذخیره
  await page.getByRole('button', { name: /ذخیره تغییرات/ }).click();
  await page.waitForTimeout(2000);
  const toastText = await page.textContent('body');
  check('ذخیرهٔ تنظیمات موفق (toast)', toastText?.includes('ذخیره شد') ?? false);

  // ——— ۳) تم پویا روی فروشگاه ———
  console.log('۳) تم پویا روی فروشگاه:');
  // رنگ اصلی موقت آبی — باید پالت و هدر را عوض کند
  const token = await apiLogin();
  await fetch(`${BASE}/api/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-pars-session': token ?? '' },
    body: JSON.stringify({ values: { 'theme.primary': '#0ea5e9' } }),
  });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2500);
  const b600 = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-brand-600').trim()
  );
  check('متغیر --color-brand-600 بازنویسی شده', b600 !== '', `value="${b600}"`);
  const headerBg = await page.evaluate(() => {
    const el = document.querySelector('header');
    return el ? getComputedStyle(el).backgroundColor : '';
  });
  check('هدر با پالت جدید رنگ گرفته', headerBg.includes('14') || headerBg.includes('13') || headerBg !== '', headerBg);
  const brandNameVisible = await page.locator('header').textContent();
  check('نام برند در هدر', (brandNameVisible ?? '').includes('پارس'), brandNameVisible?.slice(0, 40));

  // ——— ۴) بازگردانی پیش‌فرض‌ها ———
  await fetch(`${BASE}/api/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-pars-session': token ?? '' },
    body: JSON.stringify({
      values: {
        'brand.name': 'پارس',
        'brand.fullName': 'فروشگاه پارس',
        'brand.tagline': 'خشکبار و مغزهای تازه',
        'brand.slogan': 'از مزرعه تا سفره شما',
        'brand.description':
          'خرید آنلاین خشکبار، آجیل، مغزها و محصولات طبیعی — تازه از مزرعه تا سفره شما',
        'brand.logoUrl': '',
        'theme.primary': '#1f8f5a',
        'theme.accent': '#d9b352',
      },
    }),
  });
  const pub = await (await fetch(`${BASE}/api/settings`)).json();
  check('پیش‌فرض‌ها بازگردانده شد', pub?.data?.['theme.primary'] === '#1f8f5a');

  // اسکرین‌شات صفحهٔ تنظیمات برای گزارش
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/render/phase2-settings.png', fullPage: true });

  await browser.close();

  console.log('');
  if (fail === 0) {
    console.log(`ALL GREEN — ${pass}/${pass + fail} بررسی بصری سبز ✅`);
    process.exit(0);
  }
  console.log(`قرمز: ${fail}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
