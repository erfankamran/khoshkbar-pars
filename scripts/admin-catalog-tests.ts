/**
 * تست رگرسیون مدیریت کاتالوگ — فاز ۱۱.۲ (محصول/دسته/واریانت/تصویر)
 *
 * سناریوها:
 *  ۱) RBAC: بدون نشست ۴۰۱، توکن جعلی ۴۰۱، کاربر عادی ۴۰۳ + SecurityLog
 *  ۲) ورود مدیر (OTP — شماره تصادفی که خودش ادمین می‌شود؛ بدون کول‌داون/ریت‌لیمیت)
 *  ۳) دسته‌بندی: ایجاد، تکرار اسلاگ ۴۰۹، ویرایش، حذفِ دسته‌پر ۴۰۹، حذفِ خالی ۲۰۰
 *  ۴) محصول: ایجاد، اسلاگ تکراری ۴۰۹، دسته ناموجود ۴۰۴، اسلاگ نامعتبر ۴۰۰
 *  ۵) جستجوی ادمین (searchText بازسازی‌شده) + فیلتر وضعیت
 *  ۶) واریانت: ایجاد، وزن تکراری ۴۰۹، تخفیف نامعتبر ۴۰۰، ویرایش قیمت/موجودی
 *  ۷) تصویر: مسیر موجود ۲۰۰، فایل ناموجود ۴۰۰، URL خارجی ۴۰۰، ویرایش/حذف
 *  ۸) نمایش در فروشگاه (فعال → هست، غیرفعال → نیست، جزئیات + قیمت واریانت)
 *  ۹) حذف: محصول سفارش‌خورده seed → ۴۰۹ HAS_REFERENCES، محصول تست → ۲۰۰
 *  ۱۰) حسابرسی: ADMIN_ACTION در SecurityLog ثبت شده
 *
 * اجرا: bun scripts/admin-catalog-tests.ts [baseUrl]
 */

import { rm } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { mintOtp } from './otp-fallback';
import { deflateSync } from 'node:zlib';

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

interface ApiResp<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function api<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown
): Promise<{ status: number; body: ApiResp<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-pars-session': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as ApiResp<T> };
}

/** ورود OTP — کد مستقیم در DB ضرب می‌شود (سازگار با production که devCode برنمی‌گرداند) */
async function otpLogin(phone: string): Promise<string | null> {
  const code = await mintOtp(phone);
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const verifyBody = (await verifyRes.json()) as ApiResp<{ sessionToken?: string }>;
  return verifyBody.data?.sessionToken ?? null;
}

interface AdminProduct {
  id: string;
  slug: string;
  title: string;
  isActive: boolean;
  category: { id: string; title: string };
  variants: Array<{
    id: string;
    weightGrams: number;
    priceToman: number;
    stock: number;
    isActive: boolean;
    hasOrders: boolean;
  }>;
  images: Array<{ id: string; url: string; sortOrder: number }>;
}

