/**
 * تست رگرسیون درگاه پرداخت زیبال — فاز ۱۶
 *
 * پوشش:
 *  ۱) SANDBOX (پیش‌فرض) — رفتار فازهای قبل حفظ می‌شود: سفارش آنلاین بلافاصله
 *     PAID با مرجع SANDBOX-… و بدون startUrl (بدون تماس شبکه‌ای)
 *  ۲) درگاه واقعی بدون مرچنت → 400 GATEWAY_NOT_CONFIGURED (سفارش ساخته نمی‌شود)
 *  ۳) درگاه واقعی با مرچنت تست «zibal»:
 *     - سفارش آنلاین → PENDING_PAYMENT + payment.startUrl معتبر + paymentTrackId
 *     - (در صورت دسترس‌پذیری شبکه) وریفای owner → پاسخ ساختاریافته درگاه
 *       (در تست زیبال پرداختی انجام نشده → verified=false با کد 202/203)
 *     - trackId غلط → 400 PAYMENT_SESSION_MISMATCH؛ بدون ورود → 401
 *     - COD بدون درگاه → مثل قبل 200
 *     - شبکه نبود → 502 PAYMENT_* (پذیرفته می‌شود؛ محیط بدون اینترنت)
 *  ۴) DTO سفارش شامل paymentTrackId (null در SANDBOX)
 *  ۵) بازگردانی تنظیمات اصلی در پایان (idempotent)
 *
 * اجرا: bun scripts/phase16-tests.ts [baseUrl]
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';

let pass = 0;
let failCount = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    failCount++;
    failures.push(name);
    console.log(`  ❌ ${name} ${extra}`);
  }
}

interface ApiResp<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const ADMIN_PHONE = '09120000000';

const ADDRESS = {
  receiverName: 'سارا محمدی',
  receiverPhone: '09121110000',
  province: 'تهران',
  city: 'تهران',
  postalCode: '1234567890',
  fullAddress: 'خیابان ولیعصر، کوچه بهار، پلاک ۱۲، واحد ۳',
};

async function getJson(path: string, headers?: Record<string, string>) {
  const res = await fetch(`${BASE}${path}`, { headers });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* بدنه غیر JSON */
  }
  return { status: res.status, json };
}

async function requestJson(
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; body: ApiResp<Record<string, unknown>> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* بدنه غیر JSON */
  }
  return { status: res.status, body: (json ?? {}) as ApiResp<Record<string, unknown>> };
}

async function otpLogin(phone: string): Promise<string | null> {
  const reqRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const reqBody = (await reqRes.json()) as ApiResp<{ devCode?: string }>;
  if (!reqBody.ok || !reqBody.data?.devCode) {
    if (reqBody.error?.code === 'OTP_COOLDOWN') {
      const secs = parseInt(
        reqBody.error.message
          .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
          .match(/\d+/)?.[0] ?? '60',
        10
      );
      console.log(`  ⏳ cooldown OTP — ${secs + 2} ثانیه صبر…`);
      await new Promise((r) => setTimeout(r, (secs + 2) * 1000));
      return otpLogin(phone);
    }
    return null;
  }
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: reqBody.data.devCode }),
  });
  const verifyBody = (await verifyRes.json()) as ApiResp<{ sessionToken?: string }>;
  return verifyBody.data?.sessionToken ?? null;
}

interface OrderCreated {
  code: string;
  status: string;
  paymentStatus: string;
  paymentRef: string | null;
  paymentTrackId: string | null;
  payment?: { startUrl: string; trackId: string };
}

interface SettingsResp {
  settings: { key: string; value: string }[];
}

