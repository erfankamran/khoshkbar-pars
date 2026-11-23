/**
 * بررسی بصری فاز آواتار + حذف محصول + ناوبری ادمین (dev یا prod)
 *
 * ۱) ادمین موبایل ۳۹۰×۸۴۴: ورود کد مادر → /admin/products
 *    - دکمه حذف (آیکون سطل) در کارت‌ها دیده می‌شود؟
 *    - چیپ‌های ناوبری sticky: بعد از اسکرول تا انتها همچنان در دید؟
 *    - ترتیب چیپ‌ها: آخرین چیپ «محتوا» و قبل از آن «تنظیمات»؟
 * ۲) ادمین دسکتاپ: جدول محصولات شامل دکمه «حذف»
 * ۳) مشتری موبایل: نمای حساب → آواتار شخصیت مغز نمایش داده می‌شود؟
 *    + نمای پروفایل → شبکه ۸ شخصیت پارس
 * اسکرین‌شات‌ها: /tmp/render/avatar-e2e-*.png
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SHOT = '/tmp/render';

async function main() {
  const browser = await chromium.launch();
  let failures = 0;
  const ok = (label: string, pass: boolean) => {
    console.log(`${pass ? '✅' : '❌'} ${label}`);
    if (!pass) failures++;
  };

  // ——— ۱) ادمین موبایل ———
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const m = await mCtx.newPage();
  await m.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1200);
  await m.fill('#admin-phone', '09121111111');
  await m.getByText('ورود سریع با کد مادر').click();
  await m.waitForURL(`${BASE}/admin`, { timeout: 30000 });
  await m.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(1500);

  const delCount = await m.locator('button[aria-trigger] , form button:has(svg.lucide-trash2), button:has(svg.lucide-trash2)').count();
  ok(`موبایل: دکمه حذف (سطل) در کارت محصولات — ${delCount} عدد`, delCount > 0);

  // چیپ‌ها قبل از اسکرول (nav موبایل = nav.no-scrollbar)
  const mobileNav = m.locator('nav.no-scrollbar[aria-label="ناوبری مدیریت"]');
  const chipsBefore = await mobileNav.locator('a').count();
  ok(`موبایل: چیپ‌های ناوبری رندر شدند — ${chipsBefore} عدد`, chipsBefore === 13);

  // اسکرول تا انتهای صفحه — چیپ‌ها باید همچنان در دید باشند (sticky)
  await m.mouse.wheel(0, 3000);
  await m.waitForTimeout(800);
  const chipsBox = await mobileNav.boundingBox();
  const chipsVisible = !!chipsBox && chipsBox.y >= 0 && chipsBox.y < 100;
  ok(`موبایل: نوار ناوبری پس از اسکرول در بالای صفحه است (y=${Math.round(chipsBox?.y ?? -1)})`, chipsVisible);

  // ترتیب چیپ‌ها
  const chipTexts = await mobileNav.locator('a').allTextContents();
  const last = chipTexts[chipTexts.length - 1]?.trim() ?? '';
  const secondLast = chipTexts[chipTexts.length - 2]?.trim() ?? '';
  ok(`موبایل: ترتیب جدید — یکی‌مانده به آخر «تنظیمات» (${secondLast}) و آخر «محتوا» (${last})`, last.includes('محتوا') && secondLast.includes('تنظیمات'));

  await m.screenshot({ path: `${SHOT}/avatar-e2e-admin-mobile.png` });

  // ——— ۲) ادمین دسکتاپ ———
  const dCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d = await dCtx.newPage();
  await d.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await d.waitForTimeout(1200);
  await d.fill('#admin-phone', '09121111111');
  await d.getByText('ورود سریع با کد مادر').click();
  await d.waitForURL(`${BASE}/admin`, { timeout: 30000 });
  await d.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' });
  await d.waitForTimeout(1500);
  const delCountD = await d.locator('table button:has(svg.lucide-trash2)').count();
  ok(`دسکتاپ: دکمه حذف در جدول محصولات — ${delCountD} عدد`, delCountD > 0);
  await d.screenshot({ path: `${SHOT}/avatar-e2e-admin-desktop.png` });
  await dCtx.close();

  // ——— ۳) مشتری موبایل: حساب + پروفایل ———
  const cCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const c = await cCtx.newPage();
  await c.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await c.waitForTimeout(1200);
  await c.click('[aria-label="حساب"]');
  await c.waitForTimeout(800);
  await c.getByText('ورود | ثبت‌نام').first().click();
  await c.fill('#login-phone', '09121234567');
  await c.getByText('ورود سریع با کد مادر').click();
  await c.waitForTimeout(2500);
  // دیالوگ پیشنهاد Passkey بعد از ورود موفق باز می‌شود — بستن با «بعداً»
  const later = c.getByRole('button', { name: 'بعداً' });
  if (await later.isVisible({ timeout: 5000 }).catch(() => false)) {
    await later.click();
    await c.waitForTimeout(1200);
  }
  await c.click('[aria-label="حساب"]');
  await c.waitForTimeout(1200);
  const avInAccount = await c.locator('img[src^="/avatars/"]').count();
  ok(`مشتری: آواتار شخصیت در کارت حساب — ${avInAccount} تصویر`, avInAccount > 0);
  await c.screenshot({ path: `${SHOT}/avatar-e2e-account.png` });

  // پروفایل — شبکه ۸ شخصیت
  await c.getByText('حساب کاربری من').click();
  await c.waitForTimeout(1500);
  const pickerCount = await c.locator('img[src^="/avatars/"]').count();
  ok(`مشتری: شبکه شخصیت‌های پارس در پروفایل — ${pickerCount} تصویر`, pickerCount >= 9); // کارت هویت + ۸ انتخابگر
  // انتخاب شخصیت دیگر
  await c.locator('button[aria-label="انتخاب شخصیت بادام"]').click();
  await c.waitForTimeout(1800);
  const toastOrSel = await c.locator('button[aria-pressed="true"][aria-label="انتخاب شخصیت بادام"]').count();
  ok('مشتری: انتخاب «بادام» شد (aria-pressed=true)', toastOrSel === 1);
  await c.screenshot({ path: `${SHOT}/avatar-e2e-profile.png` });
  await cCtx.close();

  await mCtx.close();
  await browser.close();

  if (failures > 0) {
    console.log(`\n${failures} بررسی شکست خورد`);
    process.exit(1);
  }
  console.log('\n✅ همه بررسی‌های بصری سبز');
}

main().catch((e) => {
  console.error('E2E FAILED:', e);
  process.exit(1);
});