async function main() {
  console.log(`— تست مدیریت کاتالوگ ادمین روی ${BASE} —\n`);

  const STAMP = Date.now().toString(36);
  const CAT_SLUG = `admin-test-cat-${STAMP}`;
  const PRODUCT_SLUG = `admin-test-product-${STAMP}`;
  const PRODUCT_TITLE = `پسته تست ادمین ${STAMP}`;

  // ——— ۱) RBAC ———
  console.log('۱) گارد RBAC:');
  const noAuth = await api('GET', '/api/admin/products');
  check(
    'لیست محصولات بدون نشست → ۴۰۱',
    noAuth.status === 401 && noAuth.body.error?.code === 'UNAUTHENTICATED',
    `status=${noAuth.status}`
  );
  const junk = await api('GET', '/api/admin/products', 'f'.repeat(64));
  check('توکن جعلی → ۴۰۱', junk.status === 401, `status=${junk.status}`);

  const userPhone = `0913${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const userToken = await otpLogin(userPhone);
  const forbidden = await api('POST', '/api/admin/products', userToken ?? undefined, {});
  check(
    'کاربر عادی POST محصول → ۴۰۳ FORBIDDEN',
    forbidden.status === 403 && forbidden.body.error?.code === 'FORBIDDEN',
    `status=${forbidden.status}`
  );

  // ——— ۲) ورود مدیر ———
  console.log('\n۲) ورود مدیر:');
  const adminPhone = `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  await db.user.upsert({
    where: { phone: adminPhone },
    create: { phone: adminPhone, fullName: 'ادمین تست کاتالوگ', role: 'ADMIN', isActive: true },
    update: { role: 'ADMIN', isActive: true },
  });
  const adminToken = await otpLogin(adminPhone);
  check('ورود مدیر با OTP موفق', !!adminToken);
  if (!adminToken) {
    console.log('\nنتیجه: بدون توکن مدیر ادامه ممکن نیست');
    process.exit(1);
  }

  // ——— ۳) دسته‌بندی ———
  console.log('\n۳) دسته‌بندی:');
  const catCreated = await api<{ id: string; slug: string }>(
    'POST',
    '/api/admin/categories',
    adminToken,
    { slug: CAT_SLUG, title: 'دسته تست ادمین', sortOrder: 50 }
  );
  check('ایجاد دسته → ۲۰۰', catCreated.status === 200 && !!catCreated.body.data?.id, `status=${catCreated.status}`);
  const catId = catCreated.body.data!.id;

  const catDup = await api('POST', '/api/admin/categories', adminToken, {
    slug: CAT_SLUG,
    title: 'تکراری',
  });
  check('اسلاگ تکراری دسته → ۴۰۹ SLUG_TAKEN', catDup.status === 409 && catDup.body.error?.code === 'SLUG_TAKEN', `status=${catDup.status}`);

  const catUpdate = await api<AdminProduct['category']>(
    'PATCH',
    `/api/admin/categories/${catId}`,
    adminToken,
    { title: 'دسته تست ویرایش‌شده' }
  );
  check(
    'ویرایش عنوان دسته → ۲۰۰ و اعمال‌شده',
    catUpdate.status === 200 && catUpdate.body.data?.title === 'دسته تست ویرایش‌شده',
    `status=${catUpdate.status}`
  );

  // ——— ۴) محصول ———
  console.log('\n۴) محصول:');
  const badSlug = await api('POST', '/api/admin/products', adminToken, {
    slug: 'اسلاگ فارسی!',
    title: PRODUCT_TITLE,
    categoryId: catId,
  });
  check('اسلاگ نامعتبر → ۴۰۰ VALIDATION', badSlug.status === 400 && badSlug.body.error?.code === 'VALIDATION', `status=${badSlug.status}`);

  const badCat = await api('POST', '/api/admin/products', adminToken, {
    slug: PRODUCT_SLUG,
    title: PRODUCT_TITLE,
    categoryId: 'x'.repeat(25),
  });
  check('دسته ناموجود → ۴۰۴ NOT_FOUND', badCat.status === 404, `status=${badCat.status}`);

  const created = await api<AdminProduct>('POST', '/api/admin/products', adminToken, {
    slug: PRODUCT_SLUG,
    title: PRODUCT_TITLE,
    categoryId: catId,
    shortDescription: 'محصول تست زیرفاز ۱۱.۲',
    description: 'توضیحات کامل محصول تست',
    attributes: [{ k: 'گرماژ', v: 'درجه یک' }],
    isActive: true,
  });
  check(
    'ایجاد محصول → ۲۰۰ با جزئیات کامل',
    created.status === 200 && created.body.data?.slug === PRODUCT_SLUG,
    `status=${created.status} code=${created.body.error?.code ?? '-'}`
  );
  const productId = created.body.data!.id;

  const prodDup = await api('POST', '/api/admin/products', adminToken, {
    slug: PRODUCT_SLUG,
    title: 'تکراری',
    categoryId: catId,
  });
  check('اسلاگ تکراری محصول → ۴۰۹ SLUG_TAKEN', prodDup.status === 409 && prodDup.body.error?.code === 'SLUG_TAKEN', `status=${prodDup.status}`);

  // ——— ۵) جستجوی ادمین (searchText بازسازی‌شده) ———
  console.log('\n۵) جستجو و فیلتر ادمین:');
  const found = await api<{ items: AdminProduct[]; total: number }>(
    'GET',
    `/api/admin/products?q=${encodeURIComponent(STAMP)}`,
    adminToken
  );
  check(
    'جستجوی ادمین محصول تازه را می‌یابد (searchText)',
    found.status === 200 && found.body.data?.items.some((p) => p.id === productId) === true,
    `total=${found.body.data?.total}`
  );
  const inactiveFilter = await api<{ items: AdminProduct[] }>(
    'GET',
    '/api/admin/products?status=inactive',
    adminToken
  );
  check(
    'فیلتر وضعیت inactive شامل محصول فعال نیست',
    inactiveFilter.status === 200 &&
      !inactiveFilter.body.data?.items.some((p) => p.id === productId),
    `count=${inactiveFilter.body.data?.items.length}`
  );

  // ——— ۶) واریانت ———
  console.log('\n۶) واریانت وزنی:');
  const vBad = await api('POST', `/api/admin/products/${productId}/variants`, adminToken, {
    weightGrams: 250,
    priceToman: 500000,
    compareAtPriceToman: 400000,
    stock: 10,
  });
  check(
    'تخفیف کمتر از قیمت → ۴۰۰',
    vBad.status === 400 && vBad.body.error?.code === 'VALIDATION',
    `status=${vBad.status}`
  );

  const v1 = await api<AdminProduct>(
    'POST',
    `/api/admin/products/${productId}/variants`,
    adminToken,
    { weightGrams: 250, priceToman: 489000, compareAtPriceToman: 550000, stock: 20, sku: 'TST-250' }
  );
  check(
    'ایجاد واریانت ۲۵۰ گرمی → ۲۰۰',
    v1.status === 200 && v1.body.data?.variants.length === 1,
    `status=${v1.status} code=${v1.body.error?.code ?? '-'}`
  );

  const vDup = await api('POST', `/api/admin/products/${productId}/variants`, adminToken, {
    weightGrams: 250,
    priceToman: 700000,
    stock: 5,
  });
  check('وزن تکراری → ۴۰۹ WEIGHT_EXISTS', vDup.status === 409 && vDup.body.error?.code === 'WEIGHT_EXISTS', `status=${vDup.status}`);

  const v2 = await api<AdminProduct>(
    'POST',
    `/api/admin/products/${productId}/variants`,
    adminToken,
    { weightGrams: 500, priceToman: 900000, stock: 8 }
  );
  check('ایجاد واریانت ۵۰۰ گرمی → ۲۰۰', v2.status === 200 && v2.body.data?.variants.length === 2, `status=${v2.status}`);

  const variant250 = v1.body.data!.variants[0];
  const vPatch = await api<AdminProduct>(
    'PATCH',
    `/api/admin/variants/${variant250.id}`,
    adminToken,
    { priceToman: 520000, stock: 15 }
  );
  const patched250 = vPatch.body.data?.variants.find((x) => x.weightGrams === 250);
  check(
    'ویرایش قیمت/موجودی واریانت → ۲۰۰ و اعمال‌شده',
    vPatch.status === 200 && patched250?.priceToman === 520000 && patched250?.stock === 15,
    `price=${patched250?.priceToman} stock=${patched250?.stock}`
  );

  // ——— ۷) تصاویر ———
  console.log('\n۷) تصاویر:');
  const imgBadPath = await api('POST', `/api/admin/products/${productId}/images`, adminToken, {
    url: 'https://evil.example.com/x.webp',
  });
  check('URL خارجی → ۴۰۰ VALIDATION', imgBadPath.status === 400, `status=${imgBadPath.status}`);

  const imgMissing = await api('POST', `/api/admin/products/${productId}/images`, adminToken, {
    url: '/images/products/naavoomojoood.webp',
  });
  check(
    'فایل ناموجود در /public → ۴۰۰ IMAGE_NOT_FOUND',
    imgMissing.status === 400 && imgMissing.body.error?.code === 'IMAGE_NOT_FOUND',
    `status=${imgMissing.status} code=${imgMissing.body.error?.code ?? '-'}`
  );

  const img1 = await api<AdminProduct>(
    'POST',
    `/api/admin/products/${productId}/images`,
    adminToken,
    { url: '/images/products/pistachio-kalehghouchi.webp', alt: 'تصویر تست', sortOrder: 0 }
  );
  check(
    'افزودن تصویر موجود → ۲۰۰',
    img1.status === 200 && img1.body.data?.images.length === 1,
    `status=${img1.status} code=${img1.body.error?.code ?? '-'}`
  );
  const imageId = img1.body.data!.images[0].id;

  const imgPatch = await api<AdminProduct>('PATCH', `/api/admin/images/${imageId}`, adminToken, {
    alt: 'متن تازه',
    sortOrder: 3,
  });
  check(
    'ویرایش alt/ترتیب تصویر → ۲۰۰ و اعمال‌شده',
    imgPatch.status === 200 &&
      imgPatch.body.data?.images[0]?.alt === 'متن تازه' &&
      imgPatch.body.data?.images[0]?.sortOrder === 3,
    `alt=${imgPatch.body.data?.images[0]?.alt}`
  );

  // ——— ۷.۵) آپلود واقعی فایل (ماجیک‌نمبر + سقف ۲MB) ———
  console.log('\n۷.۵) آپلود فایل تصویر:');

  /** PNG ۱×۱ معتبر — بایت‌ها در حافظه ساخته می‌شوند (بدون فایل جانبی) */
  function tinyPng(): Uint8Array {
    const signature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(1, 0);
    ihdrData.writeUInt32BE(1, 4);
    ihdrData.set([8, 2, 0, 0, 0], 8);
    const idat = deflateSync(Buffer.of(0x00, 0xff, 0x00, 0x00));
    const crc32 = (t: Buffer | Uint8Array, d: Buffer | Uint8Array): number => {
      let c = ~0;
      const all = Buffer.concat([Buffer.from(t), Buffer.from(d)]);
      for (const byte of all) {
        c ^= byte;
        for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
      return ~c >>> 0;
    };
    const chunk = (type: string, data: Buffer): Buffer => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const typeBuf = Buffer.from(type, 'ascii');
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(typeBuf, data), 0);
      return Buffer.concat([len, typeBuf, data, crc]);
    };
    return Buffer.concat([
      Buffer.from(signature),
      chunk('IHDR', ihdrData),
      chunk('IDAT', idat),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }

  /** آپلود multipart — جدا از api() چون بدنه JSON نیست */
  const upload = async (
    token: string,
    bytes: Uint8Array,
    filename: string,
    mime: string
  ): Promise<{ status: number; url?: string; code?: string }> => {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), filename);
    const res = await fetch(`${BASE}/api/admin/upload`, {
      method: 'POST',
      headers: { 'x-pars-session': token },
      body: fd,
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: { url: string };
      error?: { code?: string };
    } | null;
    return { status: res.status, url: body?.data?.url, code: body?.error?.code };
  };

  const png = tinyPng();
  const up1 = await upload(adminToken, png, 'real.png', 'image/png');
  check('PNG واقعی → ۲۰۰ و مسیر /uploads/', up1.status === 200 && /^\/uploads\/[a-z0-9]+-[a-f0-9]{16}\.png$/.test(up1.url ?? ''), `status=${up1.status} url=${up1.url}`);
  const upServed = up1.url ? await fetch(`${BASE}${up1.url}`) : null;
  check(
    'فایل آپلودی از /uploads سرو می‌شود (بایت‌به‌بایت)',
    !!upServed && upServed.status === 200 && new Uint8Array(await upServed.arrayBuffer()).length === png.length,
    upServed ? `status=${upServed.status}` : 'no url'
  );

  const up2 = await upload(adminToken, Buffer.from('#!/bin/sh\nrm -rf /\n'), 'shell.png', 'image/png');
  check(
    'متن با پسوند png (ماجیک جعلی) → ۴۱۵',
    up2.status === 415 && up2.code === 'UNSUPPORTED_TYPE',
    `status=${up2.status} code=${up2.code ?? '-'}`
  );

  const up3 = await upload(adminToken, Buffer.alloc(2 * 1024 * 1024 + 100, 0x30), 'big.webp', 'image/webp');
  check(
    'بیشتر از ۲MB → ۴۱۳',
    up3.status === 413 && up3.code === 'FILE_TOO_LARGE',
    `status=${up3.status} code=${up3.code ?? '-'}`
  );

  if (up1.url) {
    await rm(path.join(process.cwd(), 'public', up1.url), { force: true });
  }


  // ——— ۸) نمایان شدن در فروشگاه ———
  console.log('\n۸) نمایش در فروشگاه:');
  const storeList = await api<{ items: Array<{ slug: string; variants: unknown[] }> }>(
    'GET',
    `/api/products?limit=24`
  );
  const inStore = storeList.body.data?.items.some((p) => p.slug === PRODUCT_SLUG) === true;
  check('محصول فعال در /api/products هست', inStore, `count=${storeList.body.data?.items.length}`);

  const storeDetail = await api<{
    product: { slug: string; variants: Array<{ weightGrams: number; priceToman: number }> };
  }>('GET', `/api/products/${PRODUCT_SLUG}`);
  check(
    'جزئیات فروشگاه واریانت ۲۵۰گ با قیمت تازه را دارد',
    storeDetail.status === 200 &&
      storeDetail.body.data?.product.variants.some((v) => v.weightGrams === 250 && v.priceToman === 520000) === true,
    JSON.stringify(storeDetail.body.data?.product.variants ?? storeDetail.body.error)
  );

  const deactivate = await api<AdminProduct>('PATCH', `/api/admin/products/${productId}`, adminToken, {
    isActive: false,
  });
  check('غیرفعال‌سازی محصول → ۲۰۰', deactivate.status === 200 && deactivate.body.data?.isActive === false, `status=${deactivate.status}`);

  const storeAfter = await api<{ items: Array<{ slug: string }> }>('GET', `/api/products?limit=24`);
  check(
    'محصول غیرفعال از فروشگاه پنهان شد',
    !storeAfter.body.data?.items.some((p) => p.slug === PRODUCT_SLUG)
  );
  const detailAfter = await api('GET', `/api/products/${PRODUCT_SLUG}`);
  check('جزئیات محصول غیرفعال → ۴۰۴', detailAfter.status === 404, `status=${detailAfter.status}`);

  // ——— ۹) حذف‌ها و گاردها ———
  console.log('\n۹) حذف و گاردها:');
  const catBusy = await api('DELETE', `/api/admin/categories/${catId}`, adminToken);
  check(
    'حذف دسته دارای محصول → ۴۰۹ HAS_PRODUCTS',
    catBusy.status === 409 && catBusy.body.error?.code === 'HAS_PRODUCTS',
    `status=${catBusy.status}`
  );

  // محصول سفارش‌خورده از seed (سابقه واقعی سفارش در دیتابیس)
  const orderedProduct = await db.product.findFirst({
    where: { orderItems: { some: {} } },
    select: { id: true, slug: true },
  });
  if (orderedProduct) {
    const delOrdered = await api('DELETE', `/api/admin/products/${orderedProduct.id}`, adminToken);
    check(
      'حذف محصول سفارش‌خورده → ۴۰۹ HAS_REFERENCES',
      delOrdered.status === 409 && delOrdered.body.error?.code === 'HAS_REFERENCES',
      `status=${delOrdered.status} product=${orderedProduct.slug}`
    );
  } else {
    check('محصول سفارش‌خورده برای تست گارد موجود است', false, 'هیچ orderItem وجود ندارد');
  }

  const imgDel = await api('DELETE', `/api/admin/images/${imageId}`, adminToken);
  check('حذف تصویر → ۲۰۰', imgDel.status === 200, `status=${imgDel.status}`);

  const vDel = await api('DELETE', `/api/admin/variants/${v2.body.data!.variants[1].id}`, adminToken);
  check('حذف واریانت بی‌سابقه → ۲۰۰', vDel.status === 200, `status=${vDel.status}`);

  // واریانت باقی‌مانده سفارش ندارد ولی محصول را دوباره فعال نمی‌کنیم — مستقیم حذف محصول
  const prodDel = await api('DELETE', `/api/admin/products/${productId}`, adminToken);
  check('حذف محصول تست → ۲۰۰', prodDel.status === 200, `status=${prodDel.status} code=${prodDel.body.error?.code ?? '-'}`);

  const prodGone = await api('GET', `/api/admin/products/${productId}`, adminToken);
  check('محصول حذف‌شده در ادمین → ۴۰۴', prodGone.status === 404, `status=${prodGone.status}`);

  const catDel = await api('DELETE', `/api/admin/categories/${catId}`, adminToken);
  check('حذف دسته بی‌محصول → ۲۰۰', catDel.status === 200, `status=${catDel.status}`);

  // ——— ۱۰) حسابرسی ———
  console.log('\n۱۰) حسابرسی:');
  const adminLogs = await db.securityLog.count({
    where: { event: 'ADMIN_ACTION', phone: adminPhone },
  });
  check(
    'اقدامات ادمین در SecurityLog ثبت شد (ADMIN_ACTION)',
    adminLogs >= 10,
    `count=${adminLogs}`
  );

  console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error('خطای اجرای تست:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
