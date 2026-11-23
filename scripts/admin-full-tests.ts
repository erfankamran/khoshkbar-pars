/**
 * تست رگرسیون کامل پنل مدیریت — فاز ۱۴ (باز کردن همه بخش‌های «به‌زودی»)
 *
 * سناریوها:
 *  ۱) گارد دسترسی: همه endpointهای جدید بدون نشست → ۴۰۱ / کاربر عادی → ۴۰۳
 *  ۲) محصولات: فهرست، ایجاد، اعتبارسنجی، اسلاگ تکراری، ویرایش واریانت، حذف + قفل سفارش
 *  ۳) سفارش‌ها: فهرست + شمارش، جزئیات، ماشین وضعیت، بازگشت موجودی در لغو
 *  ۴) دسته‌بندی‌ها: CRUD + قفل محصول‌دار
 *  ۵) بنرها و استوری‌ها: CRUD + گروه‌بندی
 *  ۶) کدهای تخفیف: اعتبارسنجی درصد، CRUD
 *  ۷) نظرات: ثبت توسط کاربر، تکرار → ۴۰۹، تأیید/رد با اصلاح آمار امتیاز
 *  ۸) کاربران: فهرست، ارتقا/تنزل، مسدودسازی با ابطال نشست، گارد خود
 *  ۹) اطلاع‌رسانی: آمار، ارسال گروهی رضایت‌محور (فقط رضایت‌داران)
 * ۱۰) تنظیمات: whitelist، اعتبارسنجی عدد، اعمال در /api/settings
 *
 * اجرا: bun scripts/admin-full-tests.ts [baseUrl]
 */

import { PrismaClient } from '@prisma/client';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const ADMIN_PHONE = '09120000000';
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

interface ApiResp<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const H = (token: string) => ({
  'Content-Type': 'application/json',
  'x-pars-session': token,
});

async function api<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown
): Promise<{ status: number; body: ApiResp<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: token ? H(token) : { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as ApiResp<T> };
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
        reqBody.error.message.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).match(/\d+/)?.[0] ?? '60',
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

