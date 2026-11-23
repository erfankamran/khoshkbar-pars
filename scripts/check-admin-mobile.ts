/**
 * تأیید موبایل + دسکتاپ پنل مدیریت روی سرور production
 *
 * - ورود با کد مادر
 * - موبایل ۳۹۰px: کارت محصولات (ویرایش)، دیالوگ ویرایش، کارت سفارش، کاربران، تخفیف
 * - ترتیب ناوبری: داشبورد → سفارش‌ها → محصولات → … → تنظیمات
 * - چیپ فعال در دید + header sticky هنگام اسکرول
 * - دسکتاپ ۱۳۶۶px: جدول‌ها سالم
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch();
  const results: string[] = [];
  const ok = (label: string, pass: boolean, extra = '') => {
    results.push(`${pass ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
    if (!pass) process.exitCode = 1;
  };

  // ---------- موبایل ----------
  const mob = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const p = await mob.newPage();

  // ورود
  await p.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.fill('#admin-phone', '09121111111');
  await p.getByText('ورود سریع با کد مادر').click();
  await p.waitForURL(`${BASE}/admin`, { timeout: 20000 });
  ok('ورود با کد مادر (موبایل)', true);

  // ترتیب ناوبری (صبر تا رندر چیپ‌ها بعد از گیت احراز هویت)
  await p.waitForSelector('header nav a', { timeout: 15000 });
  const chips = await p.locator('header nav a').allTextContents();
  const order = chips.map((c) => c.trim());
  console.log('ترتیب چیپ‌ها:', order.join(' | '));
  ok(
    'ترتیب ناوبری طبق درخواست',
    order[0] === 'داشبورد' &&
      order[1] === 'سفارش‌ها' &&
      order[2] === 'محصولات' &&
      order[3] === 'دسته‌بندی‌ها' &&
      order[4] === 'کدهای تخفیف' &&
      order[5] === 'کاربران' &&
      order[6] === 'نظرات' &&
      order[7] === 'استوری‌ها' &&
      order[8] === 'بنرها' &&
      order[9] === 'اعلان‌ها' &&
      order[10] === 'فید و سئو' &&
      order[11] === 'تنظیمات'
  );

  // چیپ فعال در دید (بخش تنظیمات = آخرین چیپ سمت چپ)
  await p.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  await p.waitForSelector('header nav a', { timeout: 15000 });
  await p.waitForTimeout(1200);
  const nav = await p.locator('header nav').boundingBox();
  const activeChip = await p.locator('header nav a[aria-current="page"]').boundingBox();
  const inView = !!nav && !!activeChip && activeChip.x >= nav.x - 2 && activeChip.x + activeChip.width <= nav.x + nav.width + 2;
  ok('چیپ فعال (تنظیمات) در دید نوار ناوبری', inView, `chip.x=${activeChip?.x?.toFixed(0)} nav=[${nav?.x?.toFixed(0)}..${(nav!.x + nav!.width).toFixed(0)}]`);
  await p.screenshot({ path: '/tmp/render/after-settings-chip.png' });

  // sticky header هنگام اسکرول
  await p.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' });
  await p.waitForSelector('header nav a', { timeout: 15000 });
  await p.waitForTimeout(1200);
  await p.mouse.wheel(0, 700);
  await p.waitForTimeout(700);
  const headerY = (await p.locator('header').boundingBox())?.y ?? -1;
  ok('header sticky هنگام اسکرول', headerY === 0, `y=${headerY}`);

  // کارت محصولات — بدون سرریز افقی + ویرایش با کلیک روی کارت
  await p.mouse.wheel(0, -2000);
  await p.waitForTimeout(700);
  const doc = await p.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  ok('محصولات موبایل — بدون سرریز افقی', doc.scrollW <= doc.clientW + 2, `scrollW=${doc.scrollW}`);
  const cardCount = await p.locator('[aria-label^="ویرایش"]').count();
  ok('کارت محصولات رندر شد', cardCount > 0, `${cardCount} کارت`);
  await p.screenshot({ path: '/tmp/render/after-products-cards.png' });

  // باز شدن دیالوگ ویرایش با کلیک روی کارت اول
  await p.locator('[aria-label^="ویرایش"]').first().click();
  await p.waitForTimeout(900);
  const dialogTitle = await p.locator('[role=dialog] h2, [role=dialog] [data-slot=dialog-title], [role=dialog] .font-semibold').first().textContent().catch(() => null);
  const titleText = dialogTitle ?? (await p.locator('[role=dialog]').first().textContent().catch(() => ''));
  ok('دیالوگ ویرایش با کلیک کارت باز شد', /ویرایش/.test(titleText ?? ''), `«${(titleText ?? '').slice(0, 40)}»`);
  await p.screenshot({ path: '/tmp/render/after-edit-dialog.png' });

  // ویرایش واقعی: تغییر موجودی اولین واریانت و ذخیره
  const stockInput = p.locator('[role=dialog] input[type=number]').nth(2); // وزن، قیمت، موجودی
  await stockInput.fill('44');
  await p.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await p.waitForTimeout(1500);
  ok('ذخیره ویرایش محصول در موبایل', (await p.locator('[role=dialog]').count()) === 0, 'دیالوگ بسته شد');
  await p.screenshot({ path: '/tmp/render/after-edit-saved.png' });

  // سفارش‌ها موبایل
  await p.goto(`${BASE}/admin/orders`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const orderCards = await p.locator('[aria-label^="مشاهده جزئیات سفارش"]').count();
  const d2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('کارت سفارش‌ها موبایل', orderCards > 0, `${orderCards} کارت، سرریز=${d2}px`);
  await p.screenshot({ path: '/tmp/render/after-orders-cards.png' });

  // کاربران موبایل
  await p.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const uOverflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('کاربران موبایل بدون سرریز', uOverflow <= 2, `سرریز=${uOverflow}px`);

  // تخفیف‌ها موبایل
  await p.goto(`${BASE}/admin/discounts`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const dOverflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('تخفیف‌ها موبایل بدون سرریز', dOverflow <= 2, `سرریز=${dOverflow}px`);
  await p.screenshot({ path: '/tmp/render/after-discounts-cards.png' });

  await mob.close();

  // ---------- دسکتاپ ----------
  const desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const dp = await desk.newPage();
  await dp.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await dp.waitForTimeout(1200);
  await dp.fill('#admin-phone', '09121111111');
  await dp.getByText('ورود سریع با کد مادر').click();
  await dp.waitForURL(`${BASE}/admin`, { timeout: 20000 });

  // جدول محصولات دسکتاپ سالم
  await dp.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' });
  await dp.waitForTimeout(1200);
  const tableVisible = await dp.locator('table').isVisible();
  const cardsHidden = (await dp.locator('[aria-label^="ویرایش"][role="button"]').count()) === 0;
  ok('دسکتاپ: جدول محصولات سالم', tableVisible, `cardsHidden=${cardsHidden}`);

  // sidebar ترتیب
  const sideItems = (await dp.locator('aside nav a').allTextContents()).map((s) => s.trim());
  ok('دسکتاپ: ترتیب sidebar', sideItems[1] === 'سفارش‌ها' && sideItems[2] === 'محصولات', sideItems.slice(0, 4).join(' | '));
  await dp.screenshot({ path: '/tmp/render/after-desktop.png' });

  // ذخیره نشست — سفارش دسکتاپ جزئیات
  await dp.goto(`${BASE}/admin/orders`, { waitUntil: 'networkidle' });
  await dp.waitForTimeout(1200);
  ok('دسکتاپ: جدول سفارش‌ها', await dp.locator('table').isVisible());

  await desk.close();
  await browser.close();

  console.log('\n■ نتیجه:');
  for (const r of results) console.log('  ' + r);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
