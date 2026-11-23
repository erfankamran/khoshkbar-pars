/**
 * تست رگرسیون کدهای تخفیف + نظرات (فاز ۱۱.۴)
 *
 * پوشش:
 *  ۱) امنیت: بدون نشست ۴۰۱ / کاربر عادی ۴۰۳ روی هر دو گروه endpoint ادمین
 *  ۲) CRUD کد تخفیف ادمین: ایجاد درصدی/ثابت، کد تکراری ۴۰۹، درصد نامعتبر ۴۰۰،
 *     ویرایش، غیرفعال‌سازی، حذف استفاده‌شده ۴۰۹، حذف استفاده‌نشده ۲۰۰
 *  ۳) اعتبارسنجی کد مشتری: کد ناموجود ۴۰۴، غیرفعال ۴۰۹، حداقل سبد ۴۰۰
 *  ۴) ثبت سفارش با کد: مبلغ تخفیف و نهایی درست + usedCount +۱ (تراکنش گارددار)
 *  ۵) سقف استفاده: سفارش تا پر شدن ظرفیت؛ بعدش ۴۰۹ CODE_USAGE_LIMIT
 *  ۶) لغو سفارش با کد → usedCount −۱ و بازگشت موجودی
 *  ۷) نظر: بدون سفارش تحویل‌شده ۴۰۳ → سفارش تا تحویل → ثبت نظر موفق (در انتظار)
 *     → تکرار ۴۰۹ → در لیست عمومی نیست → تأیید ادمین → در لیست عمومی + آمار
 *     امتیاز محصول +۱ → رد → حذف از عمومی + آمار −۱ → حذف کامل
 *  ۸) حسابرسی: ADMIN_ACTION برای DISCOUNT_* و REVIEW_*
 *
 * اجرا: bun scripts/admin-discount-review-tests.ts [baseUrl]
 */

import { PrismaClient } from '@prisma/client';
import { mintOtp } from './otp-fallback';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const db = new PrismaClient();

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

// ------------------------------------------------------------
// هلپرها
// ------------------------------------------------------------

interface JsonResp<T> {
  status: number;
  body: T;
}