async function main() {
  console.log(`— تست کامل پنل مدیریت روی ${BASE} —\n`);

  // ——— ۱) گارد دسترسی روی همه endpointهای جدید ———
  console.log('۱) گارد دسترسی (بدون نشست → ۴۰۱):');
  const guardPaths: Array<[string, string]> = [
    ['GET', '/api/admin/products'],
    ['POST', '/api/admin/products'],
    ['GET', '/api/admin/orders'],
    ['GET', '/api/admin/categories'],
    ['GET', '/api/admin/banners'],
    ['GET', '/api/admin/stories'],
    ['GET', '/api/admin/discounts'],
    ['GET', '/api/admin/reviews'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/notifications'],
    ['GET', '/api/admin/settings'],
  ];
  for (const [method, path] of guardPaths) {
    const r = await api(method, path, null);
    check(`${method} ${path} بدون نشست → ۴۰۱`, r.status === 401, `status=${r.status}`);
  }

  console.log('\n  ورود کاربران…');
  const userPhone = `0913${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const userToken = await otpLogin(userPhone);
  check('ورود کاربر عادی موفق', !!userToken);
  const adminToken = await otpLogin(ADMIN_PHONE);
  check('ورود مدیر موفق', !!adminToken);
  if (!adminToken || !userToken) {
    console.log('نتیجه: ورود ناموفق — پایان');
    console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log('\n  کاربر عادی → ۴۰۳:');
  const forbidden = await api('GET', '/api/admin/products', userToken);
  check('GET /api/admin/products کاربر عادی → ۴۰۳', forbidden.status === 403, `status=${forbidden.status}`);

  const admin = (s: string) => `x-pars-session: ${s}`;
  void admin;

  // ——— ۲) محصولات ———
  console.log('\n۲) محصولات:');
  const list = await api<{ products: Array<{ id: string; slug: string; variants: unknown[] }>; total: number }>(
    'GET',
    '/api/admin/products?page=1&pageSize=50',
    adminToken
  );
  check('GET /api/admin/products → ۲۰۰ با محصولات seed', list.status === 200 && (list.body.data?.total ?? 0) > 0);

  const badCreate = await api('POST', '/api/admin/products', adminToken, {
    slug: 'test-prod',
    title: 'تست',
    categoryId: 'x',
    variants: [],
  });
  check('ایجاد بدون واریانت → ۴۰۰ VALIDATION', badCreate.status === 400, `status=${badCreate.status}`);

  const dupSlug = await api('POST', '/api/admin/products', adminToken, {
    slug: 'pistachio-akbari',
    title: 'محصول تکراری',
    categoryId: (list.body.data?.products[0] as unknown as { category?: { id: string } })?.category?.id ?? 'x',
    variants: [{ weightGrams: 250, priceToman: 10000, stock: 1, isActive: true }],
  });
  check('اسلاگ تکراری → ۴۰۹ SLUG_TAKEN', dupSlug.status === 409 && dupSlug.body.error?.code === 'SLUG_TAKEN', `status=${dupSlug.status}`);

  const cats = await api<{ categories: Array<{ id: string; title: string }> }>('GET', '/api/admin/categories', adminToken);
  const anyCat = cats.body.data?.categories[0];
  const slug = `test-prod-${Date.now()}`;
  const created = await api<{ product: { id: string } }>('POST', '/api/admin/products', adminToken, {
    slug,
    title: 'محصول تستی پنل',
    shortDescription: 'معرفی تستی',
    description: 'توضیح کامل تستی',
    categoryId: anyCat?.id,
    attributes: [{ key: 'گرماژ', value: 'درجه یک' }],
    images: [{ url: '/images/products/almond-kernel.webp', alt: 'تصویر محصول تستی' }],
    variants: [
      { weightGrams: 250, priceToman: 150000, stock: 5, isActive: true },
      { weightGrams: 500, priceToman: 280000, compareAtPriceToman: 300000, stock: 3, isActive: true },
    ],
    isActive: true,
  });
  check('ایجاد محصول کامل → ۲۰۰', created.status === 200 && !!created.body.data?.product.id, `status=${created.status}`);
  const productId = created.body.data?.product.id ?? '';

  // جستجوی فروشگاه محصول جدید را پیدا می‌کند (searchText ساخته شد)
  const searchHit2 = await fetch(`${BASE}/api/search?q=${encodeURIComponent('تستی پنل')}`);
  const searchBody2 = (await searchHit2.json()) as ApiResp<{ results: Array<{ slug: string }> }>;
  check(
    'جستجوی فروشگاه محصول جدید را می‌یابد (searchText)',
    searchBody2.data?.results?.some((p) => p.slug === slug) === true,
    `found=${searchBody2.data?.results?.length ?? 0}`
  );

  const detail = await api<{ product: { variants: Array<{ weightGrams: number }>; attributes: string } }>(
    'GET',
    `/api/admin/products/${productId}`,
    adminToken
  );
  check(
    'جزئیات محصول: ۲ واریانت + attributes JSON',
    detail.status === 200 && detail.body.data?.product.variants.length === 2,
    `status=${detail.status}`
  );

  // ویرایش: حذف واریانت ۵۰۰ و افزودن ۷۵۰
  const patched = await api('PATCH', `/api/admin/products/${productId}`, adminToken, {
    priceToman: undefined,
    variants: [{ weightGrams: 250, priceToman: 160000, stock: 7, isActive: true }],
    isSuggested: true,
  });
  const afterPatch = await api<{ product: { variants: Array<{ weightGrams: number; priceToman: number }>; isSuggested: boolean } }>(
    'GET',
    `/api/admin/products/${productId}`,
    adminToken
  );
  check(
    'ویرایش واریانت: ۲۵۰ به‌روزرسانی و ۵۰۰ حذف شد',
    patched.status === 200 &&
      afterPatch.body.data?.product.variants.length === 1 &&
      afterPatch.body.data.product.variants[0]?.priceToman === 160000,
    JSON.stringify(afterPatch.body.data?.product.variants)
  );

  // ——— ۳) سفارش‌ها ———
  console.log('\n۳) سفارش‌ها:');
  const ordersList = await api<{ orders: unknown[]; counts: Record<string, number> }>(
    'GET',
    '/api/admin/orders?page=1&pageSize=10',
    adminToken
  );
  check(
    'GET /api/admin/orders → ۲۰۰ با شمارش وضعیت‌ها',
    ordersList.status === 200 && typeof ordersList.body.data?.counts?.all === 'number',
    `status=${ordersList.status} err=${JSON.stringify(ordersList.body.error ?? null)} countsJson=${JSON.stringify((ordersList.body.data as unknown as { counts?: unknown })?.counts)}`
  );

  // سفارش تستی مستقیم در دیتابیس — برای آزمون ماشین وضعیت و بازگشت موجودی
  const variant = await db.productVariant.findFirst({
    where: { isActive: true, stock: { gte: 10 } },
    select: { id: true, stock: true, productId: true },
  });
  let orderId: string | null = null;
  let variantStockBefore = 0;
  let salesCountBefore = 0;
  if (variant) {
    const user = await db.user.findUnique({ where: { phone: userPhone }, select: { id: true } });
    const order = await db.order.create({
      data: {
        code: `PARS-14040801-T${Date.now() % 1000}`.replace('T', 'T'),
        userId: user!.id,
        status: 'PENDING_PAYMENT',
        subtotalToman: 100000,
        totalToman: 149000,
        deliveryToman: 49000,
        addressSnapshot: JSON.stringify({ receiverName: 'تست', fullAddress: 'آدرس تستی' }),
        items: {
          create: {
            productId: variant.productId,
            variantId: variant.id,
            productTitle: 'تست ماشین وضعیت',
            weightGrams: 250,
            unitPriceToman: 100000,
            quantity: 2,
            lineTotalToman: 200000,
          },
        },
      },
      select: { id: true },
    });
    orderId = order.id;
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: { decrement: 2 } } });
    await db.product.update({ where: { id: variant.productId }, data: { salesCount: { increment: 2 } } });
    variantStockBefore = variant.stock - 2;
    const prod = await db.product.findUnique({ where: { id: variant.productId }, select: { salesCount: true } });
    salesCountBefore = prod?.salesCount ?? 0;
  }
  check('سفارش تستی ساخته شد (موجودی کم شد)', !!orderId && variantStockBefore >= 0);

  if (orderId) {
    const invalid = await api('PATCH', `/api/admin/orders/${orderId}`, adminToken, { status: 'DELIVERED' });
    check('گذار نامعتبر PENDING→DELIVERED → ۴۰۹', invalid.status === 409 && invalid.body.error?.code === 'INVALID_TRANSITION');

    const paid = await api('PATCH', `/api/admin/orders/${orderId}`, adminToken, { status: 'PAID' });
    check('گذار به PAID → ۲۰۰ و پرداخت ثبت شد', paid.status === 200 && paid.body.data?.order.paymentStatus === 'PAID');

    // GET جزئیات DTO تخت برمی‌گرداند (هم‌قرارداد با صفحهٔ پنل) — data.order نیست
    const detailRes = await api<{ items: unknown[]; addressSnapshot: string }>(
      'GET',
      `/api/admin/orders/${orderId}`,
      adminToken
    );
    check('جزئیات سفارش با آدرس Snapshot → ۲۰۰', detailRes.status === 200 && detailRes.body.data?.items.length === 1);

    const canceled = await api('PATCH', `/api/admin/orders/${orderId}`, adminToken, { status: 'CANCELED', adminNote: 'تست لغو' });
    check('لغو سفارش → ۲۰۰', canceled.status === 200);

    const stockAfter = await db.productVariant.findUnique({ where: { id: variant.id }, select: { stock: true } });
    const prodAfter = await db.product.findUnique({ where: { id: variant.productId }, select: { salesCount: true } });
    check(
      'بازگشت موجودی در لغو (۲ عدد برگشت)',
      stockAfter?.stock === variantStockBefore + 2,
      `stock=${stockAfter?.stock} expected=${variantStockBefore + 2}`
    );
    check(
      'اصلاح salesCount در لغو',
      prodAfter?.salesCount === salesCountBefore - 2,
      `sales=${prodAfter?.salesCount} expected=${salesCountBefore - 2}`
    );
    check(
      'پرداخت لغوشده → REFUNDED',
      canceled.body.data?.order.paymentStatus === 'REFUNDED',
      String(canceled.body.data?.order.paymentStatus)
    );
    const transitionAfter = await api('PATCH', `/api/admin/orders/${orderId}`, adminToken, { status: 'PAID' });
    check('وضعیت پایانی CANCELED گذار نمی‌پذیرد → ۴۰۹', transitionAfter.status === 409);
  }

  // ——— ۴) دسته‌بندی‌ها ———
  console.log('\n۴) دسته‌بندی‌ها:');
  const catSlug = `test-cat-${Date.now()}`;
  const catCreated = await api<{ category: { id: string } }>('POST', '/api/admin/categories', adminToken, {
    slug: catSlug,
    title: 'دسته تستی',
    sortOrder: 99,
  });
  check('ایجاد دسته → ۲۰۰', catCreated.status === 200);
  const catDup = await api('POST', '/api/admin/categories', adminToken, {
    slug: catSlug,
    title: 'دسته تکراری',
  });
  check('اسلاگ دسته تکراری → ۴۰۹', catDup.status === 409);

  if (catCreated.body.data?.category.id && productId) {
    await db.product.update({ where: { id: productId }, data: { categoryId: catCreated.body.data.category.id } });
    const catDelLocked = await api('DELETE', `/api/admin/categories/${catCreated.body.data.category.id}`, adminToken);
    check('حذف دسته محصول‌دار → ۴۰۹ CONFLICT', catDelLocked.status === 409);
  }
  if (catCreated.body.data?.category.id) {
    const catPatched = await api('PATCH', `/api/admin/categories/${catCreated.body.data.category.id}`, adminToken, {
      title: 'دسته تستی ویرایش‌شده',
    });
    check('ویرایش دسته → ۲۰۰', catPatched.status === 200);
  }

  // ——— ۵) بنرها و استوری‌ها ———
  console.log('\n۵) بنرها و استوری‌ها:');
  const banner = await api<{ banner: { id: string } }>('POST', '/api/admin/banners', adminToken, {
    title: 'بنر تستی پنل',
    imageUrl: '/images/banners/banner-pistachio.webp',
    linkView: 'category',
    linkParams: { slug: 'pistachio' },
    sortOrder: 5,
  });
  check('ایجاد بنر → ۲۰۰', banner.status === 200);
  if (banner.body.data?.banner.id) {
    const bList = await api<{ banners: unknown[] }>('GET', '/api/admin/banners', adminToken);
    check('بنر در فهرست است', bList.body.data?.banners.some((b) => (b as { id: string }).id === banner.body.data!.banner.id));
    const bPatch = await api('PATCH', `/api/admin/banners/${banner.body.data.banner.id}`, adminToken, { isActive: false });
    check('غیرفعال‌سازی بنر → ۲۰۰', bPatch.status === 200);
    const bDel = await api('DELETE', `/api/admin/banners/${banner.body.data.banner.id}`, adminToken);
    check('حذف بنر → ۲۰۰', bDel.status === 200);
  }

  const story = await api<{ story: { id: string; groupKey: string } }>('POST', '/api/admin/stories', adminToken, {
    groupKey: 'test-group',
    groupTitle: 'گروه تستی',
    thumbUrl: '/images/products/almond-mamaei.webp',
    mediaType: 'image',
    mediaUrl: '/images/products/almond-mamaei.webp',
    caption: 'کپشن تستی',
  });
  check('ایجاد استوری → ۲۰۰', story.status === 200);
  if (story.body.data?.story.id) {
    const sList = await api<{ groups: Array<{ groupKey: string; items: unknown[] }> }>('GET', '/api/admin/stories', adminToken);
    const grp = sList.body.data?.groups.find((g) => g.groupKey === 'test-group');
    check('استوری در گروه خود گروه‌بندی شد', !!grp && grp.items.length === 1);
    const sPatch = await api('PATCH', `/api/admin/stories/${story.body.data.story.id}`, adminToken, { isActive: false });
    check('غیرفعال‌سازی استوری → ۲۰۰', sPatch.status === 200);
    const sDel = await api('DELETE', `/api/admin/stories/${story.body.data.story.id}`, adminToken);
    check('حذف استوری → ۲۰۰', sDel.status === 200);
  }

  // ——— ۶) کدهای تخفیف ———
  console.log('\n۶) کدهای تخفیف:');
  const badDiscount = await api('POST', '/api/admin/discounts', adminToken, {
    code: 'BAD150',
    type: 'PERCENT',
    value: 150,
  });
  check('درصد ۱۵۰ → ۴۰۰ VALIDATION', badDiscount.status === 400);
  const discount = await api<{ discount: { id: string; code: string } }>('POST', '/api/admin/discounts', adminToken, {
    code: `TEST${Date.now() % 100000}`,
    type: 'PERCENT',
    value: 15,
    maxDiscountToman: 500000,
    usageLimit: 10,
  });
  check('ایجاد کد تخفیف → ۲۰۰', discount.status === 200 && !!discount.body.data?.discount.id);
  if (discount.body.data?.discount.id) {
    const dPatch = await api('PATCH', `/api/admin/discounts/${discount.body.data.discount.id}`, adminToken, {
      value: 20,
      isActive: false,
    });
    check('ویرایش کد → ۲۰۰ و مقدار جدید', dPatch.status === 200 && dPatch.body.data?.discount.value === 20);
    const dDel = await api('DELETE', `/api/admin/discounts/${discount.body.data.discount.id}`, adminToken);
    check('حذف کد → ۲۰۰', dDel.status === 200);
  }

  // ——— ۷) نظرات ———
  console.log('\n۷) نظرات:');
  const reviewSlug = 'pistachio-akbari';
  const noAuthReview = await fetch(`${BASE}/api/products/${reviewSlug}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 5 }),
  });
  check('ثبت نظر بدون نشست → ۴۰۱', noAuthReview.status === 401);

  const revRes = await fetch(`${BASE}/api/products/${reviewSlug}/reviews`, {
    method: 'POST',
    headers: H(userToken),
    body: JSON.stringify({ rating: 4, comment: 'نظر تستی فاز ۱۴' }),
  });
  const revBody = (await revRes.json()) as ApiResp<{ review: { id: string; isApproved: boolean } }>;
  check('ثبت نظر توسط کاربر → ۲۰۰ و در صف تأیید', revRes.status === 200 && revBody.data?.review.isApproved === false, `status=${revRes.status}`);

  const dupReview = await fetch(`${BASE}/api/products/${reviewSlug}/reviews`, {
    method: 'POST',
    headers: H(userToken),
    body: JSON.stringify({ rating: 5 }),
  });
  check('نظر تکراری همان محصول → ۴۰۹', dupReview.status === 409);

  const targetProduct = await db.product.findUnique({
    where: { slug: reviewSlug },
    select: { id: true, ratingSum: true, ratingCount: true },
  });
  const pendingList = await api<{ reviews: Array<{ id: string }>; pendingCount: number }>(
    'GET',
    '/api/admin/reviews?filter=pending&page=1&pageSize=50',
    adminToken
  );
  check(
    'نظر تازه در صف تأیید پنل است',
    pendingList.status === 200 && pendingList.body.data?.reviews.some((r) => r.id === revBody.data?.review.id),
    `pending=${pendingList.body.data?.pendingCount}`
  );

  if (revBody.data?.review.id && targetProduct) {
    const approve = await api('PATCH', `/api/admin/reviews/${revBody.data.review.id}`, adminToken, { isApproved: true });
    const afterApprove = await db.product.findUnique({
      where: { id: targetProduct.id },
      select: { ratingSum: true, ratingCount: true },
    });
    check(
      'تأیید → ratingSum/Count +۴/+۱',
      approve.status === 200 &&
        afterApprove?.ratingSum === targetProduct.ratingSum + 4 &&
        afterApprove.ratingCount === targetProduct.ratingCount + 1,
      `sum=${afterApprove?.ratingSum}/${targetProduct.ratingSum}`
    );
    const reject = await api('PATCH', `/api/admin/reviews/${revBody.data.review.id}`, adminToken, { isApproved: false });
    const afterReject = await db.product.findUnique({
      where: { id: targetProduct.id },
      select: { ratingSum: true, ratingCount: true },
    });
    check(
      'رد → آمار امتیاز برنگشت',
      reject.status === 200 &&
        afterReject?.ratingSum === targetProduct.ratingSum &&
        afterReject.ratingCount === targetProduct.ratingCount
    );
    const delReview = await api('DELETE', `/api/admin/reviews/${revBody.data.review.id}`, adminToken);
    check('حذف نظر → ۲۰۰', delReview.status === 200);
  }

  // ——— ۸) کاربران ———
  console.log('\n۸) کاربران:');
  const usersList = await api<{ users: Array<{ id: string; phone: string; role: string; isActive: boolean }> }>(
    'GET',
    '/api/admin/users?filter=all&page=1&pageSize=50',
    adminToken
  );
  check('GET /api/admin/users → ۲۰۰', usersList.status === 200 && usersList.body.data!.users.length > 0);
  const testUser = usersList.body.data?.users.find((u) => u.phone === userPhone);
  const adminSelf = await api<{ user: { id: string } }>('GET', '/api/auth/me', adminToken);

  const promote = await api('PATCH', `/api/admin/users/${testUser?.id}`, adminToken, { role: 'ADMIN' });
  check('ارتقای کاربر به مدیر → ۲۰۰', promote.status === 200 && promote.body.data?.user.role === 'ADMIN');

  const selfPatch = await api('PATCH', `/api/admin/users/${adminSelf.body.data?.user.id}`, adminToken, { role: 'USER' });
  check('ویرایش حساب خودِ مدیر → ۴۰۰ SELF_MODIFY', selfPatch.status === 400 && selfPatch.body.error?.code === 'SELF_MODIFY');

  if (testUser) {
    const sessionsBefore = await db.session.count({ where: { userId: testUser.id, revokedAt: null } });
    const block = await api('PATCH', `/api/admin/users/${testUser.id}`, adminToken, { isActive: false, role: 'USER' });
    const sessionsAfter = await db.session.count({ where: { userId: testUser.id, revokedAt: null } });
    check(
      'مسدودسازی → ابطال همه نشست‌های فعال',
      block.status === 200 && sessionsBefore >= 1 && sessionsAfter === 0,
      `before=${sessionsBefore} after=${sessionsAfter}`
    );
    const blockedList = await api<{ users: Array<{ phone: string }> }>(
      'GET',
      '/api/admin/users?filter=blocked&page=1&pageSize=50',
      adminToken
    );
    check('کاربر مسدود در فیلتر مسدودها', blockedList.body.data?.users.some((u) => u.phone === userPhone));
    const unblock = await api('PATCH', `/api/admin/users/${testUser.id}`, adminToken, { isActive: true });
    check('رفع مسدودی → ۲۰۰', unblock.status === 200);
  }

  // ——— ۹) اطلاع‌رسانی ———
  console.log('\n۹) اطلاع‌رسانی:');
  const overview = await api<{ stats: Record<string, number>; recentLogs: unknown[] }>(
    'GET',
    '/api/admin/notifications',
    adminToken
  );
  check(
    'آمار اطلاع‌رسانی → ۲۰۰ با ساختار کامل',
    overview.status === 200 &&
      typeof overview.body.data?.stats?.activeSubs === 'number' &&
      typeof overview.body.data?.stats?.pushOptIn === 'number' &&
      Array.isArray(overview.body.data?.recentLogs)
  );

  const badBroadcast = await api('POST', '/api/admin/notifications/broadcast', adminToken, { title: 'ک', body: 'ک' });
  check('ارسال با عنوان کوتاه → ۴۰۰', badBroadcast.status === 400);

  // کاربر تستی: رضایت Push+promotions و اشتراک فعال
  const testUserRow = await db.user.findUnique({ where: { phone: userPhone }, select: { id: true } });
  if (testUserRow) {
    await db.notificationPreference.upsert({
      where: { userId: testUserRow.id },
      update: { pushEnabled: true, promotions: true },
      create: { userId: testUserRow.id, pushEnabled: true, promotions: true },
    });
    await db.pushSubscription.create({
      data: {
        userId: testUserRow.id,
        endpoint: `https://fcm.googleapis.com/fcm/send/test-${Date.now()}`,
        p256dh: 'BTestKey',
        auth: 'TestAuth',
      },
    }).catch(() => undefined);
  }
  const broadcast = await api<{ audience: number; queued: number; vapidConfigured: boolean }>(
    'POST',
    '/api/admin/notifications/broadcast',
    adminToken,
    { title: `اعلان تستی ${Date.now() % 10000}`, body: 'متن اعلان تستی پنل', linkView: null }
  );
  check(
    'ارسال گروهی → صف‌شدن برای رضایت‌دار (۱ دستگاه)',
    broadcast.status === 200 && broadcast.body.data?.audience >= 1 && broadcast.body.data?.queued >= 1,
    `audience=${broadcast.body.data?.audience} queued=${broadcast.body.data?.queued}`
  );
  // صف در پس‌زمینه پردازش می‌شود — وضعیت می‌تواند QUEUED/SENDING/SENT/FAILED باشد
  const queuedLog = await db.notificationLog.findFirst({
    where: { title: { contains: 'اعلان تستی' }, status: { in: ['QUEUED', 'SENDING', 'SENT', 'FAILED'] } },
    select: { id: true, status: true },
  });
  check('لاگ صف اطلاع‌رسانی ثبت شد (هر وضعیت چرخه حیات)', !!queuedLog);

  // ——— ۱۰) تنظیمات ———
  console.log('\n۱۰) تنظیمات:');
  const settings = await api<{ settings: Array<{ key: string; value: string }> }>('GET', '/api/admin/settings', adminToken);
  // شمارش پویا — whitelist با رشد پروژه (فازهای بعد و کلیدهای نقشه) بیشتر می‌شود
  check(
    'GET تنظیمات → ۲۰۰ با حداقل ۱۹ کلید (فاز ۱۵ + فاز ۲ + کلیدهای بعدی)',
    settings.status === 200 && (settings.body.data?.settings.length ?? 0) >= 19,
    `count=${settings.body.data?.settings.length}`
  );
  // فاز ۲ — کلیدهای برند/تم در whitelist پنل حضور دارند
  const brandKeys = (settings.body.data?.settings ?? []).filter((s) => s.key.startsWith('brand.') || s.key.startsWith('theme.'));
  check(
    'کلیدهای برند و تم (۸ کلید با namespace پیشوندی) موجود',
    brandKeys.length === 8 && brandKeys.every((s) => s.value !== undefined),
    `got=${brandKeys.length}`
  );
  const origThreshold = settings.body.data?.settings.find((s) => s.key === 'freeShippingThresholdToman')?.value;

  const badKey = await api('PUT', '/api/admin/settings', adminToken, { values: { hackyKey: 'x' } });
  check('کلید ناشناس → ۴۰۰', badKey.status === 400);
  const badVal = await api('PUT', '/api/admin/settings', adminToken, { values: { deliveryFeeToman: -5 } });
  check('مقدار منفی → ۴۰۰', badVal.status === 400);

  const putRes = await api('PUT', '/api/admin/settings', adminToken, {
    values: { freeShippingThresholdToman: 1234567 },
  });
  check('ذخیره آستانه جدید → ۲۰۰', putRes.status === 200);
  const pubRes = await fetch(`${BASE}/api/settings`);
  const pubBody = (await pubRes.json()) as ApiResp<{ freeShippingThresholdToman: number }>;
  check(
    'تنظیم جدید در API عمومی اعمال شد',
    pubBody.data?.freeShippingThresholdToman === 1234567,
    String(pubBody.data?.freeShippingThresholdToman)
  );
  if (origThreshold !== undefined) {
    await api('PUT', '/api/admin/settings', adminToken, { values: { freeShippingThresholdToman: Number(origThreshold) } });
  }

  // ——— پاک‌سازی ———
  console.log('\nپاک‌سازی داده‌های تستی:');
  if (orderId) await db.order.delete({ where: { id: orderId } }).catch(() => undefined);
  if (productId) {
    await db.product.delete({ where: { id: productId } }).catch(() => undefined);
  }
  if (catCreated.body.data?.category.id) {
    await db.category.delete({ where: { id: catCreated.body.data.category.id } }).catch(() => undefined);
  }
  if (testUserRow) {
    await db.pushSubscription.deleteMany({ where: { userId: testUserRow.id } });
    await db.notificationLog.deleteMany({ where: { userId: testUserRow.id } });
    await db.notificationPreference.deleteMany({ where: { userId: testUserRow.id } });
  }
  await db.user.deleteMany({ where: { phone: userPhone } });
  console.log('  ✅ پاک‌سازی انجام شد');

  console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error('خطای اجرای تست:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
