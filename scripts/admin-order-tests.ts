/**
 * تست رگرسیون مدیریت سفارش‌ها (فاز ۱۱.۳)
 *
 * پوشش:
 *  ۱) امنیت: بدون نشست ۴۰۱، توکن جعلی ۴۰۱، کاربر عادی ۴۰۳ + SecurityLog(FORBIDDEN)
 *  ۲) ساخت سفارش واقعی از مسیر عمومی (سبد + POST /api/orders با COD)
 *  ۳) فهرست ادمین: جستجوی کد/تلفن، فیلتر وضعیت و پرداخت
 *  ۴) جزئیات ادمین: آیتم‌ها، مبالغ، آدرس + ۴۰۴ ناموجود
 *  ۵) گذار خوش‌مسیر: MARK_PAID → START_PROCESSING → SHIP (بدون کد رهگیری رد می‌شود)
 *     → UPDATE_TRACKING → DELIVER — و ۴۰۹ برای تکرار/گذارهای غیرمجاز
 *  ۶) قاعدهٔ کلیدی: CANCEL پس از SHIPPED/DELIVERED → ۴۰۹
 *  ۷) لغو با بازگردانی تراکنشی موجودی + REFUNDED پرداخت‌شده + UNPAID دست‌نخورده
 *  ۸) یادداشت داخلی + اعتبارسنجی ورودی (اکشن ناشناخته، کد رهگیری فارسی)
 *  ۹) حسابرسی: ORDER_* در SecurityLog (ADMIN_ACTION)
 *
 * اجرا: bun scripts/admin-order-tests.ts [baseUrl]
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
// هلپرهای HTTP — نشست با هدر x-pars-session (سرور کوکی ترجیح می‌دهد، هدر فال‌بک)
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
  const verify = await req<OkEnvelope<{ sessionToken?: string }>>(
    'POST',
    '/api/auth/otp/verify',
    null,
    { phone, code }
  );
  return verify.body.data?.sessionToken ?? null;
}

/**
 * ورود ادمین با فهرست شماره‌های پشتیبان — سقف ساعتی OTP (۵ کد) ممکن است
 * شماره اول را ببندد؛ در 429 شماره بعدی امتحان می‌شود
 */
async function adminLogin(phones: string[]): Promise<{ token: string; phone: string } | null> {
  for (const phone of phones) {
    const token = await login(phone);
    if (token) return { token, phone };
    console.log(`  ↺ شماره ${phone} در دسترس نبود (محدودیت OTP) — شماره بعدی`);
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
    data?: { product?: { variants: { id: string; stock: number }[] } };
  };
  const v = body.data?.product?.variants[0];
  if (!v) throw new Error('خواندن موجودی واریانت ناموفق بود');
  return v.stock;
}

interface OrderBrief {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  trackingCode: string | null;
  totalToman: number;
  itemCount: number;
}

/** پاسخ اکشن یادداشت — adminNote خروجی سرور */
interface OrderWithNote extends OrderBrief {
  adminNote: string | null;
}

async function createCodOrder(
  session: string,
  variant: VariantInfo,
  quantity: number
): Promise<{ code: string; totalToman: number } | null> {
  const add = await req<OkEnvelope<unknown>>('POST', '/api/cart/items', session, {
    productId: variant.productId,
    variantId: variant.variantId,
    quantity,
  });
  if (!add.body.ok) return null;
  const order = await req<OkEnvelope<{ code: string; totalToman: number }>>(
    'POST',
    '/api/orders',
    session,
    { address: ADDRESS, paymentMethod: 'COD' }
  );
  if (!order.body.ok || !order.body.data) return null;
  return order.body.data;
}

// ------------------------------------------------------------
// سناریو
// ------------------------------------------------------------