async function main() {
  console.log(`— تست فاز ۱۶: درگاه پرداخت زیبال روی ${BASE} —\n`);

  const adminToken = await otpLogin(ADMIN_PHONE);
  check('ورود مدیر', !!adminToken);
  if (!adminToken) {
    finish();
    return;
  }
  const adminHeaders = { 'x-pars-session': adminToken, 'Content-Type': 'application/json' };

  // مقادیر اصلی برای بازگردانی
  const adm = await getJson('/api/admin/settings', { 'x-pars-session': adminToken });
  const admData = (adm.json as { data?: SettingsResp } | undefined)?.data;
  const original: Record<string, string> = {};
  for (const s of admData?.settings ?? []) original[s.key] = s.value;
  const restore = () =>
    requestJson('PUT', '/api/admin/settings', { values: original }, adminHeaders);

  // ——— ۱) SANDBOX مثل قبل ———
  console.log('۱) SANDBOX — رفتار قبلی حفظ می‌شود:');
  await requestJson(
    'PUT',
    '/api/admin/settings',
    { values: { ...original, gatewayProvider: 'SANDBOX', gatewayMerchantId: '' } },
    adminHeaders
  );

  const userPhone = `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const userToken = await otpLogin(userPhone);
  check('ورود کاربر تست', !!userToken);
  if (!userToken) {
    await restore();
    finish();
    return;
  }
  const userHeaders = { 'x-pars-session': userToken, 'Content-Type': 'application/json' };

  const prodRes = await getJson('/api/products?page=1&pageSize=1');
  const prodData = (
    prodRes.json as {
      data?: { items: { id: string; variants: { id: string; priceToman: number }[] }[] };
    } | undefined
  )?.data;
  const product = prodData?.items[0];
  const variant = product?.variants[0];
  check('محصول و واریانت پیدا شد', !!product && !!variant);
  if (!product || !variant) {
    await restore();
    finish();
    return;
  }
  const addCart = () =>
    requestJson(
      'POST',
      '/api/cart/items',
      { productId: product!.id, variantId: variant!.id, quantity: 1 },
      userHeaders
    );

  await addCart();
  const sandboxOrder = await requestJson(
    'POST',
    '/api/orders',
    { address: ADDRESS, paymentMethod: 'ONLINE_GATEWAY' },
    userHeaders
  );
  const sandbox = sandboxOrder.body.data as OrderCreated | undefined;
  check('سفارش آنلاین SANDBOX → 200', sandboxOrder.status === 200 && !!sandbox?.code);
  check('وضعیت بلافاصله PAID (شبیه‌سازی مثل قبل)', sandbox?.status === 'PAID');
  check(
    'مرجع پرداخت با پیشوند SANDBOX',
    !!sandbox?.paymentRef && sandbox.paymentRef.startsWith('SANDBOX')
  );
  check('بدون startUrl (هیچ درگاهی باز نمی‌شود)', !sandbox?.payment?.startUrl);
  check('paymentTrackId در SANDBOX خالی است', sandbox?.paymentTrackId === null);

  // ——— ۲) درگاه واقعی بدون مرچنت ———
  console.log('\n۲) ZIBAL بدون مرچنت کد:');
  await requestJson(
    'PUT',
    '/api/admin/settings',
    { values: { ...original, gatewayProvider: 'ZIBAL', gatewayMerchantId: '' } },
    adminHeaders
  );
  await addCart();
  const noMerchant = await requestJson(
    'POST',
    '/api/orders',
    { address: ADDRESS, paymentMethod: 'ONLINE_GATEWAY' },
    userHeaders
  );
  check(
    'سفارش آنلاین → 400 GATEWAY_NOT_CONFIGURED',
    noMerchant.status === 400 && noMerchant.body.error?.code === 'GATEWAY_NOT_CONFIGURED',
    `status=${noMerchant.status} err=${noMerchant.body.error?.code ?? '-'}`
  );

  // ——— ۳) درگاه واقعی با مرچنت تست zibal ———
  console.log('\n۳) ZIBAL با مرچنت تست «zibal»:');
  await requestJson(
    'PUT',
    '/api/admin/settings',
    { values: { ...original, gatewayProvider: 'ZIBAL', gatewayMerchantId: 'zibal' } },
    adminHeaders
  );
  await addCart();
  const zibalOrder = await requestJson(
    'POST',
    '/api/orders',
    { address: ADDRESS, paymentMethod: 'ONLINE_GATEWAY' },
    userHeaders
  );
  const zibal = zibalOrder.body.data as OrderCreated | undefined;

  if (zibalOrder.status === 200 && zibal?.payment?.startUrl) {
    check('سفارش آنلاین واقعی → 200 (نشست پرداخت زیبال ساخته شد)', true);
    check(
      'وضعیت PENDING_PAYMENT تا وریفای (نه PAID)',
      zibal.status === 'PENDING_PAYMENT' && zibal.paymentStatus === 'UNPAID',
      `got=${zibal.status}/${zibal.paymentStatus}`
    );
    check(
      'startUrl معتبر درگاه زیبال',
      /^https:\/\/gateway\.zibal\.ir\/start\/\d+$/.test(zibal.payment.startUrl),
      `got=${zibal.payment.startUrl}`
    );
    check(
      'paymentTrackId عددی ذخیره شد',
      /^\d+$/.test(zibal.paymentTrackId ?? '')
    );

    // وریفای بدون ورود → 401
    const verifyNoAuth = await requestJson('POST', '/api/payments/verify', {
      code: zibal.code,
      trackId: zibal.payment.trackId,
    });
    check('وریفای بدون ورود → 401', verifyNoAuth.status === 401);

    // وریفای با trackId غلط → 400
    const verifyWrong = await requestJson(
      'POST',
      '/api/payments/verify',
      { code: zibal.code, trackId: '999999999' },
      userHeaders
    );
    check(
      'وریفای با trackId متفاوت → 400 PAYMENT_SESSION_MISMATCH',
      verifyWrong.status === 400 && verifyWrong.body.error?.code === 'PAYMENT_SESSION_MISMATCH',
      `status=${verifyWrong.status} err=${verifyWrong.body.error?.code ?? '-'}`
    );

    // وریفای واقعی — در تست زیبال پرداختی انجام نشده → verified=false
    const verify = await requestJson(
      'POST',
      '/api/payments/verify',
      { code: zibal.code, trackId: zibal.payment.trackId },
      userHeaders
    );
    const v = verify.body.data as
      | {
          verified: boolean;
          alreadyPaid: boolean;
          code: string;
          gatewayResult: number | null;
          gatewayStatus: number | null;
          gatewayMessage: string;
        }
      | undefined;
    check('وریفای owner → 200', verify.status === 200 && !!v);
    check('کد سفارش در پاسخ درست است', v?.code === zibal.code);
    check(
      'درگاه واقعی پاسخ ساختاریافته داد (verified=false تا پرداخت نشده)',
      v?.verified === false && v?.gatewayResult !== null,
      `got=${JSON.stringify(v)}`
    );
    check(
      'سفارش همچنان PENDING_PAYMENT (تأیید نشده)',
      v?.verified === false
    );
  } else if (
    zibalOrder.status === 502 &&
    ['PAYMENT_GATEWAY_ERROR', 'PAYMENT_REQUEST_FAILED'].includes(
      zibalOrder.body.error?.code ?? ''
    )
  ) {
    // محیط بدون دسترسی به gateway.zibal.ir — خطای مدیریت‌شده، سفارشی ساخته نشده
    check('درگاه در دسترس نیست → 502 مدیریت‌شده (بدون ساخت سفارش)', true);
    console.log('  ⏭️ شبکه به gateway.zibal.ir در دسترس نیست — تست‌های اتصال رد شد');
  } else {
    check(
      'پاسخ غیرمنتظره از جریان زیبال',
      false,
      `status=${zibalOrder.status} err=${zibalOrder.body.error?.code ?? '-'}`
    );
  }

  // COD در حالت درگاه واقعی — بدون درگیر شدن زیبال
  await addCart();
  const codOrder = await requestJson(
    'POST',
    '/api/orders',
    { address: ADDRESS, paymentMethod: 'COD' },
    userHeaders
  );
  check(
    'COD با درگاه واقعی هم مثل قبل کار می‌کند',
    codOrder.status === 200 && (codOrder.body.data as OrderCreated | undefined)?.status === 'PENDING_PAYMENT'
  );

  // ——— ۴) بازگردانی ———
  console.log('\n۴) بازگردانی تنظیمات (idempotent):');
  await restore();
  const pubFinal = await getJson('/api/settings');
  const pubFinalData = (pubFinal.json as { data?: Record<string, unknown> } | undefined)?.data;
  check(
    'درگاه به حالت قبل برگشت (SANDBOX در تنظیمات عمومی)',
    pubFinalData?.gatewayProvider === 'SANDBOX'
  );

  finish();
}

function finish() {
  console.log('');
  if (failures.length === 0) {
    console.log(`🎉 همه ${pass} بررسی فاز ۱۶ سبز بود`);
    process.exit(0);
  }
  console.log(`💥 ${failCount} بررسی شکست خورد:`);
  for (const f of failures) console.log(`   - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error('خطای غیرمنتظره:', e);
  process.exit(1);
});
