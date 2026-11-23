/**
 * E2E بخش آدرس‌ها — دفترچه آدرس + یکپارچگی با تسویه حساب
 * اجرا: Xvfb :99 بگیر، بعد DISPLAY=:99 bun scripts/e2e-addresses.ts
 *
 * پوشش:
 * ۱) ورود OTP از UI
 * ۲) افزودن آدرس با ارقام فارسی (شماره + کد پستی) → ذخیره و نرمال‌سازی
 * ۳) قواعد پیش‌فرض: اولین آدرس پیش‌فرض؛ تعویض پیش‌فرض؛ ویرایش؛ حذف دومرحله‌ای
 * ۴) پایداری نشست پس از reload (کوکی SameSite=None) — آدرس‌ها سر جایشان
 * ۵) تسویه: پیش‌پرکردن فرم از آدرس پیش‌فرض + چیپ‌های انتخاب سریع
 * ۶) از تسویه → مدیریت آدرس‌ها → بازگشت → پیش‌پرکردن دوباره
 * ۷) اعتبارسنجی کد پستی ناقص (۹ رقم → خطا، نه ذخیره بی‌صدا)
 * ۸) کیفیت: بدون pageerror و بدون اریز افقی (۳۹۰px)
 */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { rmSync } from 'node:fs';

const BASE = 'http://localhost:3000';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

async function login(page: Page, phone: string): Promise<void> {
  await page.goto(`${BASE}/`);
  await page.evaluate(() => (document.querySelector('nextjs-portal') as HTMLElement | null)?.remove());
  await page.getByRole('navigation').getByRole('button', { name: 'حساب' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /ورود/ }).first().click();
  await page.waitForTimeout(600);
  const phoneInput = page.locator('input[type="tel"]').first();
  await phoneInput.fill(phone);
  await page.getByRole('button', { name: /دریافت کد|ادامه/ }).first().click();
  await page.waitForTimeout(900);
  await page.getByText(/کد پیامک‌شده/).waitFor({ timeout: 8000 });
  const codeText = await page.getByText(/کد پیامک‌شده/).innerText();
  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const code = codeText.replace(/[۰-۹]/g, (d) => String(faDigits.indexOf(d))).replace(/\D/g, '').slice(-6);
  const otpInputs = page.locator('input[inputmode="numeric"]');
  const count = await otpInputs.count();
  if (count >= 6) {
    for (let i = 0; i < 6; i++) await otpInputs.nth(i).fill(code[i]!);
  } else {
    await otpInputs.first().fill(code);
  }
  await page.getByRole('button', { name: /تأیید/ }).last().click();
  await page.waitForTimeout(1400);
}

async function fillAddressForm(
  page: Page,
  data: { title: string; name: string; phone: string; province: string; city: string; postal?: string; full: string }
) {
  await page.locator('#ad-title').fill(data.title);
  await page.locator('#ad-name').fill(data.name);
  await page.locator('#ad-phone').fill(data.phone);
  await page.locator('#ad-province').fill(data.province);
  await page.locator('#ad-city').fill(data.city);
  if (data.postal !== undefined) await page.locator('#ad-postal').fill(data.postal);
  await page.locator('#ad-full').fill(data.full);
}

/** حذف پورتال dev نیوکست — نشان dev در گوشه پایین-چپ کلیک روی تب «حساب» را می‌بلعد */
async function removeDevPortal(page: Page) {
  await page.evaluate(() => (document.querySelector('nextjs-portal') as HTMLElement | null)?.remove()).catch(() => {});
}

async function openAddresses(page: Page) {
  await removeDevPortal(page);
  await page.getByRole('navigation').getByRole('button', { name: 'حساب' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'آدرس‌های من' }).click();
  await page.waitForTimeout(700);
}

