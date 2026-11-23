/**
 * بازبینی بصری فاز ۳ — محتوای مستقل فروشگاه
 *
 *  ۱) پنل: ورود مدیر → /admin/content — چهار تب رندر شده باشد
 *  ۲) پنل: ایجاد پرسش متداول از UI واقعی → در لیست دیده شود → حذف
 *  ۳) فروشگاه: فوتر در انتهای صفحه اصلی (برند + تماس + لینک‌ها) رندر شده باشد
 *  ۴) فروشگاه: نمای «پرسش‌های متداول» از فوتر باز شود + Accordion کار کند
 *  ۵) فروشگاه: نمای «دربارهٔ پارس» — معرفی برند + شماره تماس
 *
 * اجرا: bun scripts/check-phase3-visual.ts [baseUrl]
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

async function main() {
  console.log(`— بازبینی بصری فاز ۳ روی ${BASE} —\n`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // ——— ۱) پنل — صفحه محتوا ———
  console.log('۱) پنل مدیریت — صفحه محتوا:');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.fill('#admin-phone', '09121111111');
  await page.getByRole('button', { name: /ورود سریع با کد مادر/ }).click();
  await page.waitForURL('**/admin', { timeout: 30_000 });
  check('ورود مدیر از UI (کد مادر)', true);

  await page.goto(`${BASE}/admin/content`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const adminText = await page.textContent('body');
  check('عنوان «محتوای فروشگاه»', adminText?.includes('محتوای فروشگاه') ?? false);
  check('تب پرسش‌های متداول', adminText?.includes('پرسش‌های متداول') ?? false);
  check('تب شماره‌های تماس', adminText?.includes('شماره‌های تماس') ?? false);
  check('تب نمادهای اعتماد', adminText?.includes('نمادهای اعتماد') ?? false);
  check('تب لینک‌های فوتر', adminText?.includes('لینک‌های فوتر') ?? false);
  check('چیپ «محتوا» در ناوبری', adminText?.includes('محتوا') ?? false);
  // دادهٔ seed در تب FAQ
  check('دادهٔ seed در تب FAQ', adminText?.includes('هزینه و زمان ارسال') ?? false);

  // ——— ۲) ایجاد پرسش از UI واقعی ———
  console.log('۲) ایجاد پرسش از UI:');
  await page.getByRole('button', { name: /پرسش جدید/ }).click();
  await page.waitForTimeout(600);
  await page.fill('#ff-q', 'پرسش آزمون بصری — بازگشت کالا دارید؟');
  await page.fill('#ff-a', 'بله، تا ۷ روز پس از تحویل امکان بازگشت وجود دارد. این پرسش آزمون است و حذف می‌شود.');
  await page.getByRole('button', { name: /^ایجاد$/ }).click();
  await page.waitForTimeout(1800);
  const afterCreate = await page.textContent('body');
  check('پرسش ساخته‌شده در لیست', afterCreate?.includes('بازگشت کالا دارید') ?? false);

  // حذف رکورد آزمون — دکمهٔ حذف داخل کارتِ همان پرسش (sortOrder=0 → اول لیست)
  const testCard = page.locator('div.rounded-3xl', { hasText: 'بازگشت کالا دارید' }).first();
  if ((await testCard.count()) > 0) {
    await testCard.getByRole('button', { name: 'حذف', exact: true }).click();
    await page.waitForTimeout(700);
    const confirmBtn = page.getByRole('button', { name: 'حذف کن', exact: true });
    check('دیالوگ تأیید حذف باز شد', (await confirmBtn.count()) === 1);
    await confirmBtn.click();
    await page.waitForTimeout(1500);
    const afterDelete = await page.textContent('body');
    check('پرسش آزمون حذف شد', !(afterDelete?.includes('بازگشت کالا دارید') ?? false));
  } else {
    check('کارت پرسش آزمون برای حذف موجود', false);
  }

  // ——— ۳) فوتر صفحه اصلی ———
  console.log('۳) فوتر فروشگاه:');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2500);
  const footer = page.locator('footer[aria-label="فوتر فروشگاه"]');
  const footerCount = await footer.count();
  check('فوتر در صفحه اصلی رندر شده', footerCount === 1, `got ${footerCount}`);
  if (footerCount === 1) {
    await footer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    const footerText = await footer.textContent();
    check('معرفی برند در فوتر', (footerText ?? '').includes('از مزرعه تا سفره'));
    check('شمارهٔ تماس در فوتر', (footerText ?? '').includes('پشتیبانی') && (footerText ?? '').includes('021'));
    check('لینک دسترسی سریع در فوتر', (footerText ?? '').includes('دربارهٔ پارس'));
    check('دکمهٔ پرسش‌های متداول در فوتر', (footerText ?? '').includes('پرسش‌های متداول'));
    check('خط کپی‌رایت', (footerText ?? '').includes('همهٔ حقوق محفوظ است'));
  }

  // ——— ۴) نمای پرسش‌های متداول ———
  console.log('۴) نمای پرسش‌های متداول:');
  await page.locator('footer button', { hasText: 'پرسش‌های متداول' }).first().click();
  await page.waitForTimeout(1800);
  const faqText = await page.textContent('body');
  check('نمای FAQ باز شد', faqText?.includes('پرسش‌های متداول') ?? false);
  check('دادهٔ seed در نمای FAQ', faqText?.includes('هزینه و زمان ارسال چقدر است') ?? false);
  // Accordion: باز کردن اولین پرسش
  const accordionTrigger = page.locator('button', { hasText: 'هزینه و زمان ارسال' }).first();
  if ((await accordionTrigger.count()) > 0) {
    await accordionTrigger.click();
    await page.waitForTimeout(900);
    const opened = await page.textContent('body');
    check('Accordion باز شد و پاسخ دیده می‌شود', opened?.includes('پست پیشتاز') ?? false);
  } else {
    check('پرسش اول برای Accordion موجود', false);
  }

  // ——— ۵) نمای دربارهٔ پارس ———
  console.log('۵) نمای دربارهٔ پارس:');
  // پشتهٔ ناوبری SPA از sessionStorage بازیابی می‌شود — پاک می‌کنیم تا صفحه اصلی بیاید
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2000);
  const footer2 = page.locator('footer[aria-label="فوتر فروشگاه"]');
  await footer2.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.locator('footer button', { hasText: 'دربارهٔ پارس' }).first().click();
  await page.waitForTimeout(1800);
  const aboutText = await page.textContent('body');
  check('نمای دربارهٔ ما باز شد', aboutText?.includes('دربارهٔ ما') ?? false);
  check('معرفی برند', aboutText?.includes('فروشگاه پارس') ?? false);
  check('بخش تماس با ما', aboutText?.includes('تماس با ما') ?? false);
  check('بخش پرسش‌های متداول در about', aboutText?.includes('پرسش‌های متداول') ?? false);

  // اسکرین‌شات‌ها برای گزارش
  await page.screenshot({ path: '/tmp/render/phase3-about.png', fullPage: true });
  await page.goto(`${BASE}/admin/content`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/render/phase3-admin-content.png', fullPage: true });

  await browser.close();

  console.log('');
  if (fail === 0) {
    console.log(`ALL GREEN — ${pass}/${pass + fail} بررسی بصری فاز ۳ سبز ✅`);
    process.exit(0);
  }
  console.log(`قرمز: ${fail}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
