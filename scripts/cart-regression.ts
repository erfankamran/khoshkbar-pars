/**
 * تست رگرسیون سبد خرید — رفع «خالی شدن خودبه‌خودی سبد»
 *
 * سناریوها:
 *  ۱) هویت با هدر (شبیه‌سازی iframe با بلاک کوکی ثالث): سبد باید با x-pars-device
 *     بین درخواست‌ها حفظ شود — پیش از این هر درخواست سبد خالی جدید می‌ساخت.
 *  ۲) Adoption: اولین بازدید بدون هیچ هویتی → سرور هویت جدید در هدر پاسخ می‌دهد.
 *  ۳) کوکی روی HTTPS باید SameSite=None; Secure باشد (کارکردن در iframe).
 *  ۴) چرخه ورود/خروج: خروج نباید سبد را خالی کند (انتقال سبد کاربر → دستگاه).
 *
 * اجرا: bun scripts/cart-regression.ts [baseUrl]
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  items: { id: string; variantId: string; quantity: number; title: string }[];
  totals: { totalQuantity: number };
}

async function getVariant(): Promise<{ productId: string; variantId: string }> {
  const res = await fetch(`${BASE}/api/products?page=1&pageSize=1`);
  const body = (await res.json()) as {
    data: { items: { id: string; slug: string; variants: { id: string }[] }[] };
  };
  const p = body.data.items[0];
  return { productId: p.id, variantId: p.variants[0].id };
}

async function main() {
  console.log(`— تست رگرسیون سبد روی ${BASE} —\n`);
  const { productId, variantId } = await getVariant();

  // ——— ۱) هویت با هدر (بلاک کوکی در iframe) ———
  console.log('۱) هویت دستگاه با هدر x-pars-device (شبیه‌سازی بلاک کوکی):');
  const deviceId = crypto.randomUUID();

  const addRes = await fetch(`${BASE}/api/cart/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pars-device': deviceId,
      // عمداً بدون cookie jar — شبیه مرورگری که کوکی نمی‌فرستد
    },
    body: JSON.stringify({ productId, variantId, quantity: 2 }),
  });
  const addBody = (await addRes.json()) as { ok: boolean; data: CartResp };
  check('افزودن کالا موفق', addBody.ok === true && addBody.data.items.length === 1);
  check(
    'هویت در هدر پاسخ echo شد',
    addRes.headers.get('x-pars-device') === deviceId
  );

  // همان درخواستِ GET بدون کوکی — پیش از رفع: سبد خالیِ تازه برمی‌گشت
  const getRes = await fetch(`${BASE}/api/cart`, {
    headers: { 'x-pars-device': deviceId },
  });
  const getBody = (await getRes.json()) as { ok: boolean; data: CartResp };
  check(
    'GET بعدی بدون کوکی، سبد حفظ شده (رفع باگ اصلی)',
    getBody.ok === true &&
      getBody.data.items.length === 1 &&
      getBody.data.items[0].quantity === 2,
    `items=${getBody.data?.items?.length}`
  );
  check(
    'پاسخ همان cartId را دارد (هویت پایدار)',
    getBody.data.cartId === addBody.data.cartId
  );

  // ——— ۲) Adoption ———
  console.log('\n۲) Adoption هویت جدید در اولین بازدید:');
  const firstRes = await fetch(`${BASE}/api/cart`);
  const echoed = firstRes.headers.get('x-pars-device');
  check('هویت جدید در هدر پاسخ آمد', !!echoed && UUID_RE.test(echoed));
  const setCookie = firstRes.headers.get('set-cookie') ?? '';
  check('کوکی pars_device ست شد', setCookie.includes('pars_device='));

  // ——— ۳) کوکی روی HTTPS ———
  console.log('\n۳) کوکی روی HTTPS (iframe بین‌سایتی):');
  const httpsRes = await fetch(`${BASE}/api/cart`, {
    headers: { 'x-forwarded-proto': 'https' },
  });
  const httpsCookie = httpsRes.headers.get('set-cookie') ?? '';
  check(
    'SameSite=None + Secure روی HTTPS',
    /samesite=(none|None)/i.test(httpsCookie) && /secure/i.test(httpsCookie),
    httpsCookie.split(';').map((s) => s.trim()).join(' | ')
  );
  const httpRes = await fetch(`${BASE}/api/cart`);
  const httpCookie = httpRes.headers.get('set-cookie') ?? '';
  check('روی HTTP محلی SameSite=Lax می‌ماند', /samesite=lax/i.test(httpCookie), httpCookie);

  // ——— ۴) چرخه ورود/خروج ———
  console.log('\n۴) خروج از حساب نباید سبد را خالی کند:');
  // ۴-۱) سبد مهمان با هویت هدر + یک کالای دیگر
  await fetch(`${BASE}/api/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pars-device': deviceId },
    body: JSON.stringify({ productId, variantId, quantity: 1 }),
  });

  // ۴-۲) ورود OTP (کد در محیط dev در پاسخ برمی‌گردد) — شماره تصادفی تا سرد شدن ۶۰ ثانیه‌ای همیشه آزاد باشد
  const phone = `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const otpRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const otpBody = (await otpRes.json()) as { ok: boolean; data?: { devCode?: string } };
  if (!otpBody.ok || !otpBody.data?.devCode) {
    check('دریافت کد OTP', false, JSON.stringify(otpBody));
  } else {
    const code = otpBody.data.devCode;
    const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pars-device': deviceId },
      body: JSON.stringify({ phone, code }),
    });
    const verifyBody = (await verifyRes.json()) as {
      ok: boolean;
      data: { user: unknown; cart: CartResp };
    };
    check('ورود موفق + ادغام سبد مهمان', verifyBody.ok === true);
    check(
      'سبد پس از ادغام موجود است',
      verifyBody.data?.cart?.items.length === 1 &&
        verifyBody.data?.cart?.items[0].quantity === 3,
      `qty=${verifyBody.data?.cart?.items?.[0]?.quantity}`
    );
    const sessionCookie = (verifyRes.headers.get('set-cookie') ?? '')
      .split(';')[0]
      .trim();

    // ۴-۳) خروج — سبد باید به دستگاه برگردد
    const logoutRes = await fetch(`${BASE}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'x-pars-device': deviceId,
      },
    });
    const logoutBody = (await logoutRes.json()) as { ok: boolean };
    check('خروج موفق', logoutBody.ok === true);

    // ۴-۴) GET مهمان با همان هویت — پیش از رفع: خالی بود
    const afterRes = await fetch(`${BASE}/api/cart`, {
      headers: { 'x-pars-device': deviceId },
    });
    const afterBody = (await afterRes.json()) as { ok: boolean; data: CartResp };
    check(
      'سبد بعد از خروج سر جایش است (رفع باگ خروج)',
      afterBody.ok === true &&
        afterBody.data.items.length === 1 &&
        afterBody.data.items[0].quantity === 3,
      `qty=${afterBody.data?.items?.[0]?.quantity}`
    );

    // ۴-۵) پاک‌سازی — حذف ردیف برای تست تمیز بعدی
    const rowId = afterBody.data.items[0]?.id;
    if (rowId) {
      await fetch(`${BASE}/api/cart/items/${rowId}`, {
        method: 'DELETE',
        headers: { 'x-pars-device': deviceId },
      });
    }
  }

  console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('خطای اجرای تست:', e);
  process.exit(1);
});
