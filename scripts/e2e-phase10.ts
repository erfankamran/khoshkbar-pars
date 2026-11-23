/**
 * E2E فاز ۱۰ — Push واقعی + آفلاین + لینک عمیق اعلان
 * اجرا: bun scripts/e2e-phase10.ts
 *
 * پوشش:
 * ۱) ورود OTP با مجوز اعلان granting شده (Playwright grantPermissions)
 * ۲) فعال‌سازی Push از UI تنظیمات اعلان‌ها → اشتراک واقعی در دیتابیس
 * ۳) ارسال Push واقعی از سرور (web-push + VAPID) → نمایش اعلان در SW
 * ۴) آفلاین: قطع شبکه → ناوبری → صفحه آفلاین
 * ۵) لینک عمیق ?o= → نمای جزئیات سفارش
 */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { sendNotification as webPushSend, setVapidDetails as webPushSetVapid } from 'web-push';
import { rmSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:3000';
const db = new PrismaClient();

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

async function login(page: Page, phone: string): Promise<string> {
  await page.goto(`${BASE}/`);
  await page.evaluate(() => (document.querySelector('nextjs-portal') as HTMLElement | null)?.remove());
  // ورود از طریق نمای حساب → login
  await page.getByRole('navigation').getByRole('button', { name: 'حساب' }).click();
  await page.getByRole('button', { name: /ورود/ }).first().click();
  await page.waitForTimeout(600);
  // شماره موبایل
  const phoneInput = page.locator('input[type="tel"]').first();
  await phoneInput.fill(phone);
  await page.getByRole('button', { name: /دریافت کد|ادامه/ }).first().click();
  // devCode فقط از UI خوانده می‌شود (درخواست دوم محدودیت نرخ ۶۰ ثانیه می‌خورد)
  await page.waitForTimeout(900);
  await page.getByText(/کد پیامک‌شده/).waitFor({ timeout: 8000 });
  const codeText = await page.getByText(/کد پیامک‌شده/).innerText();
  // ارقام فارسی → لاتین
  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const code = codeText.replace(/[۰-۹]/g, (d) => String(faDigits.indexOf(d))).replace(/\D/g, '').slice(-6);
  // ورود کد — ۶ فیلد تک‌رقمی یا یک فیلد
  const otpInputs = page.locator('input[inputmode="numeric"]');
  const count = await otpInputs.count();
  if (count >= 6) {
    for (let i = 0; i < 6; i++) await otpInputs.nth(i).fill(code[i]!);
  } else {
    await otpInputs.first().fill(code);
  }
  await page.getByRole('button', { name: /تأیید|ورود/ }).last().click();
  await page.waitForTimeout(1400);
  return code;
}

async function main() {
  // پروفایل پایدار — Push API در پروفایل موقت/incognito عمداً غیرفعال است (crbug ۴۰۱۴۳۹)
  rmSync('/tmp/pars-chrome-profile', { recursive: true, force: true });
  const ctx: BrowserContext = await chromium.launchPersistentContext('/tmp/pars-chrome-profile', {
    // headed زیر Xvfb — headless سرویس Push را غیرفعال می‌کند (AbortError)
    headless: false,
    viewport: { width: 390, height: 844 },
    permissions: ['notifications'],
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

  const phone = `0936${Math.floor(1000000 + Math.random() * 8999999)}`;
  console.log('—— ۱) ورود OTP ——');
  await login(page, phone);
  const loggedIn = await page.evaluate(async () => {
    const r = await fetch('/api/auth/me');
    return (await r.json()) as { ok: boolean };
  });
  check('ورود OTP موفق', loggedIn.ok === true);

  console.log('—— ۲) فعال‌سازی Push از UI ——');
  await page.getByRole('button', { name: 'حساب', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'تنظیمات اعلان‌ها' }).click();
  await page.waitForTimeout(1200);
  const bodyText = await page.evaluate(() => document.body.innerText);
  check('کارت Push حالت فعال‌سازی دارد', bodyText.includes('از وضعیت سفارش باخبر شوید'), bodyText.slice(0, 200));
  await page.getByRole('button', { name: 'فعال‌سازی اعلان‌ها' }).click();
  // مذاکره با سرویس Push (FCM) ممکن است چند ثانیه طول بکشد
  await page.getByText('اعلان‌ها روی این دستگاه فعال است').waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const bodyAfter = await page.evaluate(() => document.body.innerText);
  check('اشتراک فعال شد (کارت سبز)', bodyAfter.includes('اعلان‌ها روی این دستگاه فعال است'), bodyAfter.slice(0, 300));

  const sub = await db.pushSubscription.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  check('اشتراک واقعی در دیتابیس ذخیره شد', !!sub, sub ? '' : 'هیچ اشتراکی');
  check('اشتراک به کاربر لاگین‌شده متصل است', !!sub?.userId);

  // رضایت کلی هم باید خودکار روشن شده باشد (رفتار سمت کلاینت)
  const prefsRes = await fetch(`${BASE}/api/notifications/preferences`, {
    headers: { Cookie: (await ctx.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join('; ') },
  });
  const prefsData = (await prefsRes.json()) as { data: { pushEnabled: boolean } };
  check('رضایت کلی pushEnabled خودکار روشن شد', prefsData.data.pushEnabled === true);

  console.log('—— ۳) Push واقعی از سرور ——');
  // یک اعلان تستی مستقیماً با web-push به اشتراک واقعی — همان مسیر سرویس
  const payload = {
    title: 'سفارش شما ارسال شد',
    body: 'سفارش تستی PARS از پارس تحویل پست شد — کد رهگیری ۱۲۳۴۵',
    url: '/',
    tag: 'order-test',
  };
  webPushSetVapid(
    process.env.VAPID_SUBJECT ?? 'mailto:support@pars-shop.ir',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  await webPushSend(
    {
      endpoint: sub!.endpoint,
      keys: { p256dh: sub!.p256dh, auth: sub!.auth },
    },
    JSON.stringify(payload)
  );
  // انتشار رویداد push در SW — کمی صبر
  await page.waitForTimeout(1500);
  const notifs = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const list = await reg?.getNotifications();
    return (list ?? []).map((n) => ({ title: n.title, body: n.body, dir: n.dir, lang: n.lang, data: n.data }));
  });
  check('اعلان در Service Worker نمایش داده شد', notifs.length > 0, JSON.stringify(notifs));
  const n0 = notifs[0];
  check('عنوان اعلان صحیح', n0?.title === payload.title, n0?.title ?? '—');
  check('متن اعلان صحیح', n0?.body === payload.body);
  check('جهت RTL اعلان', n0?.dir === 'rtl');
  check('زبان fa اعلان', n0?.lang === 'fa');

  console.log('—— ۴) آفلاین: صفحه آفلاین ——');
  // اول یک ناوبری موفق تا HTML در کش بنشیند، سپس آفلاین
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await ctx.setOffline(true);
  await page.goto(`${BASE}/?offline-probe=1`, { waitUntil: 'domcontentloaded', timeout: 8000 })
    .catch(() => { /* fallback fallback */ });
  await page.waitForTimeout(600);
  const offlineText = await page.evaluate(() => document.body.innerText).catch(() => '');
  check('صفحه آفلاین فارسی نمایش داده شد', offlineText.includes('اتصال اینترنت برقرار نیست'), offlineText.slice(0, 120));
  check('دکمه تلاش دوباره در صفحه آفلاین', offlineText.includes('تلاش دوباره'));
  await ctx.setOffline(false);
  await page.waitForTimeout(800);

  console.log('—— ۵) لینک عمیق ?o= ——');
  // یک سفارش واقعی برای کاربر تست می‌سازیم تا deep link معتبر باشد
  const jarCookie = (await ctx.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join('; ');
  const cartAdd = await fetch(`${BASE}/api/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jarCookie },
    body: JSON.stringify({
      productId: (await (await fetch(`${BASE}/api/products/pistachio-akbari`)).json()).data.product.id,
      variantId: ((await (await fetch(`${BASE}/api/products/pistachio-akbari`)).json()).data.product.variants as Array<{ id: string; weightGrams: number }>).find((v) => v.weightGrams === 250)!.id,
      quantity: 1,
    }),
  });
  check('کالا برای سفارش تست به سبد اضافه شد', cartAdd.ok);
  const orderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jarCookie },
    body: JSON.stringify({
      address: {
        receiverName: 'کاربر پوش تست',
        receiverPhone: phone,
        province: 'تهران',
        city: 'تهران',
        fullAddress: 'خیابان تست پوش پلاک ۱۰ واحد ۲',
      },
      paymentMethod: 'COD',
    }),
  });
  const orderData = (await orderRes.json()) as { data: { code: string } | null };
  check('سفارش تست ثبت شد', orderRes.ok === true && !!orderData.data?.code, JSON.stringify(orderData).slice(0, 150));
  const orderCode = orderData.data!.code;

  await page.goto(`${BASE}/?o=${orderCode}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const deeplinkText = await page.evaluate(() => document.body.innerText);
  // UI کد سفارش را با ارقام فارسی نمایش می‌دهد
  const faD = '۰۱۲۳۴۵۶۷۸۹';
  const orderCodeFa = orderCode.replace(/\d/g, (d) => faD[Number(d)]);
  check('deep link به جزئیات سفارش رسید', deeplinkText.includes(orderCodeFa), `انتظار: ${orderCodeFa} | ${deeplinkText.slice(0, 200)}`);
  check('نشانی پاک شد (بدون ?o=)', !(await page.url()).includes('?o='), await page.url());

  console.log('—— ۶) کیفیت: خطای کنسول و اریز افقی ——');
  check('بدون pageerror', errors.length === 0, errors.join(' | '));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('بدون اریز افقی (۳۹۰px)', overflow === 0, `${overflow}px`);

  // ——— پاک‌سازی: موجودی واریانت ———
  const vi = (await (await fetch(`${BASE}/api/products/pistachio-akbari`)).json()) as { data: { product: { variants: Array<{ id: string; weightGrams: number }> } } };
  const v250 = vi.data.product.variants.find((v) => v.weightGrams === 250)!;
  const { execSync } = await import('node:child_process');
  execSync(`sqlite3 /home/z/my-project/db/custom.db "UPDATE ProductVariant SET stock=22 WHERE id='${v250.id}'" 2>/dev/null || python3 -c "
import sqlite3
c = sqlite3.connect('/home/z/my-project/db/custom.db')
c.execute(\\"UPDATE ProductVariant SET stock=22 WHERE id=?\\", ('${v250.id}',))
c.commit()"`, { shell: '/bin/bash' });

  await db.$disconnect();
  await ctx.close();

  console.log('\n══════════════════════════════');
  console.log(`نتیجه E2E: ${pass} موفق | ${fail} ناموفق`);
  if (fail > 0) process.exit(1);
  console.log('همه تست‌های E2E فاز ۱۰ سبز ✅');
}

main().catch(async (e) => {
  console.error('E2E FAILED:', e);
  await db.$disconnect();
  process.exit(1);
});
