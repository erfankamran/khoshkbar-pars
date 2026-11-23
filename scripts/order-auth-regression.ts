/**
 * تست رگرسیون احراز هویت ثبت سفارش — رفع 401 «برای ثبت سفارش وارد حساب شوید»
 *
 * ریشه: نشست فقط از کوکی pars_session خوانده می‌شد؛ در iframe بین‌سایتی
 * (Safari ITP / Chrome 3PCD / کوکی قدیمی Lax) کوکی هرگز ارسال نمی‌شود →
 * کاربر در UI وارد شده به نظر می‌رسید (پاسخ verify بدنه دارد) ولی POST
 * /api/orders بدون هویت می‌رسید و 401 می‌داد.
 *
 * راه‌حل: فال‌بک هدر x-pars-session (توکن از بدنهٔ verify/me) + کوکی
 * Partitioned (CHIPS). این تست کل جریان را «بدون هیچ کوکی‌ای» شبیه‌سازی می‌کند.
 *
 * سناریوها:
 *  ۱) ورود OTP بدون کوکی → sessionToken در بدنهٔ پاسخ
 *  ۲) me با فقط هدر → کاربر + echo توکن
 *  ۳) ثبت سفارش با فقط هدر → ۲۰۰ + کد سفارش (رفع باگ اصلی)
 *  ۴) فهرست سفارش‌ها و دفترچه آدرس با فقط هدر → ۲۰۰
 *  ۵) کوکی نشست روی HTTPS → SameSite=None; Secure; Partitioned
 *  ۶) خروج با فقط هدر → نشست باطل؛ me با همان هدر → مهمان
 *  ۷) مهمان واقعی بدون هویت → POST /api/orders همچنان ۴۰۱ (محافظت سر جایش)
 *
 * اجرا: bun scripts/order-auth-regression.ts [baseUrl]
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';
const SESSION_TOKEN_RE = /^[a-f0-9]{64}$/i;

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

interface CartResp {
  cartId: string;
  items: { id: string; variantId: string; quantity: number }[];
}

const ADDRESS = {
  receiverName: 'سارا محمدی',
  receiverPhone: '09121110000',
  province: 'تهران',
  city: 'تهران',
  postalCode: '1234567890',
  fullAddress: 'خیابان ولیعصر، کوچه بهار، پلاک ۱۲، واحد ۳',
};

async function getVariant(): Promise<{ productId: string; variantId: string }> {
  const res = await fetch(`${BASE}/api/products?page=1&pageSize=1`);
  const body = (await res.json()) as {
    data: { items: { id: string; variants: { id: string }[] }[] };
  };
  const p = body.data.items[0];
  return { productId: p.id, variantId: p.variants[0].id };
}

async function main() {
  console.log(`— تست رگرسیون ثبت سفارش (محیط بی‌کوکی) روی ${BASE} —\n`);
  const { productId, variantId } = await getVariant();
  const deviceId = crypto.randomUUID();
  const deviceHeaders = {
    'x-pars-device': deviceId,
    'Content-Type': 'application/json',
  };

  // ——— ۱) ورود OTP بدون هیچ کوکی‌ای ———
  console.log('۱) ورود OTP بدون کوکی (شبیه‌سازی iframe بین‌سایتی):');
  const phone = `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const otpRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const otpBody = (await otpRes.json()) as { ok: boolean; data?: { devCode?: string } };
  check('دریافت کد OTP', otpBody.ok === true && !!otpBody.data?.devCode);

  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: deviceHeaders,
    body: JSON.stringify({ phone, code: otpBody.data?.devCode }),
  });
  const verifyBody = (await verifyRes.json()) as {
    ok: boolean;
    data?: { user: { id: string; phone: string }; cart: CartResp; sessionToken?: string };
  };
  const token = verifyBody.data?.sessionToken;
  check('ورود موفق', verifyBody.ok === true && !!verifyBody.data?.user?.id);
  check(
    'sessionToken در بدنهٔ پاسخ آمد (پایهٔ فال‌بک هدر)',
    !!token && SESSION_TOKEN_RE.test(token),
    `token=${token?.slice(0, 12)}…`
  );
  const authHeaders = {
    'x-pars-session': token ?? 'invalid',
    'Content-Type': 'application/json',
  };

  // ——— ۲) me با فقط هدر ———
  console.log('\n۲) GET /api/auth/me با فقط هدر x-pars-session:');
  const meRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { 'x-pars-session': token ?? 'invalid' },
  });
  const meBody = (await meRes.json()) as {
    ok: boolean;
    data?: { user: { phone: string } | null; sessionToken?: string };
  };
  check(
    'کاربر از هدر شناخته شد (پیش از رفع: مهمان)',
    meBody.ok === true && meBody.data?.user?.phone === phone,
    JSON.stringify(meBody.data?.user)
  );
  check('توکن در پاسخ me هم echo شد', meBody.data?.sessionToken === token);

  // ——— ۳) ثبت سفارش با فقط هدر — رفع باگ اصلی ———
  console.log('\n۳) ثبت سفارش با فقط هدر (رفع ۴۰۱ «وارد حساب شوید»):');
  // افزودن کالا با هدر نشست → می‌رود به سبد کاربر (getSessionUser هدر را می‌فهمد)
  const addRes = await fetch(`${BASE}/api/cart/items`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ productId, variantId, quantity: 1 }),
  });
  const addBody = (await addRes.json()) as { ok: boolean; data?: CartResp };
  check(
    'کالا با فقط هدر به سبد کاربر اضافه شد',
    addBody.ok === true && (addBody.data?.items.length ?? 0) === 1,
    `err=${JSON.stringify((addBody as { error?: unknown }).error ?? '-')}`
  );

  const orderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ address: ADDRESS, paymentMethod: 'COD' }),
  });
  const orderBody = (await orderRes.json()) as {
    ok: boolean;
    data?: { code: string };
    error?: { code: string; message: string };
  };
  check(
    'POST /api/orders موفق با فقط هدر (پیش از رفع: 401 UNAUTHENTICATED)',
    orderRes.status === 200 && orderBody.ok === true && !!orderBody.data?.code,
    `status=${orderRes.status} err=${orderBody.error?.code ?? '-'}`
  );

  // ——— ۴) سایر endpointهای نیازمند ورود با فقط هدر ———
  console.log('\n۴) سایر endpointهای نیازمند ورود با فقط هدر:');
  const ordersListRes = await fetch(`${BASE}/api/orders?page=1`, {
    headers: { 'x-pars-session': token ?? 'invalid' },
  });
  const ordersListBody = (await ordersListRes.json()) as {
    ok: boolean;
    data?: { orders: { code: string }[] };
  };
  check(
    'GET /api/orders فهرست شامل سفارش تازه',
    ordersListRes.status === 200 &&
      ordersListBody.data?.orders.some((o) => o.code === orderBody.data?.code) === true
  );
  const addrRes = await fetch(`${BASE}/api/addresses`, {
    headers: { 'x-pars-session': token ?? 'invalid' },
  });
  check(
    'GET /api/addresses با فقط هدر ۲۰۰ (پیش از رفع: 401)',
    addrRes.status === 200,
    `status=${addrRes.status}`
  );

  // ——— ۵) کوکی نشست روی HTTPS ———
  console.log('\n۵) کوکی نشست روی HTTPS (iframe بین‌سایتی):');
  const phone2 = `0913${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const httpsOtpRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-proto': 'https' },
    body: JSON.stringify({ phone: phone2 }),
  });
  const httpsOtpBody = (await httpsOtpRes.json()) as { ok: boolean; data?: { devCode?: string } };
  const httpsVerifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pars-device': deviceId,
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify({ phone: phone2, code: httpsOtpBody.data?.devCode }),
  });
  const allSetCookies = httpsVerifyRes.headers.getSetCookie?.() ?? [];
  const sc = allSetCookies.find((c) => c.startsWith('pars_session=')) ?? '';
  check(
    'SameSite=None + Secure + Partitioned روی HTTPS',
    /samesite=(none|None)/i.test(sc) && /secure/i.test(sc) && /partitioned/i.test(sc),
    sc.split(';').map((s) => s.trim()).join(' | ')
  );

  // ——— ۶) خروج با فقط هدر ———
  console.log('\n۶) خروج با فقط هدر و ابطال نشست:');
  const logoutRes = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { 'x-pars-session': token ?? 'invalid', 'x-pars-device': deviceId },
  });
  const logoutBody = (await logoutRes.json()) as { ok: boolean };
  check('خروج با فقط هدر موفق (پیش از رفع: نشست پیدا نمی‌شد)', logoutBody.ok === true);
  const meAfterRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { 'x-pars-session': token ?? 'invalid' },
  });
  const meAfterBody = (await meAfterRes.json()) as { ok: boolean; data?: { user: unknown } };
  check(
    'همان هدر بعد از خروج → مهمان (نشست واقعاً باطل شد)',
    meAfterBody.ok === true && meAfterBody.data?.user === null
  );

  // ——— ۷) مهمان واقعی همچنان بلاک است ———
  console.log('\n۷) محافظت مهمان سر جایش است:');
  const guestRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pars-device': crypto.randomUUID() },
    body: JSON.stringify({ address: ADDRESS, paymentMethod: 'COD' }),
  });
  const guestBody = (await guestRes.json()) as { error?: { code: string } };
  check(
    'بدون هیچ هویتی → ۴۰۱ UNAUTHENTICATED (نشست جعلی ممکن نیست)',
    guestRes.status === 401 && guestBody.error?.code === 'UNAUTHENTICATED',
    `status=${guestRes.status}`
  );

  console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('خطای اجرای تست:', e);
  process.exit(1);
});