async function main() {
  // پروفایل تمیز در هر اجرا — نشست قبلی نباید ورود را skip کند
  rmSync('/tmp/pars-addr-profile', { recursive: true, force: true });
  const ctx: BrowserContext = await chromium.launchPersistentContext('/tmp/pars-addr-profile', {
    headless: false,
    viewport: { width: 390, height: 844 },
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
    ],
  });
  const page: Page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const phone = `0935${Math.floor(1000000 + Math.random() * 8999999)}`;

  console.log('—— ۱) ورود OTP ——');
  await login(page, phone);
  const me = await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()) as { ok: boolean; data: { user: unknown } });
  check('ورود موفق', me.ok === true && !!me.data.user);

  console.log('—— ۲) افزودن آدرس با ارقام فارسی ——');
  await openAddresses(page);
  await page.getByRole('button', { name: /افزودن اولین آدرس|افزودن آدرس جدید/ }).first().click();
  await page.waitForTimeout(600);
  await fillAddressForm(page, {
    title: 'خانه',
    name: 'سارا محمدی',
    phone: '۰۹۱۲۳۴۵۶۷۸۹', // ارقام فارسی — باید نرمال شود
    province: 'تهران',
    city: 'تهران',
    postal: '۱۲۳۴۵۶۷۸۹۰', // ارقام فارسی
    full: 'خیابان آزادی، کوچه بهار، پلاک ۱۲، واحد ۳',
  });
  await page.getByRole('button', { name: 'ذخیره آدرس' }).click();
  await page.waitForTimeout(900);
  let body = await page.evaluate(() => document.body.innerText);
  check('آدرس «خانه» در فهرست ظاهر شد', body.includes('خانه'));
  check('نشان «پیش‌فرض» روی اولین آدرس', body.includes('پیش‌فرض'));
  check('شماره با قالب ۴-۳-۴ نمایش داده شد', body.includes('۰۹۱۲ ۳۴۵ ۶۷۸۹'), 'بدون گروه‌بندی');
  // کد پستی نرمال‌شده در دیتابیس (ارقام لاتین ذخیره شده)
  const savedPostal = await page.evaluate(async () => {
    const r = await fetch('/api/addresses');
    const b = (await r.json()) as { data: { postalCode: string | null }[] };
    return b.data[0]?.postalCode ?? null;
  });
  check('کد پستی فارسی → لاتین نرمال و ذخیره شد', savedPostal === '1234567890', String(savedPostal));

  console.log('—— ۳) آدرس دوم + تعویض پیش‌فرض ——');
  await page.getByRole('button', { name: 'افزودن آدرس جدید' }).click();
  await page.waitForTimeout(600);
  await fillAddressForm(page, {
    title: 'محل کار',
    name: 'سارا محمدی',
    phone: '09129876543',
    province: 'اصفهان',
    city: 'اصفهان',
    full: 'خیابان چهارباغ بالا، ساختمان نگین، طبقه ۵',
  });
  await page.getByRole('button', { name: 'ذخیره آدرس' }).click();
  await page.waitForTimeout(900);
  // بج «پیش‌فرض» span است؛ دکمه «پیش‌فرض» روی کارت غیرپیش‌فرض button —
  // پس فقط بج‌ها را می‌شماریم (دکمه متن یکسان دارد)
  const badgeCount = await page.locator('li span', { hasText: /^پیش‌فرض$/ }).count();
  check('دقیقاً یک بج «پیش‌فرض» در فهرست', badgeCount === 1, `badges=${badgeCount}`);

  await page.getByRole('button', { name: /^پیش‌فرض$/ }).first().click();
  await page.waitForTimeout(900);
  const defaults = await page.evaluate(async () => {
    const r = await fetch('/api/addresses');
    const b = (await r.json()) as { data: { title: string; isDefault: boolean }[] };
    return b.data;
  });
  check('تعویض پیش‌فرض سمت سرور انجام شد', defaults.filter((a) => a.isDefault).length === 1 && defaults.find((a) => a.isDefault)?.title === 'محل کار');

  console.log('—— ۴) ویرایش + حذف دومرحله‌ای ——');
  // ویرایش «محل کار» → تغییر برچسب (چک روی متن کارت، نه کل body — toast قدیمی هنوز ممکن است روی صفحه باشد)
  const workCard = page.locator('li', { hasText: 'محل کار' });
  await workCard.getByRole('button', { name: 'ویرایش' }).click();
  await page.waitForTimeout(500);
  await page.locator('#ad-title').fill('دفتر کار');
  await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await page.waitForTimeout(1200);
  const workAfter = page.locator('li', { hasText: 'دفتر کار' });
  check('ویرایش برچسب اعمال شد', (await workAfter.count()) === 1);

  // حذف: دو ضربه (تأیید دومرحله‌ای)
  const homeCard = page.locator('li', { hasText: /^خانه/ }).first();
  await homeCard.getByRole('button', { name: 'حذف' }).click();
  await page.waitForTimeout(300);
  const confirmBtn = homeCard.getByRole('button', { name: /تأیید حذف/ });
  check('دکمه تأیید دومرحله‌ای ظاهر شد', await confirmBtn.isVisible());
  await confirmBtn.click();
  await page.waitForTimeout(900);
  body = await page.evaluate(() => document.body.innerText);
  check('آدرس «خانه» حذف شد', !body.includes('خیابان آزادی'));

  console.log('—— ۵) پایداری نشست پس از reload ——');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  await openAddresses(page);
  body = await page.evaluate(() => document.body.innerText);
  check('پس از reload هنوز لاگین است (لیست آدرس‌ها می‌آید)', body.includes('دفتر کار'), body.slice(0, 150));
  check('فلش «وارد شوید» برای کاربر لاگین دیده نمی‌شود', !body.includes('برای مدیریت آدرس‌ها وارد شوید'));

  console.log('—— ۶) یکپارچگی با تسویه ——');
  await removeDevPortal(page);
  // افزودن کالا به سبد از طریق API همان صفحه (کوکی هویت دستگاه خودکار ست می‌شود)
  const added = await page.evaluate(async () => {
    const p = await (await fetch('/api/products?page=1&pageSize=1')).json();
    const { productId, variantId } = {
      productId: p.data.items[0].id,
      variantId: p.data.items[0].variants[0].id,
    };
    const r = await fetch('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, variantId, quantity: 1 }),
    });
    return (await r.json()) as { ok: boolean };
  });
  check('کالا به سبد اضافه شد', added.ok === true);

  await page.getByRole('navigation').getByRole('button', { name: 'سبد خرید' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /ادامه فرایند خرید/ }).click();
  await page.waitForTimeout(900);
  const coName = await page.locator('#co-name').inputValue();
  const coPhone = await page.locator('#co-phone').inputValue();
  const coFull = await page.locator('#co-address').inputValue();
  check('پیش‌پرکردن فرم از آدرس پیش‌فرض (نام)', coName === 'سارا محمدی', coName);
  check('پیش‌پرکردن شماره نرمال‌شده', coPhone === '09129876543', coPhone);
  check('پیش‌پرکردن نشانی', coFull.includes('چهارباغ'), coFull);
  body = await page.evaluate(() => document.body.innerText);
  check('چیپ آدرس ذخیره‌شده در تسویه هست', body.includes('دفتر کار'));

  console.log('—— ۷) از تسویه → مدیریت آدرس‌ها → بازگشت ——');
  await removeDevPortal(page);
  await page.getByRole('button', { name: /مدیریت آدرس‌ها/ }).click();
  await page.waitForTimeout(700);
  body = await page.evaluate(() => document.body.innerText);
  check('دفترچه آدرس باز شد', body.includes('آدرس‌های من') && body.includes('دفتر کار'));
  await removeDevPortal(page);
  const backBtn = page.getByRole('button', { name: 'بازگشت' });
  if (await backBtn.count() > 0) {
    await backBtn.first().click();
  } else {
    // دکمه Back در نوار بالا — اولین دکمه بعد از عنوان
    await page.getByRole('button').first().click();
  }
  await page.waitForTimeout(900);
  body = await page.evaluate(() => document.body.innerText);
  check('بازگشت به تسویه انجام شد', body.includes('تسویه حساب') && body.includes('آدرس تحویل سفارش'));

  console.log('—— ۸) اعتبارسنجی کد پستی ناقص ——');
  await removeDevPortal(page);
  await page.getByRole('navigation').getByRole('button', { name: 'حساب' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'آدرس‌های من' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'افزودن آدرس جدید' }).click();
  await page.waitForTimeout(500);
  await fillAddressForm(page, {
    title: 'ویلا',
    name: 'علی رضایی',
    phone: '09351112233',
    province: 'مازندران',
    city: 'نور',
    postal: '123456789', // ۹ رقم — باید خطا بدهد نه ذخیره بی‌صدا
    full: 'بلوار دریا، ویلا شماره ۸، کد ۲',
  });
  await page.getByRole('button', { name: 'ذخیره آدرس' }).click();
  await page.waitForTimeout(600);
  body = await page.evaluate(() => document.body.innerText);
  check('کد پستی ۹ رقمی → خطای قابل مشاهده', body.includes('کد پستی باید ۱۰ رقم باشد'));

  console.log('—— ۹) کیفیت: خطا و اریز ——');
  check('بدون pageerror', errors.length === 0, errors.join(' | ').slice(0, 200));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('بدون اریز افقی (۳۹۰px)', !overflow);

  await ctx.close();
  console.log(`\nنتیجه E2E آدرس‌ها: ${pass} موفق | ${fail} ناموفق`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('خطای اجرای تست:', e);
  process.exit(1);
});
