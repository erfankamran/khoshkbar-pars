/**
 * تست رگرسیون ارسال پستی، وضعیت ارسال مشتری و درگاه پرداخت — فاز ۱۵
 *
 * پوشش:
 *  ۱) تنظیمات عمومی — کلیدهای جدید (روش‌های ارسال، درگاه) + عدم افشای مرچنت کد
 *  ۲) پنل — GET/PUT تنظیمات: whitelist کامل ۱۱ کلیدی + اعتبارسنجی‌های رد
 *     (JSON نامعتبر روش‌ها، شناسه تکراری، درگاه ناشناخته، کلید ناشناخته)
 *  ۳) ثبت سفارش با روش ارسال — هزینه روش انتخابی + Snapshot نام/زمان در جزئیات سفارش
 *  ۴) روش نامعتبر/غیرفعال → فال‌بک بی‌صدا به هزینه پایه (رفتار فازهای قبل حفظ می‌شود)
 *  ۵) درگاه غیرفعال (COD خاموش) → 400 PAYMENT_DISABLED؛ روش دیگر همچنان کار می‌کند
 *  ۶) فروشگاه بسته (storeOpen=false) → 400 STORE_CLOSED برای همه روش‌های پرداخت
 *  ۷) پاک‌سازی: مقادیر اصلی تنظیمات در پایان بازگردانده می‌شود (تست idempotent)
 *
 * اجرا: bun scripts/phase15-tests.ts [baseUrl]
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

interface ShipMethod {
  id: string;
  name: string;
  costToman: number;
  etaDays: string;
  enabled: boolean;
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

async function postJson(
  path: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; body: ApiResp<Record<string, unknown>> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
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

async function putJson(
  path: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; body: ApiResp<Record<string, unknown>> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
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

interface SettingsResp {
  settings: { key: string; value: string; description: string }[];
}

async function main() {
  console.log(`— تست فاز ۱۵: ارسال پستی، وضعیت ارسال مشتری، درگاه پرداخت روی ${BASE} —\n`);

  // ——— ۱) تنظیمات عمومی ———
  console.log('۱) GET /api/settings — کلیدهای عمومی جدید:');
  const pub = await getJson('/api/settings');
  const pubData = (pub.json as { ok: boolean; data?: Record<string, unknown> } | undefined)?.data;
  check('GET /api/settings → 200', pub.status === 200 && !!pubData);
  const methods = (pubData?.shippingMethods ?? null) as ShipMethod[] | null;
  check(
    'shippingMethods به‌صورت ساختاریافته (آرایه) برگشت',
    Array.isArray(methods) && methods.length >= 1
  );
  const firstMethod = methods?.[0];
  check(
    'ساختار روش ارسال کامل است (id/name/costToman/etaDays/enabled)',
    !!firstMethod &&
      typeof firstMethod.id === 'string' &&
      typeof firstMethod.name === 'string' &&
      typeof firstMethod.costToman === 'number' &&
      typeof firstMethod.etaDays === 'string' &&
      typeof firstMethod.enabled === 'boolean'
  );
  check(
    'روش‌های غیرفعال هم در لیست عمومی می‌آیند (برای شفافیت کلاینت)',
    Array.isArray(methods) && methods.some((m) => m.enabled === false)
  );
  check(
    'پرچم‌های درگاه با پیش‌فرض امن برگشت (هر دو فعال + SANDBOX)',
    pubData?.onlineGatewayEnabled === true &&
      pubData?.codEnabled === true &&
      pubData?.gatewayProvider === 'SANDBOX'
  );
  check(
    'مرچنت کد درگاه هرگز در پاسخ عمومی نیست (بند امنیتی)',
    !('gatewayMerchantId' in (pubData ?? {}))
  );

  // ——— ۲) پنل: خواندن و نوشتن تنظیمات ———
  console.log('\n۲) پنل — GET/PUT /api/admin/settings:');
  const adminToken = await otpLogin(ADMIN_PHONE);
  check('ورود مدیر', !!adminToken);
  if (!adminToken) {
    finish();
    return;
  }
  const adminHeaders = { 'x-pars-session': adminToken, 'Content-Type': 'application/json' };

  const adm = await getJson('/api/admin/settings', { 'x-pars-session': adminToken });
  const admData = (adm.json as { ok: boolean; data?: SettingsResp } | undefined)?.data;
  const admKeys = (admData?.settings ?? []).map((s) => s.key);
  check('GET /api/admin/settings → 200', adm.status === 200 && !!admData);
  const REQUIRED_KEYS = [
    'freeShippingThresholdToman',
    'deliveryFeeToman',
    'minOrderToman',
    'storeOpen',
    'supportPhone',
    'shippingMethods',
    'shippingNote',
    'onlineGatewayEnabled',
    'codEnabled',
    'gatewayProvider',
    'gatewayMerchantId',
  ];
  check(
    'همه ۱۱ کلید whitelist در پنل هست',
    REQUIRED_KEYS.every((k) => admKeys.includes(k)),
    `missing=${REQUIRED_KEYS.filter((k) => !admKeys.includes(k)).join(',')}`
  );

  // مقادیر اصلی برای بازگردانی در پایان
  const original: Record<string, string> = {};
  for (const s of admData?.settings ?? []) original[s.key] = s.value;

  // PUT معتبر — روش ارسال با هزینه متفاوت + توضیح وضعیت ارسال
  const testMethods: ShipMethod[] = [
    { id: 'pishtaz', name: 'پست پیشتاز', costToman: 49000, etaDays: '۲ تا ۴ روز کاری', enabled: true },
    { id: 'sepordeh', name: 'پست سفارشی', costToman: 39000, etaDays: '۳ تا ۷ روز کاری', enabled: true },
    { id: 'tipax', name: 'تیپاکس / چاپار', costToman: 89000, etaDays: '۱ تا ۳ روز کاری', enabled: false },
  ];
  const putOk = await putJson(
    '/api/admin/settings',
    {
      values: {
        ...original,
        shippingMethods: JSON.stringify(testMethods),
        shippingNote: 'تست وضعیت ارسال — سفارش تا ساعت ۱۴ به پست تحویل می‌شود',
      },
    },
    adminHeaders
  );
  check('PUT معتبر (روش‌های ارسال + توضیح) → 200', putOk.status === 200 && putOk.body.ok === true);

  const pubAfter = await getJson('/api/settings');
  const pubAfterData = (pubAfter.json as { data?: Record<string, unknown> } | undefined)?.data;
  check(
    'تغییرات پنل بلافاصله در تنظیمات عمومی دیده می‌شود',
    (pubAfterData?.shippingNote as string | undefined) ===
      'تست وضعیت ارسال — سفارش تا ساعت ۱۴ به پست تحویل می‌شود'
  );

  // PUT نامعتبر — JSON خراب
  const putBadJson = await putJson(
    '/api/admin/settings',
    { values: { ...original, shippingMethods: '{not-json' } },
    adminHeaders
  );
  check('PUT روش‌های ارسال با JSON نامعتبر → 400', putBadJson.status === 400);

  // PUT نامعتبر — شناسه تکراری
  const putDup = await putJson(
    '/api/admin/settings',
    {
      values: {
        ...original,
        shippingMethods: JSON.stringify([
          testMethods[0],
          { ...testMethods[1], id: 'pishtaz' },
        ]),
      },
    },
    adminHeaders
  );
  check('PUT روش‌های ارسال با شناسه تکراری → 400', putDup.status === 400);

  // PUT نامعتبر — درگاه ناشناخته
  const putBadGateway = await putJson(
    '/api/admin/settings',
    { values: { ...original, gatewayProvider: 'STRIPE' } },
    adminHeaders
  );
  check('PUT درگاه ناشناخته → 400', putBadGateway.status === 400);

  // PUT نامعتبر — کلید خارج از whitelist
  const putBadKey = await putJson(
    '/api/admin/settings',
    { values: { ...original, gatewaySecretKey: 'hack' } },
    adminHeaders
  );
  check('PUT کلید ناشناخته (تلاش تزریق مرچنت/سکرت) → 400', putBadKey.status === 400);

  // ——— ۳) ثبت سفارش با روش ارسال ———
  console.log('\n۳) ثبت سفارش با روش ارسال پستی:');
  const prodRes = await getJson('/api/products?page=1&pageSize=1');
  const prodData = (
    prodRes.json as {
      data?: { items: { id: string; variants: { id: string; priceToman: number }[] }[] };
    } | undefined
  )?.data;
  const product = prodData?.items[0];
  const variant = product?.variants[0];
  check('محصول و واریانت برای تست پیدا شد', !!product && !!variant);

  const userPhone = `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const userToken = await otpLogin(userPhone);
  check('ورود کاربر تست', !!userToken);
  if (!product || !variant || !userToken) {
    await restore(original, adminHeaders);
    finish();
    return;
  }
  const userHeaders = { 'x-pars-session': userToken, 'Content-Type': 'application/json' };

  const minOrder = Number(original.minOrderToman || '300000');
  const qty = Math.max(1, Math.ceil(minOrder / Math.max(variant.priceToman, 1)));

  const addRes = await postJson(
    '/api/cart/items',
    { productId: product.id, variantId: variant.id, quantity: qty },
    userHeaders
  );
  check('کالا به سبد اضافه شد', addRes.status === 200 && addRes.body.ok === true);

  // ثبت با روش «پست سفارشی» (هزینه ۳۹٬۰۰۰ ≠ پایه ۴۹٬۰۰۰)
  const sepordhe = testMethods[1];
  const orderRes = await postJson(
    '/api/orders',
    {
      address: ADDRESS,
      paymentMethod: 'COD',
      shippingMethodId: sepordhe.id,
    },
    userHeaders
  );
  const orderCode = (orderRes.body.data?.code as string | undefined) ?? null;
  check(
    'POST /api/orders با روش ارسال → 200',
    orderRes.status === 200 && !!orderCode,
    `status=${orderRes.status} err=${orderRes.body.error?.code ?? '-'}`
  );
  check(
    'هزینه ارسال = هزینه روش انتخابی (۳۹٬۰۰۰)',
    orderRes.body.data?.deliveryToman === sepordhe.costToman,
    `got=${JSON.stringify(orderRes.body.data?.deliveryToman)}`
  );

  // جزئیات سفارش — Snapshot روش ارسال
  if (orderCode) {
    const detail = await getJson(`/api/orders/${orderCode}`, { 'x-pars-session': userToken });
    const detailData = (detail.json as { data?: Record<string, unknown> } | undefined)?.data;
    check(
      'Snapshot نام روش ارسال در جزئیات سفارش',
      detailData?.shippingMethodName === sepordhe.name,
      `got=${JSON.stringify(detailData?.shippingMethodName)}`
    );
    check(
      'Snapshot زمان تحویل روش ارسال',
      detailData?.shippingMethodEta === sepordhe.etaDays
    );
    check(
      'فیلد وضعیت برای خط زمان مشتری موجود است',
      typeof detailData?.status === 'string'
    );
  }

  // ——— ۴) فال‌بک روش نامعتبر ———
  console.log('\n۴) روش ارسال نامعتبر → فال‌بک به هزینه پایه:');
  const add2 = await postJson(
    '/api/cart/items',
    { productId: product.id, variantId: variant.id, quantity: qty },
    userHeaders
  );
  check('سبد دوباره پر شد', add2.status === 200 && add2.body.ok === true);

  const order2 = await postJson(
    '/api/orders',
    {
      address: ADDRESS,
      paymentMethod: 'COD',
      shippingMethodId: 'nope-method',
    },
    userHeaders
  );
  check(
    'روش نامعتبر → سفارش ثبت می‌شود (فال‌بک بی‌صدا)',
    order2.status === 200 && order2.body.ok === true
  );
  check(
    'هزینه ارسال = هزینه پایه (۴۹٬۰۰۰)',
    order2.body.data?.deliveryToman === Number(original.deliveryFeeToman || '49000'),
    `got=${JSON.stringify(order2.body.data?.deliveryToman)}`
  );

  // بدون روش هم مثل قبل — رفتار فازهای قبل حفظ شود
  const add3 = await postJson(
    '/api/cart/items',
    { productId: product.id, variantId: variant.id, quantity: qty },
    userHeaders
  );
  const order3 = await postJson(
    '/api/orders',
    { address: ADDRESS, paymentMethod: 'COD' },
    userHeaders
  );
  check(
    'سفارش بدون shippingMethodId مثل قبل کار می‌کند (هزینه پایه)',
    order3.status === 200 && order3.body.data?.deliveryToman === Number(original.deliveryFeeToman || '49000')
  );

  // ——— ۵) درگاه غیرفعال ———
  console.log('\n۵) خاموش‌کردن پرداخت در محل از پنل:');
  const disableCod = await putJson(
    '/api/admin/settings',
    { values: { ...original, codEnabled: 'false' } },
    adminHeaders
  );
  check('PUT codEnabled=false → 200', disableCod.status === 200);

  const add4 = await postJson(
    '/api/cart/items',
    { productId: product.id, variantId: variant.id, quantity: qty },
    userHeaders
  );
  const order4 = await postJson(
    '/api/orders',
    { address: ADDRESS, paymentMethod: 'COD', shippingMethodId: sepordhe.id },
    userHeaders
  );
  check(
    'سفارش COD با درگاه خاموش → 400 PAYMENT_DISABLED',
    order4.status === 400 && order4.body.error?.code === 'PAYMENT_DISABLED',
    `status=${order4.status} err=${order4.body.error?.code ?? '-'}`
  );

  const order5 = await postJson(
    '/api/orders',
    { address: ADDRESS, paymentMethod: 'ONLINE_GATEWAY', shippingMethodId: sepordhe.id },
    userHeaders
  );
  check(
    'پرداخت آنلاین همچنان باز است → 200',
    order5.status === 200 && order5.body.ok === true
  );

  // ——— ۶) فروشگاه بسته ———
  console.log('\n۶) بستن فروشگاه (storeOpen=false):');
  const closeStore = await putJson(
    '/api/admin/settings',
    { values: { ...original, storeOpen: 'false' } },
    adminHeaders
  );
  check('PUT storeOpen=false → 200', closeStore.status === 200);

  const add5 = await postJson(
    '/api/cart/items',
    { productId: product.id, variantId: variant.id, quantity: qty },
    userHeaders
  );
  const order6 = await postJson(
    '/api/orders',
    { address: ADDRESS, paymentMethod: 'ONLINE_GATEWAY', shippingMethodId: sepordhe.id },
    userHeaders
  );
  check(
    'ثبت سفارش هنگام بسته‌بودن فروشگاه → 400 STORE_CLOSED',
    order6.status === 400 && order6.body.error?.code === 'STORE_CLOSED',
    `status=${order6.status} err=${order6.body.error?.code ?? '-'}`
  );

  // ——— ۷) بازگردانی تنظیمات اصلی ———
  console.log('\n۷) بازگردانی تنظیمات اصلی (idempotent):');
  await restore(original, adminHeaders);
  const pubFinal = await getJson('/api/settings');
  const pubFinalData = (pubFinal.json as { data?: Record<string, unknown> } | undefined)?.data;
  check(
    'مقادیر اصلی تنظیمات برگشت (storeOpen=true، codEnabled=true)',
    pubFinalData?.storeOpen === true && pubFinalData?.codEnabled === true
  );

  finish();
}

async function restore(original: Record<string, string>, headers: Record<string, string>) {
  await putJson('/api/admin/settings', { values: original }, headers);
}

function finish() {
  console.log('');
  if (failures.length === 0) {
    console.log(`🎉 همه ${pass} بررسی فاز ۱۵ سبز بود`);
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