async function main() {
  console.log(`— تست رگرسیون مدیریت سفارش‌ها (۱۱.۳) روی ${BASE} —\n`);

  // ——— ۰) راه‌اندازی: ادمین + مشتری ———
  console.log('۰) راه‌اندازی:');
  const ADMIN_PHONES = [
    '09121111111',
    '09120000000',
    '09124870897',
    '09128382145',
    '09126891602',
    '09126844854',
  ];
  const admin = await adminLogin(ADMIN_PHONES);
  check('ورود ادمین (فهرست شماره‌های پشتیبان)', !!admin);
  if (!admin) return finish();

  const customerPhone = `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const customer = await login(customerPhone);
  check('ورود مشتری تستی', !!customer);
  if (!customer) return finish();

  const variant = await pickVariant();
  check('انتخاب واریانت از فروشگاه', !!variant.variantId, `stock=${variant.stock}`);

  const A = admin.token;
  const C = customer;

  // ——— ۱) گاردهای امنیتی ———
  console.log('\n۱) گاردهای امنیتی:');
  const noAuth = await req('GET', '/api/admin/orders', null);
  check('فهرست سفارش‌ها بدون نشست → ۴۰۱', noAuth.status === 401, `status=${noAuth.status}`);

  const fake = await req('GET', '/api/admin/orders', 'f'.repeat(64));
  check('توکن جعلی → ۴۰۱', fake.status === 401, `status=${fake.status}`);

  const customerRes = await req('GET', '/api/admin/orders', C);
  check('کاربر عادی → ۴۰۳', customerRes.status === 403, `status=${customerRes.status}`);

  const customerPatch = await req('PATCH', `/api/admin/orders/${'c'.repeat(25)}`, C, {
    action: 'CANCEL',
  });
  check('PATCH کاربر عادی → ۴۰۳ (IDOR)', customerPatch.status === 403, `status=${customerPatch.status}`);

  const forbiddenLog = await db.securityLog.findFirst({
    where: { event: 'FORBIDDEN', phone: customerPhone },
  });
  check('تلاش غیرمجاز در SecurityLog ثبت شد (FORBIDDEN)', !!forbiddenLog);

  // ——— ۲) ساخت سفارش‌های تستی از مسیر عمومی ———
  console.log('\n۲) ساخت سفارش‌های تستی:');
  const stockBefore = await variantStock(variant.slug);
  const order1 = await createCodOrder(C, variant, 2);
  check('سفارش ۱ (COD، تعداد ۲) ثبت شد', !!order1, JSON.stringify(order1));
  const order2 = await createCodOrder(C, variant, 1);
  check('سفارش ۲ (COD، تعداد ۱) ثبت شد', !!order2);
  const order3 = await createCodOrder(C, variant, 1);
  check('سفارش ۳ (COD، تعداد ۱) ثبت شد', !!order3);
  if (!order1 || !order2 || !order3) return finish();

  const stockAfterOrders = await variantStock(variant.slug);
  check(
    'موجودی پس از ۳ سفارش دقیقاً ۴ واحد کم شد (کاهش تراکنشی)',
    stockAfterOrders === stockBefore - 4,
    `قبل=${stockBefore} بعد=${stockAfterOrders}`
  );

  // شناسه سفارش‌ها از جستجوی ادمین
  const search = await req<OkEnvelope<{ items: OrderBrief[] }>>(
    'GET',
    `/api/admin/orders?q=${encodeURIComponent(order1.code)}`,
    A
  );
  check('جستجوی کد سفارش در فهرست ادمین', search.status === 200 && search.body.data?.items.length === 1);
  const order1Id = search.body.data?.items[0]?.id ?? '';

  const search2 = await req<OkEnvelope<{ items: OrderBrief[] }>>(
    'GET',
    `/api/admin/orders?q=${encodeURIComponent(order2.code)}`,
    A
  );
  const order2Id = search2.body.data?.items[0]?.id ?? '';
  const search3 = await req<OkEnvelope<{ items: OrderBrief[] }>>(
    'GET',
    `/api/admin/orders?q=${encodeURIComponent(order3.code)}`,
    A
  );
  const order3Id = search3.body.data?.items[0]?.id ?? '';
  check('هر سه سفارش در فهرست ادمین پیدا شدند', !!order1Id && !!order2Id && !!order3Id);

  // ——— ۳) فیلترهای فهرست ———
  console.log('\n۳) فیلترهای فهرست:');
  const byStatus = await req<OkEnvelope<{ items: OrderBrief[]; total: number }>>(
    'GET',
    '/api/admin/orders?status=PENDING_PAYMENT&limit=50',
    A
  );
  check(
    'فیلتر وضعیت PENDING_PAYMENT شامل سفارش تازه است',
    byStatus.body.data?.items.some((o) => o.id === order1Id) === true
  );
  const byPhone = await req<OkEnvelope<{ items: OrderBrief[] }>>(
    'GET',
    `/api/admin/orders?q=${customerPhone}`,
    A
  );
  check(
    'جستجو با شماره مشتری هر سه سفارش را می‌آورد',
    byPhone.body.data?.items.length === 3,
    `count=${byPhone.body.data?.items.length}`
  );
  const badFilter = await req('GET', '/api/admin/orders?status=HACKED', A);
  check('فیلتر نامعتبر → ۴۰۰ VALIDATION', badFilter.status === 400, `status=${badFilter.status}`);

  // ——— ۴) جزئیات ———
  console.log('\n۴) جزئیات سفارش:');
  const detail = await req<OkEnvelope<OrderBrief & {
    subtotalToman: number;
    deliveryToman: number;
    address: { receiverName: string };
    items: { productTitle: string; quantity: number; lineTotalToman: number }[];
    customer: { phone: string };
  }>>('GET', `/api/admin/orders/${order1Id}`, A);
  check('جزئیات سفارش ۲۰۰', detail.status === 200 && !!detail.body.data);
  check(
    'آیتم‌ها با Snapshot درست (تعداد ۲)',
    detail.body.data?.items.length === 1 && detail.body.data.items[0].quantity === 2
  );
  check(
    'مبلغ سفارش = جمع کالاها + هزینه ارسال',
    (detail.body.data?.subtotalToman ?? 0) + (detail.body.data?.deliveryToman ?? 0) ===
      order1.totalToman,
    `sub=${detail.body.data?.subtotalToman} del=${detail.body.data?.deliveryToman} total=${order1.totalToman}`
  );
  check(
    'آدرس Snapshot خوانده شد',
    detail.body.data?.address.receiverName === ADDRESS.receiverName
  );

  const missing = await req('GET', `/api/admin/orders/${'z'.repeat(25)}`, A);
  check('سفارش ناموجود → ۴۰۴', missing.status === 404, `status=${missing.status}`);
  const badId = await req('GET', '/api/admin/orders/not-a-cuid!', A);
  check('شناسه نامعتبر → ۴۰۰', badId.status === 400, `status=${badId.status}`);

  // ——— ۵) گذار خوش‌مسیر سفارش ۱ ———
  console.log('\n۵) گذار خوش‌مسیر (پرداخت → آماده‌سازی → ارسال → تحویل):');
  const paid = await req<OkEnvelope<OrderBrief>>('PATCH', `/api/admin/orders/${order1Id}`, A, {
    action: 'MARK_PAID',
  });
  check(
    'ثبت پرداخت دستی → PAID/PAID',
    paid.status === 200 && paid.body.data?.status === 'PAID' && paid.body.data?.paymentStatus === 'PAID'
  );

  const paidAgain = await req('PATCH', `/api/admin/orders/${order1Id}`, A, { action: 'MARK_PAID' });
  check('تکرار ثبت پرداخت → ۴۰۹', paidAgain.status === 409, `status=${paidAgain.status}`);

  const processing = await req<OkEnvelope<OrderBrief>>(
    'PATCH',
    `/api/admin/orders/${order1Id}`,
    A,
    { action: 'START_PROCESSING' }
  );
  check('شروع آماده‌سازی → PROCESSING', processing.body.data?.status === 'PROCESSING');

  const shipNoCode = await req('PATCH', `/api/admin/orders/${order1Id}`, A, { action: 'SHIP' });
  check('ارسال بدون کد رهگیری → ۴۰۰ VALIDATION', shipNoCode.status === 400, `status=${shipNoCode.status}`);

  const shipFaCode = await req('PATCH', `/api/admin/orders/${order1Id}`, A, {
    action: 'SHIP',
    trackingCode: 'کد رهگیری فارسی',
  });
  check('کد رهگیری غیرلاتین → ۴۰۰', shipFaCode.status === 400, `status=${shipFaCode.status}`);

  const shipped = await req<OkEnvelope<OrderBrief>>('PATCH', `/api/admin/orders/${order1Id}`, A, {
    action: 'SHIP',
    trackingCode: 'PARS-TRK-889900',
  });
  check(
    'ثبت ارسال → SHIPPED + کد رهگیری ذخیره شد',
    shipped.body.data?.status === 'SHIPPED' && shipped.body.data?.trackingCode === 'PARS-TRK-889900'
  );

  const cancelShipped = await req('PATCH', `/api/admin/orders/${order1Id}`, A, { action: 'CANCEL' });
  check('❗ لغو پس از ارسال → ۴۰۹ (قاعدهٔ کلیدی بند ۱۱.۳)', cancelShipped.status === 409, `status=${cancelShipped.status}`);

  const retack = await req<OkEnvelope<OrderBrief>>('PATCH', `/api/admin/orders/${order1Id}`, A, {
    action: 'UPDATE_TRACKING',
    trackingCode: 'PARS-TRK-000111',
  });
  check('ویرایش کد رهگیری روی ارسال‌شده → ۲۰۰', retack.body.data?.trackingCode === 'PARS-TRK-000111');

  const delivered = await req<OkEnvelope<OrderBrief>>('PATCH', `/api/admin/orders/${order1Id}`, A, {
    action: 'DELIVER',
  });
  check('ثبت تحویل → DELIVERED', delivered.body.data?.status === 'DELIVERED');

  const deliverAgain = await req('PATCH', `/api/admin/orders/${order1Id}`, A, { action: 'DELIVER' });
  check('تکرار تحویل → ۴۰۹', deliverAgain.status === 409, `status=${deliverAgain.status}`);

  const cancelDelivered = await req('PATCH', `/api/admin/orders/${order1Id}`, A, { action: 'CANCEL' });
  check('لغو پس از تحویل → ۴۰۹', cancelDelivered.status === 409, `status=${cancelDelivered.status}`);

  const retrackDelivered = await req('PATCH', `/api/admin/orders/${order1Id}`, A, {
    action: 'UPDATE_TRACKING',
    trackingCode: 'PARS-TRK-222333',
  });
  check('ویرایش کد رهگیری پس از تحویل → ۴۰۹', retrackDelivered.status === 409, `status=${retrackDelivered.status}`);

  const skipPaid = await req<OkEnvelope<OrderBrief>>(
    'PATCH',
    `/api/admin/orders/${order2Id}`,
    A,
    { action: 'START_PROCESSING' }
  );
  check('آماده‌سازی سفارشِ پرداخت‌نشده → ۴۰۹', skipPaid.status === 409, `status=${skipPaid.status}`);

  // ——— ۶) لغو پرداخت‌شده با بازگردانی موجودی ———
  console.log('\n۶) لغو سفارش پرداخت‌شده (بازگردانی تراکنشی موجودی):');
  const markPaid2 = await req<OkEnvelope<OrderBrief>>('PATCH', `/api/admin/orders/${order2Id}`, A, {
    action: 'MARK_PAID',
  });
  check('سفارش ۲ پرداخت شد', markPaid2.body.data?.paymentStatus === 'PAID');

  const stockBeforeCancel = await variantStock(variant.slug);
  const canceled = await req<OkEnvelope<OrderBrief>>('PATCH', `/api/admin/orders/${order2Id}`, A, {
    action: 'CANCEL',
    reason: 'انصراف مشتری',
  });
  check('لغو سفارش ۲ → CANCELED', canceled.body.data?.status === 'CANCELED');
  check(
    'پرداخت پرداخت‌شده → REFUNDED',
    canceled.body.data?.paymentStatus === 'REFUNDED'
  );

  const stockAfterCancel = await variantStock(variant.slug);
  check(
    'موجودی واریانت دقیقاً ۱ واحد برگشت',
    stockAfterCancel === stockBeforeCancel + 1,
    `قبل=${stockBeforeCancel} بعد=${stockAfterCancel}`
  );

  const canceledAgain = await req('PATCH', `/api/admin/orders/${order2Id}`, A, { action: 'CANCEL' });
  check('لغو مجدد سفارش لغوشده → ۴۰۹', canceledAgain.status === 409, `status=${canceledAgain.status}`);

  // ——— ۷) لغو پرداخت‌نشده + یادداشت داخلی ———
  console.log('\n۷) لغو پرداخت‌نشده و یادداشت داخلی:');
  const unpaidCancel = await req<OkEnvelope<OrderBrief>>('PATCH', `/api/admin/orders/${order3Id}`, A, {
    action: 'CANCEL',
  });
  check(
    'لغو مستقیم در انتظار پرداخت → CANCELED/UNPAID',
    unpaidCancel.body.data?.status === 'CANCELED' && unpaidCancel.body.data?.paymentStatus === 'UNPAID'
  );

  const stockAfterUnpaid = await variantStock(variant.slug);
  check(
    'موجودی = اولیه منهای ۲ واحد سفارش ۱ (ارسال‌شده که لغو نشد)',
    stockAfterUnpaid === stockBefore - 2,
    `اولیه=${stockBefore} الان=${stockAfterUnpaid}`
  );

  const note = await req<OkEnvelope<OrderWithNote>>('PATCH', `/api/admin/orders/${order3Id}`, A, {
    action: 'SET_ADMIN_NOTE',
    adminNote: 'برای بازگشت وجه پیگیری شود',
  });
  check(
    'یادداشت داخلی روی سفارش لغوشده ذخیره شد',
    note.body.data?.adminNote === 'برای بازگشت وجه پیگیری شود'
  );

  const noteCleared = await req<OkEnvelope<OrderWithNote>>(
    'PATCH',
    `/api/admin/orders/${order3Id}`,
    A,
    {
      action: 'SET_ADMIN_NOTE',
      adminNote: '',
    }
  );
  check('یادداشت خالی = پاک کردن', noteCleared.body.data?.adminNote === null);

  // ——— ۸) اعتبارسنجی ورودی ———
  console.log('\n۸) اعتبارسنجی ورودی:');
  const unknownAction = await req('PATCH', `/api/admin/orders/${order1Id}`, A, { action: 'HACK' });
  check('اکشن ناشناخته → ۴۰۰', unknownAction.status === 400, `status=${unknownAction.status}`);

  const longCode = await req('PATCH', `/api/admin/orders/${order1Id}`, A, {
    action: 'UPDATE_TRACKING',
    trackingCode: 'A'.repeat(41),
  });
  check('کد رهگیری بلندتر از ۴۰ → ۴۰۰', longCode.status === 400, `status=${longCode.status}`);

  const longNote = await req('PATCH', `/api/admin/orders/${order1Id}`, A, {
    action: 'SET_ADMIN_NOTE',
    adminNote: 'ت'.repeat(1001),
  });
  check('یادداشت بلندتر از ۱۰۰۰ → ۴۰۰', longNote.status === 400, `status=${longNote.status}`);

  // ——— ۹) حسابرسی ———
  console.log('\n۹) حسابرسی:');
  const adminActionCount = await db.securityLog.count({
    where: { event: 'ADMIN_ACTION', meta: { contains: order1Id } },
  });
  check(
    'هر ۵ گذار سفارش ۱ در SecurityLog ثبت شد (ADMIN_ACTION)',
    adminActionCount === 5,
    `count=${adminActionCount}`
  );
  const cancelLog = await db.securityLog.findFirst({
    where: {
      event: 'ADMIN_ACTION',
      meta: { contains: order2Id },
    },
    orderBy: { createdAt: 'desc' },
  });
  check(
    'لغو با دلیل در حسابرسی ثبت شد (ORDER_CANCEL + reason)',
    !!cancelLog && (cancelLog.meta ?? '').includes('انصراف مشتری')
  );

  return finish();
}

async function finish(): Promise<never> {
  await db.$disconnect();
  console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
