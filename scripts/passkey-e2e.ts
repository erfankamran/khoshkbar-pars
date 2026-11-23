/**
 * تست e2e واقعی WebAuthn — ثبت و ورود Passkey با authenticator مجازی Chrome (CDP)
 *
 * این تنها روش واقعی تست Passkey بدون سخت‌افزار است: Chrome DevTools Protocol
 * یک authenticator مجازی با resident key و user verification می‌سازد و کل
 * جریان رمزنگاشتی (CTAP2) واقعی انجام می‌شود — نه شبیه‌سازی.
 *
 * جریان:
 *  ۱) ورود مشتری با کد مادر از UI فروشگاه (حساب → ورود)
 *  ۲) دیالوگ پیشنهاد «ذخیره روش ورود» ظاهر می‌شود → ثبت Passkey (مجازی)
 *  ۳) نمای امنیت حساب → کلید ذخیره‌شده دیده می‌شود
 *  ۴) خروج از حساب
 *  ۵) ورود دوباره فقط با Passkey (بدون شماره و بدون OTP) — discoverable
 *  ۶) بررسی ورود موفق + حذف کلید از نمای امنیت (پاکسازی)
 *
 * اجرا: bun scripts/passkey-e2e.ts [baseUrl]
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
  console.log(`— e2e واقعی WebAuthn روی ${BASE} —\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  // شنود خطاهای کنسول — برای تشخیص سریع
  page.on('pageerror', (err) => console.log(`  [pageerror] ${err.message.slice(0, 200)}`));

  // پورتال dev overlay در حالت dev ممکن است روی دکمه‌ها بنشیند — در تست مخفی می‌شود
  const hideDevOverlay = async () => {
    try {
      await page.addStyleTag({
        content: 'nextjs-portal{display:none !important; pointer-events:none !important;}',
      });
    } catch {
      /* قبل از بارگذاری صفحه — نادیده */
    }
  };

  // ——— authenticator مجازی — کلید resident + UV فعال ———
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2' as const,
      transport: 'internal' as const,
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticRegistration: false,
    },
  });
  check('authenticator مجازی ساخته شد', !!authenticatorId);

  // ——— ۱) ورود مشتری با کد مادر ———
  console.log('۱) ورود مشتری با OTP:');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2200);
  await hideDevOverlay();
  await page.locator('[aria-label="حساب"]').first().click();
  await page.waitForTimeout(900);
  await hideDevOverlay();
  await page.getByRole('button', { name: /ورود \| ثبت‌نام/ }).first().click();
  await page.waitForTimeout(900);
  await page.fill('#login-phone', '09121234567');
  await page.getByRole('button', { name: /ورود سریع با کد مادر/ }).click();
  await page.waitForTimeout(2200);

  // ——— ۲) دیالوگ پیشنهاد ثبت Passkey ———
  console.log('۲) پیشنهاد ذخیره روش ورود:');
  const offerDialog = page.locator('[aria-label="پیشنهاد ذخیره روش ورود"]');
  const offerVisible = (await offerDialog.count()) > 0;
  check('دیالوگ پیشنهاد ظاهر شد', offerVisible);
  if (offerVisible) {
    const offerText = await offerDialog.textContent();
    check(
      'متن پیشنهاد استاندارد',
      (offerText ?? '').includes('ورود سریع‌تر و امن‌تر') &&
        (offerText ?? '').includes('Google Password Manager'),
      offerText?.slice(0, 60)
    );
    // ثبت واقعی WebAuthn — authenticator مجازی خودکار تأیید می‌کند
    await offerDialog.getByRole('button', { name: 'ذخیره روش ورود' }).click();
    await page.waitForTimeout(3000);
    const bodyText = await page.textContent('body');
    check(
      'ثبت موفق (toast)',
      (bodyText ?? '').includes('روش ورود در دستگاه ذخیره شد') ||
        !(bodyText ?? '').includes('ثبت روش ورود انجام نشد'),
      ''
    );
  }

  // ——— ۳) نمای امنیت حساب — کلید ذخیره‌شده ———
  console.log('۳) نمای امنیت حساب:');
  await page.locator('[aria-label="حساب"]').first().click();
  await page.waitForTimeout(900);
  await hideDevOverlay();
  await page.getByRole('button', { name: /امنیت حساب/ }).first().click();
  await page.waitForTimeout(1600);
  const secText = await page.textContent('body');
  check('نمای امنیت حساب باز شد', (secText ?? '').includes('روش‌های ورود ذخیره‌شده'));
  check('کلید Passkey در فهرست است', (secText ?? '').includes('همگام‌شونده') || (secText ?? '').includes('همین دستگاه'), '');

  // ——— ۴) خروج ———
  console.log('۴) خروج از حساب:');
  await page.getByRole('button', { name: /خروج از حساب در این دستگاه/ }).click();
  await page.waitForTimeout(1800);
  // خروج از نمای امنیت → حساب مهمان (کارت ورود نمایش داده می‌شود)
  await hideDevOverlay();
  await page.locator('[aria-label="حساب"]').first().click();
  await page.waitForTimeout(1400);
  const afterLogout = await page.textContent('body');
  check(
    'خروج انجام شد',
    (afterLogout ?? '').includes('کاربر مهمان') || (afterLogout ?? '').includes('ورود | ثبت‌نام')
  );

  // ——— ۵) ورود فقط با Passkey — بدون شماره و بدون OTP ———
  console.log('۵) ورود با Passkey (discoverable):');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2200);
  await hideDevOverlay();
  await page.locator('[aria-label="حساب"]').first().click();
  await page.waitForTimeout(900);
  await hideDevOverlay();
  await page.getByRole('button', { name: /ورود \| ثبت‌نام/ }).first().click();
  await page.waitForTimeout(1100);
  const passkeyBtn = page.getByRole('button', { name: /ورود سریع با Passkey/ });
  check('دکمه ورود با Passkey نمایان', (await passkeyBtn.count()) === 1, `got ${await passkeyBtn.count()}`);
  await passkeyBtn.click();
  await page.waitForTimeout(3200);
  // ورود موفق → نمای ورود کارت «وارد حساب خود هستید» نشان می‌دهد یا به حساب برمی‌گردد
  const afterPasskey = await page.textContent('body');
  check(
    'ورود با Passkey موفق',
    (afterPasskey ?? '').includes('وارد حساب خود هستید') ||
      (afterPasskey ?? '').includes('حساب کاربری من'),
    (afterPasskey ?? '').slice(0, 80)
  );

  // ——— ۶) پاکسازی: حذف کلید ———
  console.log('۶) پاکسازی — حذف کلید آزمون:');
  await page.locator('[aria-label="حساب"]').first().click().catch(() => {});
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /امنیت حساب/ }).first().click().catch(() => {});
  await page.waitForTimeout(1400);
  const delBtn = page.getByRole('button', { name: 'حذف روش ورود' });
  if ((await delBtn.count()) > 0) {
    await delBtn.first().click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'حذف کن' }).click();
    await page.waitForTimeout(1800);
    const afterDel = await page.textContent('body');
    check(
      'کلید حذف شد و OTP همچنان جایگزین است',
      (afterDel ?? '').includes('ورود با کد پیامکی همچنان فعال') || !(afterDel ?? '').includes('همگام‌شونده'),
      ''
    );
  } else {
    check('دکمه حذف کلید موجود', false);
  }

  await browser.close();

  console.log('');
  if (fail === 0) {
    console.log(`ALL GREEN — ${pass}/${pass + fail} بررسی e2e WebAuthn سبز ✅`);
    process.exit(0);
  }
  console.log(`قرمز: ${fail}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
