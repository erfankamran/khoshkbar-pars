/**
 * تست رگرسیون پاسخ فروشگاه به نظرات (قابلیت جدید داشبورد)
 *
 * پوشش:
 *  ۱) گیت دسترسی: PUT/DELETE reply بدون نشست → ۴۰۱؛ کاربر عادی → ۴۰۳
 *  ۲) اعتبارسنجی: متن خالی → ۴۰۰؛ متن بیش از ۱۰۰۰ نویسه → ۴۰۰
 *  ۳) شناسهٔ ساختگی → ۴۰۴
 *  ۴) جریان کامل: ثبت نظر کاربر → تأیید مدیر → PUT reply → نمایش عمومی
 *     adminReply/adminReplyAt در GET /api/products/[slug]/reviews
 *  ۵) ویرایش پاسخ (PUT دوم) → متن جدید در خروجی عمومی
 *  ۶) حذف پاسخ (DELETE) → adminReply در خروجی عمومی null می‌شود
 *  ۷) فهرست پنل GET /api/admin/reviews فیلدهای پاسخ را دارد
 *
 * اجرا: bun scripts/review-reply-tests.ts [baseUrl]
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
  if (!reqBody.ok) {
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
  // devCode فقط در محیط غیرproduction برمی‌گردد؛ روی سرور production
  // (بدون devCode) از کد مادر OTP_MASTER_CODE استفاده می‌شود.
  const code = reqBody.data?.devCode ?? (process.env.OTP_MASTER_CODE?.trim() || '123456');
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const verifyBody = (await verifyRes.json()) as ApiResp<{ sessionToken?: string }>;
  return verifyBody.data?.sessionToken ?? null;
}

interface PublicReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  adminReply: string | null;
  adminReplyAt: string | null;
}

async function main() {
  console.log(`— تست پاسخ فروشگاه به نظرات روی ${BASE} —\n`);

  // ——— ۱) گیت دسترسی ———
  console.log('۱) گیت دسترسی:');
  const fakeId = 'cmfake000000000000000000';
  const noSessionPut = await api('PUT', `/api/admin/reviews/${fakeId}/reply`, null, {
    adminReply: 'تست',
  });
  check('PUT reply بدون نشست → ۴۰۱', noSessionPut.status === 401, `status=${noSessionPut.status}`);
  const noSessionDelete = await api('DELETE', `/api/admin/reviews/${fakeId}/reply`, null);
  check('DELETE reply بدون نشست → ۴۰۱', noSessionDelete.status === 401, `status=${noSessionDelete.status}`);

  // ——— ورود کاربران ———
  const userPhone = `0913${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const userToken = await otpLogin(userPhone);
  check('ورود کاربر عادی موفق', !!userToken);
  const adminToken = await otpLogin(ADMIN_PHONE);
  check('ورود مدیر موفق', !!adminToken);
  if (!adminToken || !userToken) {
    console.log('نتیجه: ورود ناموفق — پایان');
    console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
    await db.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }

  const userPut = await api('PUT', `/api/admin/reviews/${fakeId}/reply`, userToken, {
    adminReply: 'تست',
  });
  check('PUT reply کاربر عادی → ۴۰۳', userPut.status === 403, `status=${userPut.status}`);
  const userDelete = await api('DELETE', `/api/admin/reviews/${fakeId}/reply`, userToken);
  check('DELETE reply کاربر عادی → ۴۰۳', userDelete.status === 403, `status=${userDelete.status}`);

  // ——— دادهٔ پایه: محصول فعال ———
  const product = await db.product.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, slug: true, title: true, ratingSum: true, ratingCount: true },
  });
  if (!product) {
    console.log('  ❌ محصول فعال یافت نشد — پایان');
    console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
    await db.$disconnect();
    process.exit(1);
  }
  const statsBefore = { sum: product.ratingSum, count: product.ratingCount };

  // ——— ۲) جریان کامل: نظر → تأیید → پاسخ ———
  console.log('\n۲) ثبت نظر و تأیید مدیر:');
  const created = await api<{ review: { id: string } }>(
    'POST',
    `/api/products/${product.slug}/reviews`,
    userToken,
    { rating: 4, comment: 'نظر آزمایشی تست پاسخ فروشگاه' }
  );
  check('ثبت نظر کاربر → ۲۰۰', created.status === 200 && !!created.body.data?.review.id, `status=${created.status}`);
  const reviewId = created.body.data?.review.id;

  const approved = await api('PATCH', `/api/admin/reviews/${reviewId}`, adminToken, {
    isApproved: true,
  });
  check('تأیید نظر توسط مدیر → ۲۰۰', approved.status === 200, `status=${approved.status}`);

  const publicBefore = await api<{ items: PublicReviewItem[] }>(
    'GET',
    `/api/products/${product.slug}/reviews?limit=20`,
    null
  );
  const itemBefore = publicBefore.body.data?.items.find((x) => x.id === reviewId);
  check('نظر تأییدشده در خروجی عمومی هست', !!itemBefore);
  check('پیش از پاسخ: adminReply=null', itemBefore?.adminReply === null);

  // ——— ۳) اعتبارسنجی پاسخ ———
  console.log('\n۳) اعتبارسنجی PUT reply:');
  const emptyReply = await api('PUT', `/api/admin/reviews/${reviewId}/reply`, adminToken, {
    adminReply: '   ',
  });
  check('متن خالی → ۴۰۰', emptyReply.status === 400, `status=${emptyReply.status}`);
  const longReply = await api('PUT', `/api/admin/reviews/${reviewId}/reply`, adminToken, {
    adminReply: 'ا'.repeat(1001),
  });
  check('متن بیش از ۱۰۰۰ نویسه → ۴۰۰', longReply.status === 400, `status=${longReply.status}`);
  const notFoundReply = await api('PUT', `/api/admin/reviews/${fakeId}/reply`, adminToken, {
    adminReply: 'تست',
  });
  check('شناسهٔ ساختگی → ۴۰۴', notFoundReply.status === 404, `status=${notFoundReply.status}`);

  // ——— ۴) ثبت پاسخ و نمایش عمومی ———
  console.log('\n۴) ثبت پاسخ و نمایش عمومی:');
  const putReply = await api<{ review: { id: string; adminReply: string; adminReplyAt: string } }>(
    'PUT',
    `/api/admin/reviews/${reviewId}/reply`,
    adminToken,
    { adminReply: 'سپاس از خرید شما — بسته‌بندی به‌روزرسانی شد!' }
  );
  check('PUT reply مدیر → ۲۰۰', putReply.status === 200 && !!putReply.body.data?.review.adminReply, `status=${putReply.status}`);
  check('پاسخ دارای adminReplyAt است', !!putReply.body.data?.review.adminReplyAt);

  const publicAfter = await api<{ items: PublicReviewItem[] }>(
    'GET',
    `/api/products/${product.slug}/reviews?limit=20`,
    null
  );
  const itemAfter = publicAfter.body.data?.items.find((x) => x.id === reviewId);
  check('adminReply در خروجی عمومی دیده می‌شود', itemAfter?.adminReply === 'سپاس از خرید شما — بسته‌بندی به‌روزرسانی شد!');
  check('adminReplyAt در خروجی عمومی دیده می‌شود', !!itemAfter?.adminReplyAt);

  // فهرست پنل هم فیلدهای پاسخ را دارد
  const adminList = await api<{ reviews: Array<{ id: string; adminReply: string | null }> }>(
    'GET',
    '/api/admin/reviews?filter=approved&pageSize=50',
    adminToken
  );
  const listed = adminList.body.data?.reviews.find((x) => x.id === reviewId);
  check('فهرست پنل adminReply را برمی‌گرداند', listed?.adminReply === 'سپاس از خرید شما — بسته‌بندی به‌روزرسانی شد!');

  // ——— ۵) ویرایش پاسخ ———
  console.log('\n۵) ویرایش پاسخ:');
  const editReply = await api('PUT', `/api/admin/reviews/${reviewId}/reply`, adminToken, {
    adminReply: 'متن ویرایش‌شدهٔ پاسخ فروشگاه',
  });
  check('PUT دوم (ویرایش) → ۲۰۰', editReply.status === 200, `status=${editReply.status}`);
  const publicEdited = await api<{ items: PublicReviewItem[] }>(
    'GET',
    `/api/products/${product.slug}/reviews?limit=20`,
    null
  );
  const itemEdited = publicEdited.body.data?.items.find((x) => x.id === reviewId);
  check('متن ویرایش‌شده در خروجی عمومی', itemEdited?.adminReply === 'متن ویرایش‌شدهٔ پاسخ فروشگاه');

  // ——— ۶) حذف پاسخ ———
  console.log('\n۶) حذف پاسخ:');
  const delReply = await api('DELETE', `/api/admin/reviews/${reviewId}/reply`, adminToken);
  check('DELETE reply → ۲۰۰', delReply.status === 200, `status=${delReply.status}`);
  const publicCleared = await api<{ items: PublicReviewItem[] }>(
    'GET',
    `/api/products/${product.slug}/reviews?limit=20`,
    null
  );
  const itemCleared = publicCleared.body.data?.items.find((x) => x.id === reviewId);
  check('پس از حذف: adminReply=null در خروجی عمومی', itemCleared?.adminReply === null);

  // ——— پاکسازی کامل با اصلاح آمار امتیاز ———
  const unapproved = await api('PATCH', `/api/admin/reviews/${reviewId}`, adminToken, {
    isApproved: false,
  });
  const deleted = reviewId ? await db.review.delete({ where: { id: reviewId } }).then(() => true).catch(() => false) : false;
  const productAfter = await db.product.findUnique({
    where: { id: product.id },
    select: { ratingSum: true, ratingCount: true },
  });
  const statsRestored =
    productAfter?.ratingSum === statsBefore.sum && productAfter?.ratingCount === statsBefore.count;
  check('پاکسازی: رد نظر → ۲۰۰', unapproved.status === 200, `status=${unapproved.status}`);
  check('پاکسازی: حذف نظر از دیتابیس', deleted);
  check('پاکسازی: آمار امتیاز محصول بدون تغییر باقی ماند', statsRestored);

  console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('خطای غیرمنتظره:', e);
  await db.$disconnect();
  process.exit(1);
});