async function req<T = unknown>(
  method: string,
  path: string,
  session: string | null,
  json?: unknown
): Promise<JsonResp<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { 'x-pars-session': session } : {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

interface OkEnvelope<D> {
  ok: boolean;
  data?: D;
  error?: { code: string; message: string };
}

/** ورود OTP — کد مستقیم در DB ضرب می‌شود (سازگار با production که devCode برنمی‌گرداند) */
async function login(phone: string): Promise<string | null> {
  const code = await mintOtp(phone);
  const verify = await req<OkEnvelope<{ sessionToken?: string }>>('POST', '/api/auth/otp/verify', null, {
    phone,
    code,
  });
  return verify.body.data?.sessionToken ?? null;
}

async function adminLogin(phones: string[]): Promise<string | null> {
  for (const phone of phones) {
    const token = await login(phone);
    if (token) return token;
    console.log(`  ↺ شماره ${phone} محدودیت OTP — شماره بعدی`);
  }
  return null;
}

const ADDRESS = {
  receiverName: 'سارا محمدی',
  receiverPhone: '09121110000',
  province: 'تهران',
  city: 'تهران',
  postalCode: '1234567890',
  fullAddress: 'خیابان ولیعصر، کوچه بهار، پلاک ۱۲، واحد ۳',
};

interface VariantInfo {
  variantId: string;
  productId: string;
  slug: string;
  stock: number;
}

async function pickVariant(): Promise<VariantInfo> {
  const res = await fetch(`${BASE}/api/products?page=1&pageSize=1`);
  const body = (await res.json()) as {
    data: { items: { id: string; slug: string; variants: { id: string; stock: number }[] }[] };
  };
  const p = body.data.items[0];
  return { productId: p.id, variantId: p.variants[0].id, slug: p.slug, stock: p.variants[0].stock };
}

async function variantStock(slug: string): Promise<number> {
  const res = await fetch(`${BASE}/api/products/${slug}`);
  const body = (await res.json()) as {
    data?: { product?: { variants: { stock: number }[] } };
  };
  return body.data?.product?.variants[0]?.stock ?? -1;
}

async function createOrder(
  session: string,
  variant: VariantInfo,
  quantity: number,
  discountCode?: string
): Promise<OkEnvelope<{ code: string; totalToman: number; discountToman: number }>> {
  await req('POST', '/api/cart/items', session, {
    productId: variant.productId,
    variantId: variant.variantId,
    quantity,
  });
  const res = await req<OkEnvelope<{ code: string; totalToman: number; discountToman: number }>>(
    'POST',
    '/api/orders',
    session,
    {
      address: ADDRESS,
      paymentMethod: 'COD',
      ...(discountCode ? { discountCode } : {}),
    }
  );
  return res;
}

/** گذار کامل تا تحویل — برای سناریوی خریدار تأییدشده */
async function deliverOrder(A: string, orderId: string): Promise<boolean> {
  const steps = [
    { action: 'MARK_PAID' },
    { action: 'START_PROCESSING' },
  ] as const;
  for (const body of steps) {
    const r = await req('PATCH', `/api/admin/orders/${orderId}`, A, body);
    if (r.status !== 200) return false;
  }
  const ship = await req('PATCH', `/api/admin/orders/${orderId}`, A, {
    action: 'SHIP',
    trackingCode: 'PARS-TRK-777777',
  });
  if (ship.status !== 200) return false;
  const deliver = await req('PATCH', `/api/admin/orders/${orderId}`, A, { action: 'DELIVER' });
  return deliver.status === 200;
}

/** ثبت سفارش از سبد فعلی — بدون افزودن اقلام جدید */
async function orderFromCurrentCart(
  session: string,
  discountCode?: string
): Promise<OkEnvelope<{ code: string; totalToman: number; discountToman: number }>> {
  return req('POST', '/api/orders', session, {
    address: ADDRESS,
    paymentMethod: 'COD',
    ...(discountCode ? { discountCode } : {}),
  });
}

// ------------------------------------------------------------
// سناریو
// ------------------------------------------------------------

async function main() {
  console.log(`— تست رگرسیون کدهای تخفیف + نظرات (۱۱.۴) روی ${BASE} —\n`);

  // ——— ۰) راه‌اندازی ———
  console.log('۰) راه‌اندازی:');
  const ADMIN_PHONES = [
    '09121111111',
    '09120000000',
    '09124870897',
    '09128382145',
    '09126891602',
    '09126844854',
  ];
  const A = await adminLogin(ADMIN_PHONES);
  check('ورود ادمین', !!A);
  if (!A) return finish();

  const customerPhone = `0913${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const C = await login(customerPhone);
  check('ورود مشتری تستی', !!C);
  if (!C) return finish();

  const variant = await pickVariant();
  check('انتخاب واریانت', !!variant.variantId);

  // پسوند یکتا برای هر اجرا — تست چندبار قابل اجراست (کد unique در دیتابیس است)
  const SUFFIX = Date.now().toString(36).slice(-6).toUpperCase();
  const CODE_PCT = `P11${SUFFIX}`; // کد درصدی اصلی
  const CODE_CAP = `CAP${SUFFIX}`; // سقف‌دار با limit=1
  const CODE_MIN = `MIN${SUFFIX}`; // حداقل سبد بالا
  const CODE_OFF = `OFF${SUFFIX}`; // غیرفعال

  // ——— ۱) گاردهای امنیتی ———
  console.log('\n۱) گاردهای امنیتی:');
  const noAuthDisc = await req('GET', '/api/admin/discounts', null);
  check('فهرست تخفیف بدون نشست → ۴۰۱', noAuthDisc.status === 401, `status=${noAuthDisc.status}`);
  const noAuthRev = await req('GET', '/api/admin/reviews', null);
  check('فهرست نظرات بدون نشست → ۴۰۱', noAuthRev.status === 401, `status=${noAuthRev.status}`);
  const custDisc = await req('GET', '/api/admin/discounts', C);
  check('کاربر عادی روی تخفیف → ۴۰۳', custDisc.status === 403, `status=${custDisc.status}`);
  const custRev = await req('GET', '/api/admin/reviews', C);
  check('کاربر عادی روی نظرات → ۴۰۳', custRev.status === 403, `status=${custRev.status}`);

  // ——— ۲) CRUD کد تخفیف ———
  console.log('\n۲) CRUD کد تخفیف:');
  const dup = await req<OkEnvelope<unknown>>('POST', '/api/admin/discounts', A, {
    code: CODE_PCT.toLowerCase(),
    type: 'PERCENT',
    value: 10,
  });
  check('ایجاد کد درصدی (نرمال‌سازی به بزرگ) → ۲۰۰', dup.status === 200, `status=${dup.status} ${JSON.stringify(dup.body)}`);
  const PARSELEVEN = (dup.body as { data?: { id: string; code: string } }).data;

  const dup2 = await req('POST', '/api/admin/discounts', A, {
    code: CODE_PCT,
    type: 'PERCENT',
    value: 20,
  });
  check('کد تکراری (حتی با حروف کوچک) → ۴۰۹ CODE_EXISTS', dup2.status === 409, `status=${dup2.status}`);

  const badPercent = await req('POST', '/api/admin/discounts', A, {
    code: `BAD${SUFFIX}`,
    type: 'PERCENT',
    value: 150,
  });
  check('درصد ۱۵۰ → ۴۰۰', badPercent.status === 400, `status=${badPercent.status}`);

  // کد سقف‌دار برای تست سقف درصدی
  const capped = await req<OkEnvelope<{ id: string; code: string }>>('POST', '/api/admin/discounts', A, {
    code: CODE_CAP,
    type: 'PERCENT',
    value: 50,
    maxDiscountToman: 200000,
    usageLimit: 1,
  });
  check('ایجاد کد سقف‌دار → ۲۰۰', capped.status === 200, `status=${capped.status}`);
  const cappedId = capped.body.data?.id ?? '';

  // کد با حداقل سبد بالا (غیرقابل استفاده برای سبد کوچک)
  const minHigh = await req<OkEnvelope<{ id: string }>>('POST', '/api/admin/discounts', A, {
    code: CODE_MIN,
    type: 'FIXED',
    value: 100000,
    minSubtotalToman: 100000000,
  });
  check('ایجاد کد با حداقل سبد بسیار بالا → ۲۰۰', minHigh.status === 200);
  const minHighId = minHigh.body.data?.id ?? '';

  const inactive = await req<OkEnvelope<{ id: string }>>('POST', '/api/admin/discounts', A, {
    code: CODE_OFF,
    type: 'FIXED',
    value: 50000,
    isActive: false,
  });
  check('ایجاد کد غیرفعال → ۲۰۰', inactive.status === 200);
  const inactiveId = inactive.body.data?.id ?? '';

  const edit = await req<OkEnvelope<{ value: number; code: string }>>(
    'PATCH',
    `/api/admin/discounts/${PARSELEVEN?.id ?? ''}`,
    A,
    { value: 15 }
  );
  check('ویرایش مقدار ۱۰→۱۵ → ۲۰۰', edit.status === 200 && edit.body.data?.value === 15);

  const list = await req<OkEnvelope<{ items: { code: string }[]; total: number }>>(
    'GET',
    '/api/admin/discounts?q=' + CODE_PCT,
    A
  );
  check('جستجوی کد در فهرست ادمین', list.body.data?.items.length === 1);
  const inactList = await req<OkEnvelope<{ items: { code: string }[] }>>(
    'GET',
    '/api/admin/discounts?status=inactive',
    A
  );
  check(
    'فیلتر غیرفعال شامل کد غیرفعال است',
    inactList.body.data?.items.some((i) => i.code === CODE_OFF) === true
  );

  // ——— ۳) اعتبارسنجی کد مشتری ———
  console.log('\n۳) اعتبارسنجی کد مشتری:');
  const noAuthValidate = await req('POST', '/api/discounts/validate', null, { code: CODE_PCT });
  check('validate بدون نشست → ۴۰۱', noAuthValidate.status === 401, `status=${noAuthValidate.status}`);

  const emptyCart = await req('POST', '/api/discounts/validate', C, { code: CODE_PCT });
  check('validate با سبد خالی → ۴۰۰ CART_EMPTY', emptyCart.status === 400, `status=${emptyCart.status}`);

  // سبد: ۲×۶۳۰,۰۰۰ = ۱,۲۶۰,۰۰۰
  const addCart = await req('POST', '/api/cart/items', C, {
    productId: variant.productId,
    variantId: variant.variantId,
    quantity: 2,
  });
  check('سبد آزمایشی پر شد', addCart.status === 200);

  const badCode = await req('POST', '/api/discounts/validate', C, { code: 'NOPE999' });
  check('کد ناموجود → ۴۰۴ INVALID_CODE', badCode.status === 404, `status=${badCode.status}`);

  const inactiveUse = await req('POST', '/api/discounts/validate', C, { code: CODE_OFF });
  check('کد غیرفعال → ۴۰۹ CODE_INACTIVE', inactiveUse.status === 409, `status=${inactiveUse.status}`);

  const minFail = await req('POST', '/api/discounts/validate', C, { code: CODE_MIN });
  check('حداقل سبد رعایت‌نشده → ۴۰۰ MIN_SUBTOTAL', minFail.status === 400, `status=${minFail.status}`);

  const valid15 = await req<OkEnvelope<{ code: string; discountToman: number; description: string }>>(
    'POST',
    '/api/discounts/validate',
    C,
    { code: CODE_PCT.toLowerCase() }
  );
  check(
    'کد ۱۵٪ روی سبد ۱,۲۶۰,۰۰۰ → ۱۸۹,۰۰۰ تخفیف',
    valid15.status === 200 && valid15.body.data?.discountToman === 189000,
    JSON.stringify(valid15.body.data ?? valid15.body)
  );

  const capApplied = await req<OkEnvelope<{ discountToman: number }>>(
    'POST',
    '/api/discounts/validate',
    C,
    { code: CODE_CAP }
  );
  check(
    'سقف تخفیف: ۵۰٪ از ۱,۲۶۰,۰۰۰ → ۶۳۰,۰۰۰ ولی سقف ۲۰۰,۰۰۰',
    capApplied.body.data?.discountToman === 200000,
    JSON.stringify(capApplied.body.data ?? capApplied.body)
  );

  // ——— ۴) ثبت سفارش با کد ———
  console.log('\n۴) ثبت سفارش با کد تخفیف:');
  // سبد همان ۲ قلم validate است — سفارش از همان سبد ثبت می‌شود
  const withCode = await orderFromCurrentCart(C, CODE_PCT.toLowerCase());
  check(
    'سفارش با کد ۱۵٪ ثبت شد — discountToman درست',
    withCode.status === 200 && withCode.body.data?.discountToman === 189000,
    JSON.stringify(withCode.body.data ?? withCode.body)
  );
  const orderCode = withCode.body.data?.code ?? '';

  // شمارش مصرف — باید ۱ شده باشد
  const PARSELEVEN_ID = PARSELEVEN?.id ?? '';
  const usedAfter = await db.discountCode.findUnique({
    where: { id: PARSELEVEN_ID },
    select: { usedCount: true },
  });
  check('usedCount کد → ۱', usedAfter?.usedCount === 1, `usedCount=${usedAfter?.usedCount}`);

  const searchRes = await req<OkEnvelope<{ items: { id: string }[] }>>(
    'GET',
    `/api/admin/orders?q=${orderCode}`,
    A
  );
  const orderId = searchRes.body.data?.items[0]?.id ?? '';
  check('سفارش کددار در فهرست ادمین', !!orderId);

  // ——— ۵) سقف استفاده CAP50 (limit=1) ———
  console.log('\n۵) سقف استفاده از کد:');
  const phone2 = `0913${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const C2 = await login(phone2);
  check('مشتری دوم', !!C2);
  if (!C2) return finish();

  const order2 = await createOrder(C2, variant, 1, CODE_CAP);
  check(
    'سفارش دوم با کد سقف‌دار (آخرین ظرفیت) موفق',
    order2.status === 200 && order2.body.data?.discountToman === 200000,
    JSON.stringify(order2.body.data ?? order2.body)
  );

  const C3phone = `0913${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const C3 = await login(C3phone);
  if (!C3) return finish();
  await req('POST', '/api/cart/items', C3, {
    productId: variant.productId,
    variantId: variant.variantId,
    quantity: 1,
  });
  const overLimit = await req('POST', '/api/orders', C3, {
    address: ADDRESS,
    paymentMethod: 'COD',
    discountCode: CODE_CAP,
  });
  check(
    'سفارش سوم با کدِ پرشده → ۴۰۹ CODE_USAGE_LIMIT',
    overLimit.status === 409,
    `status=${overLimit.status} ${JSON.stringify((overLimit.body as { error?: { code: string } }).error?.code ?? '-')}`
  );

  // ——— ۶) لغو سفارش کددار → بازگشت ظرفیت ———
  console.log('\n۶) لغو سفارش با کد تخفیف:');
  const searchRes2 = await req<OkEnvelope<{ items: { id: string }[] }>>(
    'GET',
    `/api/admin/orders?q=${order2.body.data?.code ?? ''}`,
    A
  );
  const order2Id = searchRes2.body.data?.items[0]?.id ?? '';
  const cancelRes = await req('PATCH', `/api/admin/orders/${order2Id}`, A, { action: 'CANCEL' });
  check('لغو سفارش دوم → ۲۰۰', cancelRes.status === 200, `status=${cancelRes.status}`);
  const usedAfterCancel = await db.discountCode.findUnique({
    where: { id: cappedId },
    select: { usedCount: true },
  });
  check('ظرفیت کد سقف‌دار پس از لغو آزاد شد (usedCount → ۰)', usedAfterCancel?.usedCount === 0, `usedCount=${usedAfterCancel?.usedCount}`);

  // ——— ۷) حذف کدها ———
  console.log('\n۷) حذف کد تخفیف:');
  const delUsed = await req('DELETE', `/api/admin/discounts/${PARSELEVEN_ID}`, A);
  check('حذف کد استفاده‌شده → ۴۰۹ HAS_REFERENCES', delUsed.status === 409, `status=${delUsed.status}`);
  const delUnused = await req('DELETE', `/api/admin/discounts/${minHighId}`, A);
  check('حذف کد استفاده‌نشده → ۲۰۰', delUnused.status === 200, `status=${delUnused.status}`);
  const delInactive = await req('DELETE', `/api/admin/discounts/${inactiveId}`, A);
  check('حذف کد غیرفعال → ۲۰۰', delInactive.status === 200);

  // ——— ۸) نظرات ———
  console.log('\n۸) نظرات (فقط خریدار تحویل‌شده):');
  const ratingBeforeRow = await db.product.findUnique({
    where: { id: variant.productId },
    select: { ratingSum: true, ratingCount: true },
  });
  const ratingSumBefore = ratingBeforeRow?.ratingSum ?? 0;
  const ratingCountBefore = ratingBeforeRow?.ratingCount ?? 0;

  const reviewNoOrder = await req('POST', `/api/products/${variant.slug}/reviews`, C3, {
    rating: 5,
    comment: 'تست بدون خرید',
  });
  check(
    'ثبت نظر بدون سفارش تحویل‌شده → ۴۰۳ VERIFIED_BUYERS_ONLY',
    reviewNoOrder.status === 403,
    `status=${reviewNoOrder.status}`
  );

  // مشتری اول: سفارش کددارش هنوز PENDING است → تحویلش می‌کنیم (خریدار تأییدشده)
  const delivered = await deliverOrder(A, orderId);
  check('سفارش اول تا تحویل رفت', delivered);

  const submit = await req<OkEnvelope<{ id: string; status: string; message: string }>>(
    'POST',
    `/api/products/${variant.slug}/reviews`,
    C,
    { rating: 4, comment: 'کیفیت عالی بود، بسته‌بندی هم خوب. تست ۱۱.۴' }
  );
  check(
    'ثبت نظر توسط خریدار تحویل‌شده → در انتظار تأیید',
    submit.status === 200 && submit.body.data?.status === 'PENDING_APPROVAL',
    `status=${submit.status} ${JSON.stringify(submit.body)}`
  );
  const reviewId = submit.body.data?.id ?? '';

  const submitDup = await req('POST', `/api/products/${variant.slug}/reviews`, C, {
    rating: 5,
    comment: 'تکراری',
  });
  check('نظر تکراری → ۴۰۹ ALREADY_REVIEWED', submitDup.status === 409, `status=${submitDup.status}`);

  const ratingMid = await db.product.findUnique({
    where: { id: variant.productId },
    select: { ratingSum: true, ratingCount: true },
  });
  check(
    'آمار محصول قبل از تأیید تغییر نکرد',
    ratingMid?.ratingSum === ratingSumBefore && ratingMid?.ratingCount === ratingCountBefore
  );

  const publicBefore = await fetch(`${BASE}/api/products/${variant.slug}/reviews?limit=20`);
  const publicBody = (await publicBefore.json()) as { data?: { items: { id: string }[] } };
  check(
    'نظر در انتظار در لیست عمومی نیست',
    publicBody.data?.items.some((i) => i.id === reviewId) !== true
  );

  const approve = await req<OkEnvelope<{ isApproved: boolean }>>(
    'PATCH',
    `/api/admin/reviews/${reviewId}`,
    A,
    { action: 'APPROVE' }
  );
  check('تأیید ادمین → منتشرشده', approve.status === 200 && approve.body.data?.isApproved === true);

  const ratingAfter = await db.product.findUnique({
    where: { id: variant.productId },
    select: { ratingSum: true, ratingCount: true },
  });
  check(
    'آمار محصول پس از تأیید +۴/+۱ شد',
    ratingAfter?.ratingSum === ratingSumBefore + 4 && ratingAfter?.ratingCount === ratingCountBefore + 1,
    `sum=${ratingAfter?.ratingSum}(قبل=${ratingSumBefore}) count=${ratingAfter?.ratingCount}(قبل=${ratingCountBefore})`
  );

  const publicAfter = await fetch(`${BASE}/api/products/${variant.slug}/reviews?limit=20`);
  const publicAfterBody = (await publicAfter.json()) as { data?: { items: { id: string }[] } };
  check('نظر تأییدشده در لیست عمومی هست', publicAfterBody.data?.items.some((i) => i.id === reviewId) === true);

  const reject = await req('PATCH', `/api/admin/reviews/${reviewId}`, A, { action: 'REJECT' });
  check('رد نظر تأییدشده → پنهان', reject.status === 200 && reject.body.data?.isApproved === false);

  const ratingRejected = await db.product.findUnique({
    where: { id: variant.productId },
    select: { ratingSum: true, ratingCount: true },
  });
  check(
    'آمار محصول پس از رد به مقدار اولیه برگشت',
    ratingRejected?.ratingSum === ratingSumBefore && ratingRejected?.ratingCount === ratingCountBefore
  );

  const delReview = await req('DELETE', `/api/admin/reviews/${reviewId}`, A);
  check('حذف نظر → ۲۰۰', delReview.status === 200);

  const reviewAgain = await req('POST', `/api/products/${variant.slug}/reviews`, C, {
    rating: 5,
    comment: 'نظر جدید پس از حذف قبلی — تست',
  });
  check('پس از حذف، ثبت نظر دوباره ممکن است', reviewAgain.status === 200);
  const review2Id = (reviewAgain.body as { data?: { id: string } }).data?.id ?? '';

  const badRating = await req('POST', `/api/products/${variant.slug}/reviews`, C2, {
    rating: 9,
    comment: 'غیرمجاز',
  });
  check('امتیاز ۹ → ۴۰۰ VALIDATION', badRating.status === 400, `status=${badRating.status}`);

  // ——— ۹) حسابرسی ———
  console.log('\n۹) حسابرسی:');
  const discLogs = await db.securityLog.count({
    where: { event: 'ADMIN_ACTION', meta: { contains: 'DISCOUNT_' } },
  });
  check('اقدامات DISCOUNT_* در SecurityLog', discLogs >= 5, `count=${discLogs}`);
  const reviewLogs = await db.securityLog.count({
    where: { event: 'ADMIN_ACTION', meta: { contains: 'REVIEW_' } },
  });
  check('اقدامات REVIEW_* در SecurityLog', reviewLogs >= 3, `count=${reviewLogs}`);

  // ——— پاک‌سازی نظر تستی ———
  if (review2Id) await req('DELETE', `/api/admin/reviews/${review2Id}`, A);

  return finish();
}

async function finish(): Promise<never> {
  await db.$disconnect();
  console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
