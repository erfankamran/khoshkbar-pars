/**
 * رهگیری پاسخ ثبت Passkey در مرورگر و دیباگ مستقیم verifyRegistrationResponse
 * اجرا: bun scripts/debug-passkey-verify.ts
 */
import { chromium } from 'playwright-core';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { writeFileSync, readFileSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const PHONE = '09120000001';
const CAPTURE_FILE = '/tmp/pars-attresp.json';

async function otpLogin(): Promise<string> {
  const req = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  });
  const rb = await req.json();
  if (!rb?.data?.devCode) throw new Error(JSON.stringify(rb));
  const verify = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, code: rb.data.devCode }),
  });
  const vb = await verify.json();
  if (!vb?.data?.sessionToken) throw new Error(JSON.stringify(vb));
  return vb.data.sessionToken;
}

async function main() {
  const token = await otpLogin();
  const executablePath =
    '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext();
  await context.addInitScript(
    (t) => window.localStorage.setItem('pars:session-token', t),
    token
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
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

  // رهگیری POST ثبت — بدنه را ذخیره می‌کنیم
  let captured = false;
  page.on('request', (req) => {
    if (req.url().includes('/api/auth/passkeys')) {
      console.log('  [net-out]', req.method(), req.url().split('/api/')[1]);
    }
    if (req.url().includes('/api/auth/passkeys/register/verify') && !captured) {
      captured = true;
      writeFileSync(CAPTURE_FILE, req.postData() ?? '{}');
      console.log('✅ پاسخ ثبت رهگیری شد →', CAPTURE_FILE);
    }
  });
  page.on('response', (res) => {
    if (res.url().includes('/api/auth/passkeys')) {
      console.log('  [net-in]', res.status(), res.url().split('/api/')[1]);
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log('  [console]', msg.type(), msg.text().slice(0, 180));
    }
  });
  page.on('pageerror', (err) => console.log('  [pageerror]', String(err).slice(0, 180)));

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('nav button', { hasText: 'حساب' }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('button, a, [role=button]', { hasText: 'امنیت حساب' }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: 'افزودن' }).first().click();
  for (let i = 0; i < 15 && !captured; i++) {
    await page.waitForTimeout(1000);
    // هر یک‌ثانیه toastها را هم می‌خوانیم
    const toasts = await page.locator('[data-sonner-toast]').allTextContents();
    if (toasts.length) console.log('  [toast]', toasts.join(' | ').slice(0, 160));
  }
  await page.waitForTimeout(2000);
  // بدنه پاسخ options هم ذخیره می‌شود تا ساختار options مشخص باشد
  const optionsResp = await page.evaluate(async () => {
    const token = window.localStorage.getItem('pars:session-token');
    const res = await fetch('/api/auth/passkeys/register/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pars-session': token ?? '' },
      body: JSON.stringify({}),
    });
    return res.json();
  });
  console.log('options sample:', JSON.stringify(optionsResp).slice(0, 500));
  await browser.close();

  if (!captured) {
    console.log('❌ رهگیری انجام نشد');
    return;
  }

  // ——— دیباگ مستقیم با کتابخانه ———
  const payload = JSON.parse(readFileSync(CAPTURE_FILE, 'utf8'));
  const resp = payload?.response ?? payload;
  console.log('keys:', Object.keys(resp));
  console.log('response keys:', Object.keys(resp.response ?? {}));
  console.log('attestationObject length:', resp.response?.attestationObject?.length);

  // متن clientDataJSON
  const cd = JSON.parse(
    Buffer.from(resp.response.clientDataJSON, 'base64url').toString('utf8')
  );
  console.log('clientData:', JSON.stringify(cd).slice(0, 300));

  try {
    const v = await verifyRegistrationResponse({
      response: resp,
      expectedChallenge: cd.challenge,
      expectedOrigin: cd.origin,
      expectedRPID: 'localhost',
      requireUserVerification: false,
    });
    console.log('✅ verify نتیجه:', v.verified);
  } catch (err) {
    console.log('❌ verify خطا:', (err as Error).message);
    console.log('stack:', (err as Error).stack?.split('\n').slice(0, 8).join('\n'));
  }
}

main().catch((e) => {
  console.error('خطا:', e);
  process.exit(1);
});
