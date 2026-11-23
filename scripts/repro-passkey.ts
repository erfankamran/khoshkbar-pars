/**
 * بازتولید کامل جریان ثبت Passkey با authenticator مجازی CDP
 * هدف: مشاهده خطای واقعی verifyRegistrationResponse در SecurityLog
 * اجرا: bun scripts/repro-passkey.ts
 */
import { chromium } from 'playwright-core';
import { Database } from 'bun:sqlite';

const BASE = 'http://localhost:3000';
const PHONE = '09120000001';

async function otpLogin(): Promise<string> {
  const req = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  });
  const reqBody = await req.json();
  const devCode = reqBody?.data?.devCode;
  if (!devCode) throw new Error(`OTP request failed: ${JSON.stringify(reqBody)}`);
  const verify = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, code: devCode }),
  });
  const verifyBody = await verify.json();
  const token = verifyBody?.data?.sessionToken;
  if (!token) throw new Error(`OTP verify failed: ${JSON.stringify(verifyBody)}`);
  return token;
}

async function main() {
  const token = await otpLogin();
  console.log('✅ session token:', token.slice(0, 10) + '…');

  const executablePath =
    process.env.CHROME_PATH ??
    '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({ locale: 'fa-IR' });
  // نشست را قبل از بارگذاری اپ تزریق می‌کنیم
  await context.addInitScript(
    (t) => window.localStorage.setItem('pars:session-token', t),
    token
  );

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  // فعال‌سازی authenticator مجازی — اثر انگشت/بایومتریک شبیه‌سازی می‌شود
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  console.log('✅ virtual authenticator:', authenticatorId);

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [console.error]', msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => console.log('  [pageerror]', String(err).slice(0, 200)));

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  // ناوبری: تب حساب → امنیت حساب
  const accountBtn = page.locator('nav button', { hasText: 'حساب' }).first();
  await accountBtn.click();
  await page.waitForTimeout(1800);

  const securityLink = page.locator('button, a, [role=button]', { hasText: 'امنیت حساب' }).first();
  const found = await securityLink.count();
  if (found > 0) {
    await securityLink.click();
    await page.waitForTimeout(1800);
    console.log('✅ وارد نمای امنیت حساب شد');
  } else {
    console.log('⚠️ دکمه امنیت حساب یافت نشد — اسکرین‌شات برای بررسی');
    await page.screenshot({ path: '/tmp/render/repro-account.png' });
  }

  // دکمه افزودن روش ورود
  const addBtn = page.locator('button', { hasText: 'افزودن' }).first();
  const addCount = await addBtn.count();
  if (addCount === 0) {
    console.log('❌ دکمه «افزودن» یافت نشد (احتمالاً webAuthnSupported=false در این مرورگر)');
    await page.screenshot({ path: '/tmp/render/repro-security.png' });
    await browser.close();
    return;
  }
  await addBtn.click();
  console.log('⏳ درخواست ثبت Passkey ارسال شد — منتظر نتیجه…');

  // تا ۲۰ ثانیه صبر برای toast موفقیت یا خطا
  try {
    await page.waitForSelector('text=روش ورود جدید ذخیره شد', { timeout: 20000 });
    console.log('🎉 ثبت موفق — toast «روش ورود جدید ذخیره شد»');
  } catch {
    console.log('❌ toast موفقیت ظاهر نشد — خطا رخ داده');
    // متن خطا را از toastها جمع می‌کنیم
    const toasts = await page.locator('[data-sonner-toast]').allTextContents();
    console.log('toasts:', toasts);
    await page.screenshot({ path: '/tmp/render/repro-result.png' });
  }

  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/render/repro-final.png' });

  // ——— فاز ۲: ورود با Passkey — خروج و ورود مجدد با کلید ———
  console.log('\n— فاز ورود با Passkey —');
  await context.addInitScript(() => window.localStorage.removeItem('pars:session-token'));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2200);

  // جریان کامل ورود: options → credentials.get → verify → نشست
  const loginResult = await page.evaluate(async () => {
    const opts = await fetch('/api/auth/passkeys/login/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).then((r) => r.json());
    if (!opts?.data?.options) return { stage: 'options', error: JSON.stringify(opts).slice(0, 200) };

    const authResp = (await navigator.credentials.get({
      publicKey: {
        ...opts.data.options,
        challenge: Uint8Array.from(
          atob(
            opts.data.options.challenge.replace(/-/g, '+').replace(/_/g, '/') +
              '='.repeat((4 - (opts.data.options.challenge.length % 4)) % 4)
          ),
          (c) => c.charCodeAt(0)
        ),
        allowCredentials: (opts.data.options.allowCredentials ?? []).map(
          (c: { id: string }) => ({
            id: Uint8Array.from(
              atob(
                c.id.replace(/-/g, '+').replace(/_/g, '/') +
                  '='.repeat((4 - (c.id.length % 4)) % 4)
              ),
              (ch) => ch.charCodeAt(0)
            ),
            type: 'public-key' as const,
          })
        ),
      },
    })) as unknown as Record<string, unknown>;

    if (!authResp) return { stage: 'credentials.get', error: 'پاسخ خالی' };

    const verify = await fetch('/api/auth/passkeys/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authResp),
    }).then((r) => r.json());
    return { stage: 'verify', ok: verify?.ok, user: verify?.data?.user?.phone ?? null };
  });
  console.log('نتیجه ورود با Passkey:', JSON.stringify(loginResult));

  // بررسی نتیجه سمت سرور
  const db = new Database('db/custom.db', { readonly: true });
  const rows = db
    .query(
      "SELECT event, meta FROM SecurityLog WHERE userId IS NOT NULL AND event LIKE '%PASSKEY%' ORDER BY createdAt DESC LIMIT 5"
    )
    .all();
  console.log('--- آخرین رخدادهای Passkey در SecurityLog ---');
  for (const r of rows) console.log(' ', r.event, r.meta);
  const pkCount = db.query('SELECT COUNT(*) c FROM PasskeyCredential').get()!.c as number;
  console.log('PasskeyCredential rows:', pkCount);
  db.close();

  await browser.close();
}

main().catch((e) => {
  console.error('خطا:', e);
  process.exit(1);
});
