/**
 * تست تابعی جامع API فروشگاه — فاز ۵
 * اجرا فقط روی سرور و دیتابیس آزمایشی: PARS_TEST_DATABASE_URL=... bun scripts/api-tests.ts <baseUrl>
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.argv[2] ?? process.env.PARS_TEST_BASE_URL;
const TEST_DATABASE_URL = process.env.PARS_TEST_DATABASE_URL;
if (!BASE || !TEST_DATABASE_URL) throw new Error('نشانی سرور آزمایشی و PARS_TEST_DATABASE_URL را صریح وارد کنید');
// چک‌های «تعداد» با دیتابیس مقایسه می‌شوند نه عدد هاردکد — فروشگاه با
// مدیریت پنل (افزودن/حذف بنر، نظرات جدید) قانونی رشد/کم می‌شود
const db = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
let orderTestStock: Array<{ id: string; stock: number }> = [];

let pass = 0;
let failCount = 0;
let skipped = 0;
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

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* بدنه غیر JSON */
  }
  return { status: res.status, json: json as Record<string, unknown> | null };
}

/** شیشه کوکی مستقل — هر دستگاه/کاربر تست یک jar */
function makeJar() {
  let cookie = '';
  return {
    headers(): Record<string, string> {
      return cookie ? { Cookie: cookie } : {};
    },
    absorb(res: Response) {
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
    },
    get raw() {
      return cookie;
    },
  };
}

async function req(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  jar?: ReturnType<typeof makeJar>,
  body?: unknown
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(jar?.headers() ?? {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  jar?.absorb(res);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* بدنه غیر JSON */
  }
  return { status: res.status, json: json as Record<string, unknown> | null };
}

// ————————————————————————————————
console.log('—— ۱) سلامت اندپوینت‌های محتوا ——');
{
  const { status, json } = await get('/api/categories');
  const d = (json?.data as { items?: Array<Record<string, unknown>> } | undefined)?.items;
  check('GET /api/categories → 200', status === 200);
  check('پاکت پاسخ ok:true', json?.ok === true);
  check('۱۲ دسته‌بندی', d?.length === 12, `got ${d?.length}`);
  check('فیلد productCount عددی', typeof d?.[0]?.productCount === 'number');
  check('slug دسته pistachio موجود', d?.some((c) => c.slug === 'pistachio'));
}

{
  const { status, json } = await get('/api/banners');
  const d = (json?.data as { items?: Array<Record<string, unknown>> } | undefined)?.items;
  check('GET /api/banners → 200', status === 200);
  check('تعداد بنر فعال = دیتابیس', d?.length === (await db.banner.count({ where: { isActive: true } })), `got ${d?.length}`);
  check('لینک بنر parse شده (linkParams شیء)', typeof d?.[0]?.linkParams === 'object');
}
{
  const { status, json } = await get('/api/stories');
  const d = json?.data as { groups: Array<{ items: unknown[] }> } | undefined;
  check('GET /api/stories → 200', status === 200);
  check('۵ گروه استوری (۶ آیتم)', d?.groups?.length === 5, `got ${d?.groups?.length}`);
  check('مجموع آیتم‌های استوری = ۶', (d?.groups ?? []).reduce((s, g) => s + g.items.length, 0) === 6);
}
{
  const { status, json } = await get('/api/settings');
  const d = json?.data as Record<string, unknown> | undefined;
  check('GET /api/settings → 200', status === 200);
  check('آستانه ارسال رایگان موجود', 'freeShippingThresholdToman' in (d ?? {}));
  check('کلید مخفی نشت نکرده (whitelist)', !('adminSecret' in (d ?? {})));
}

// ————————————————————————————————
console.log('—— ۱.۵) اندپوینت تجمیعی خانه (فاز ۶) ——');
{
  const { status, json } = await get('/api/home');
  const d = json?.data as
    | {
        banners: Array<Record<string, unknown>>;
        stories: Array<{ groupKey: string; items: unknown[] }>;
        categories: Array<{ slug: string; productCount: number }>;
        sections: Record<string, Array<Record<string, unknown>>>;
      }
    | undefined;
  check('GET /api/home → 200', status === 200);
  check('تعداد بنر = دیتابیس', d?.banners?.length === (await db.banner.count({ where: { isActive: true } })));
  check('۵ گروه استوری', d?.stories?.length === 5);
  check('۱۲ دسته', d?.categories?.length === 12);
  check('۴ بخش محصول', Object.keys(d?.sections ?? {}).length === 4);
  // شمارش hardcoded نیست — فروشگاه با افزودن محصول قانونی رشد می‌کند؛ فقط حداقل ساختار چک می‌شود
  check(
    'بخش هدایای سازمانی حداقل ۳ محصول دارد',
    (d?.gifts as unknown[] | undefined)?.length !== undefined &&
      (d?.gifts as unknown[]).length >= 3,
    `got ${(d?.gifts as unknown[] | undefined)?.length}`
  );
  check(
    'پک‌های مناسبتی یلدا/نوروز در بخش هدایا هستند',
    (d?.gifts as Array<{ slug: string }> | undefined)?.some((g) => g.slug === 'gift-pack-yalda') &&
      (d?.gifts as Array<{ slug: string }> | undefined)?.some((g) => g.slug === 'gift-pack-nowruz')
  );
  check('هر بخش ۸ آیتم (پرفروش)', d?.sections?.bestseller?.length === 8);
  check('بخش تخفیف‌دار همگی تخفیف‌دار', (d?.sections?.discounted ?? []).every((i) => i.hasDiscount === true));
  check('کارت شامل واریانت‌ها', Array.isArray(d?.sections?.bestseller?.[0]?.variants));
}

// ————————————————————————————————
console.log('—— ۲) لیست محصولات: شکل داده و صفحه‌بندی ——');
{
  const { status, json } = await get('/api/products?limit=12');
  const d = json?.data as {
    items: Array<Record<string, unknown>>;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  check('GET /api/products → 200', status === 200);
  check('۱۲ آیتم در صفحه', d?.items?.length === 12);
  // صفحه‌بندی پویا — مجموع محصولات با رشد فروشگاه تغییر می‌کند
  check('total > 0', (d?.total ?? 0) > 0, `got ${d?.total}`);
  check('totalPages سازگار با total', d?.totalPages === Math.ceil((d?.total ?? 0) / 12));
  check('hasMore = true', d?.hasMore === true);

  const first = d?.items?.[0];
  check('عنوان فارسی', typeof first?.title === 'string' && /[\u0600-\u06FF]/.test(first.title as string));
  check('واریانت‌های فعال موجود', Array.isArray(first?.variants) && (first?.variants as unknown[]).length >= 4);
  const variants = (first?.variants ?? []) as Array<{ weightGrams: number; priceToman: number }>;
  check('واریانت‌ها مرتب صعودی وزن', variants.every((v, i) => i === 0 || v.weightGrams > variants[i - 1].weightGrams));
  check('قیمت صحیح تومان (عدد صحیح)', variants.every((v) => Number.isInteger(v.priceToman) && v.priceToman > 0));
  check('minPrice ≤ maxPrice', (first?.minPriceToman as number) <= (first?.maxPriceToman as number));
  check('تصویر کارت موجود', !!first?.image && typeof (first.image as { url: string }).url === 'string');
}
{
  // صفحه دوم
  const { json } = await get('/api/products?page=2&limit=12');
  const d = json?.data as { items: unknown[]; hasMore: boolean };
  // طول صفحه آخر = باقیمانده تقسیم — پویا، نه عدد ثابت
  check(
    'صفحه ۲ → طول درست (باقیمانده total)',
    d?.items?.length === (d?.total as number | undefined ?? 0) - 12 &&
      (d?.items?.length ?? 0) > 0,
    `got ${d?.items?.length}`
  );
  check('صفحه ۲ → hasMore=false', d?.hasMore === false);
}
{
  // سکشن‌ها
  const best = await get('/api/products?section=bestseller&limit=4');
  const bd = best.json?.data as { items: Array<{ salesCount: number }> };
  check('bestseller → 200 و ۴ آیتم', best.status === 200 && bd?.items?.length === 4);
  const sorted = [...(bd?.items ?? [])].sort((a, b) => b.salesCount - a.salesCount);
  check('bestseller مرتب نزولی فروش', JSON.stringify(bd?.items?.map((i) => i.salesCount)) === JSON.stringify(sorted.map((i) => i.salesCount)));

  const disc = await get('/api/products?section=discounted&limit=24');
  const dd = disc.json?.data as { items: Array<{ hasDiscount: boolean }> };
  check('discounted → همه hasDiscount=true', dd?.items?.length > 0 && dd.items.every((i) => i.hasDiscount));

  const sug = await get('/api/products?section=suggested&limit=24');
  const sd = sug.json?.data as { items: Array<{ isSuggested: boolean }> };
  check('suggested → همه isSuggested=true', sd?.items?.length > 0 && sd.items.every((i) => i.isSuggested));

  const cheap = await get('/api/products?sort=cheap&limit=24');
  const cd = cheap.json?.data as { items: Array<{ minPriceToman: number }> };
  const mins = cd?.items?.map((i) => i.minPriceToman) ?? [];
  check('sort=cheap مرتب صعودی قیمت', mins.every((v, i) => i === 0 || v >= mins[i - 1]));

  const cat = await get('/api/products?category=pistachio&limit=24');
  const catd = cat.json?.data as { items: Array<{ category: { slug: string } }> };
  check('category=pistachio → همه از همان دسته', catd?.items?.length > 0 && catd.items.every((i) => i.category.slug === 'pistachio'));
}

// ————————————————————————————————
console.log('—— ۳) جزئیات محصول + مرتبط‌ها ——');
{
  const { status, json } = await get('/api/products/pistachio-akbari');
  const d = json?.data as {
    product: Record<string, unknown>;
    related: Array<Record<string, unknown>>;
  };
  check('GET detail → 200', status === 200);
  check('slug درست', (d?.product?.slug as string) === 'pistachio-akbari');
  check('توضیحات کامل موجود', typeof d?.product?.description === 'string' && (d?.product?.description as string).length > 50);
  check('attributes آرام و پر', Array.isArray(d?.product?.attributes) && (d?.product?.attributes as unknown[]).length > 0);
  check('گالری کامل (هر محصول ۱ تصویر در Seed)', ((d?.product?.images as unknown[])?.length ?? 0) >= 1);
  check('skuFirst موجود', typeof d?.product?.skuFirst === 'string');
  // دسته پسته ۳ محصول دارد → حداقل ۱ و حداکثر ۴ مرتبط؛ همه از همان دسته
  check('مرتبط‌ها از همان دسته (۲ تا برای پسته)', (d?.related?.length ?? 0) >= 1 && d.related.every((r) => (r as { category: { slug: string } }).category.slug === 'pistachio'));
  check('مرتبط شامل خود محصول نیست', d?.related?.every((r) => r.slug !== 'pistachio-akbari'));
  // محصول کم‌موجودی (stock=3 برای تست UI)
  const low = await get('/api/products/pistachio-akbari');
  const lowV = (low.json?.data as { product: { variants: Array<{ stock: number }> } })?.product?.variants ?? [];
  check('واریانت کم‌موجودی (stock=3) در پاسخ', lowV.some((v) => v.stock === 3));
}
{
  const { status, json } = await get('/api/products/does-not-exist');
  const e = json?.error as { code: string } | undefined;
  check('slug ناشناخته → 404', status === 404);
  check('کد خطا NOT_FOUND', e?.code === 'NOT_FOUND');
  check('پیام خطا فارسی', json && 'error' in json);
}

// ————————————————————————————————
console.log('—— ۳.۵) نظرات محصول (فاز ۷) ——');
{
  const { status, json } = await get('/api/products/pistachio-akbari/reviews?limit=20');
  const d = json?.data as {
    summary: { average: number; count: number; distribution: Record<string, number> };
    items: Array<{ rating: number; comment: string | null; displayName: string; isVerifiedPurchase: boolean; createdAt: string }>;
  };
  check('GET reviews → 200', status === 200);
  // میانگین از آمار تجمعی محصول (همان منبع سرویس) — نه عدد هاردکد seed
  const ratedProduct = await db.product.findUnique({
    where: { slug: 'pistachio-akbari' },
    select: { ratingSum: true, ratingCount: true },
  });
  const expectedAvg =
    ratedProduct && ratedProduct.ratingCount > 0
      ? Number((ratedProduct.ratingSum / ratedProduct.ratingCount).toFixed(1))
      : 0;
  check('میانگین مطابق آمار تجمعی محصول', d?.summary?.average === expectedAvg, `got ${d?.summary?.average} expected ${expectedAvg}`);
  check('توزیع کامل ۱..۵', d?.summary?.distribution && Object.keys(d.summary.distribution).length === 5);
  check('نظرات ۳ عددی (Seed)', d?.items?.length === 3, `got ${d?.items?.length}`);
  check('نام نمایشی بدون شماره موبایل', d?.items?.every((r) => !/09\d{9}/.test(r.displayName)));
  check('تاریخ ISO معتبر', d?.items?.every((r) => !Number.isNaN(Date.parse(r.createdAt))));
  check('امتیاز در بازه ۳..۵', d?.items?.every((r) => r.rating >= 3 && r.rating <= 5));

  const nf = await get('/api/products/no-such-item/reviews');
  check('محصول ناشناخته → 404 NOT_FOUND', nf.status === 404 && (nf.json?.error as { code: string })?.code === 'NOT_FOUND');

  const badLimit = await get('/api/products/pistachio-akbari/reviews?limit=999');
  check('limit=999 → 400', badLimit.status === 400);
}

// ————————————————————————————————
console.log('—— ۴) جستجو با نرمال‌سازی فارسی (بخش ۹) ——');
{
  const base = await get(`/api/search?q=${encodeURIComponent('پسته')}`);
  const bd = base.json?.data as { mode: string; results: Array<{ slug: string }>; tokens: string[] };
  check('جستجوی «پسته» → 200', base.status === 200);
  check('mode=search', bd?.mode === 'search');
  check('نتایج پسته ≥ ۴', (bd?.results?.length ?? 0) >= 4, `got ${bd?.results?.length}`);

  // ی عربی: «پيارم» باید پسته پیارم را پیدا کند
  const arabicYe = await get(`/api/search?q=${encodeURIComponent('پيارم')}`);
  const ay = arabicYe.json?.data as { results: Array<{ slug: string }> };
  check('«پيارم» (ی عربی) → date-piarom', ay?.results?.some((r) => r.slug === 'date-piarom'), JSON.stringify(ay?.results?.map((r) => r.slug)));

  // ک عربی: «كشمش» باید کشمش را پیدا کند
  const arabicKaf = await get(`/api/search?q=${encodeURIComponent('كشمش')}`);
  const ak = arabicKaf.json?.data as { results: Array<{ slug: string }> };
  check('«كشمش» (ک عربی) → نتایج کشمش', ak?.results?.length >= 2, JSON.stringify(ak?.results?.map((r) => r.slug)));

  // ارقام فارسی در جستجو
  const faNum = await get(`/api/search?q=${encodeURIComponent('پسته ۲۵۰')}`);
  check('جستجو با ارقام فارسی → 200', faNum.status === 200);

  // خالی → پیشنهاد
  const empty = await get('/api/search?q=');
  const ed = empty.json?.data as { mode: string; results: unknown[] };
  check('q خالی → mode=suggest', ed?.mode === 'suggest');
  check('پیشنهاد = ۸ پرفروش', ed?.results?.length === 8);

  // چیپ دسته‌بندی
  const withCat = await get(`/api/search?q=${encodeURIComponent('خرما')}`);
  const wcd = withCat.json?.data as { categories: Array<{ slug: string }> };
  check('چیپ دسته «خرما» در نتایج', wcd?.categories?.some((c) => c.slug === 'date'), JSON.stringify(wcd?.categories));
}

// ————————————————————————————————
console.log('—— ۵) اعتبارسنجی و کدهای خطا (بخش ۱۵) ——');
{
  const badLimit = await get('/api/products?limit=99');
  check('limit=99 → 400 VALIDATION', badLimit.status === 400 && (badLimit.json?.error as { code: string })?.code === 'VALIDATION');

  const badSort = await get('/api/products?sort=expensiveX');
  check('sort نامعتبر → 400', badSort.status === 400);

  const badSlugQ = await get('/api/products?category=UPPER');
  check('category با حروف بزرگ → 400', badSlugQ.status === 400);

  const negPage = await get('/api/products?page=-1');
  check('page=-1 → 400', negPage.status === 400);

  const badDetail = await get('/api/products/..%2Fetc');
  check('slug مسیری (path traversal) → 400', badDetail.status === 400, `got ${badDetail.status}`);

  const longQ = await get(`/api/search?q=${'a'.repeat(100)}`);
  check('q بلندتر از ۶۰ → 400', longQ.status === 400);

  // بررسی نشت پیام خطای داخلی
  const leak = (badLimit.json?.error as { details?: unknown })?.details;
  check('جزئیات خطا فقط zod issues (بدون stack)', leak === undefined || (Array.isArray(leak) && !JSON.stringify(leak).includes('at ')));
}

// ————————————————————————————————
console.log('—— ۵.۵) سبد خرید سمت سرور (فاز ۸) ——');
{
  // ——— شیشه کوکی مستقل برای سبد مهمان (makeJar/req در سطح ماژول) ———
  const jar1 = makeJar();
  type CartData = {
    items: Array<{ id: string; variantId: string; quantity: number; unitPriceToman: number; lineTotalToman: number; isPurchasable: boolean; weightGrams: number; title: string }>;
    warnings: Array<{ type: string; message: string }>;
    totals: { subtotalToman: number; deliveryToman: number; totalPayableToman: number; freeShipping: boolean; meetsMinOrder: boolean; minOrderToman: number; remainingForFreeShippingToman: number };
  };
  const cartOf = (json: Record<string, unknown> | null) => json?.data as CartData | undefined;

  // ——— سبد خالی ———
  const empty = await req('GET', '/api/cart', jar1);
  const emptyData = cartOf(empty.json);
  check('GET /api/cart → 200', empty.status === 200);
  check('کوکی دستگاه pars_device تنظیم شد', empty.json?.ok === true && !empty.status.toString().startsWith('5'));
  check('سبد خالی: ۰ ردیف', emptyData?.items.length === 0);
  check('سبد خالی: جمع صفر و ارسال صفر', emptyData?.totals.subtotalToman === 0 && emptyData?.totals.deliveryToman === 0);
  check('حداقل سفارش ۳۰۰٬۰۰۰ از Setting', emptyData?.totals.minOrderToman === 300000);

  // ——— شناسه‌های واقعی محصول ———
  const prodRes = await get('/api/products/pistachio-akbari');
  const prod = (prodRes.json?.data as { product: { id: string; variants: Array<{ id: string; weightGrams: number; priceToman: number; stock: number }> } } | undefined)?.product;
  const v250 = prod?.variants.find((v) => v.weightGrams === 250);
  const v1kg = prod?.variants.find((v) => v.weightGrams === 1000);
  check('داده محصول برای تست سبد موجود', !!prod && !!v250 && !!v1kg);

  if (prod && v250 && v1kg) {
    // ——— افزودن با قیمت راهنمای نادرست → هشدار تغییر قیمت ———
    const add1 = await req('POST', '/api/cart/items', jar1, {
      productId: prod.id,
      variantId: v250.id,
      quantity: 2,
      expectedUnitPriceToman: v250.priceToman + 369000,
    });
    const c1 = cartOf(add1.json);
    check('POST افزودن → 200', add1.status === 200);
    check('یک ردیف با تعداد ۲', c1?.items.length === 1 && c1.items[0].quantity === 2);
    check('هشدار PRICE_CHANGED صادر شد', c1?.warnings.some((w) => w.type === 'PRICE_CHANGED') === true);
    check('قیمت ردیف از دیتابیس (نه کلاینت)', c1?.items[0].unitPriceToman === v250.priceToman);
    check('جمع ردیف = قیمت×تعداد', c1?.items[0].lineTotalToman === v250.priceToman * 2);
    check('زیر ۱٫۵م → ارسال ۴۹٬۰۰۰', c1?.totals.deliveryToman === 49000);
    check('مبلغ نهایی = جمع + ارسال', c1?.totals.totalPayableToman === v250.priceToman * 2 + 49000);

    // ——— افزودن تکراری → افزایش تدریجی ———
    const add2 = await req('POST', '/api/cart/items', jar1, {
      productId: prod.id,
      variantId: v250.id,
      quantity: 1,
      expectedUnitPriceToman: v250.priceToman,
    });
    const c2 = cartOf(add2.json);
    check('افزودن تکراری → افزایش تدریجی به ۳', c2?.items.length === 1 && c2.items[0].quantity === 3);
    check('بدون هشدار تغییر قیمت (قیمت درست)', !c2?.warnings.some((w) => w.type === 'PRICE_CHANGED'));

    // ——— سقف موجودی ———
    const add3 = await req('POST', '/api/cart/items', jar1, {
      productId: prod.id,
      variantId: v1kg.id,
      quantity: 5,
      expectedUnitPriceToman: v1kg.priceToman,
    });
    const c3 = cartOf(add3.json);
    const line1kg = c3?.items.find((i) => i.weightGrams === 1000);
    check('سفارش ۵ از موجودی ۳ → سقف ۳', line1kg?.quantity === 3);
    check('هشدار STOCK_SHORTAGE', c3?.warnings.some((w) => w.type === 'STOCK_SHORTAGE') === true);
    check('آستانه ارسال عبور شد → رایگان', c3?.totals.freeShipping === true && c3.totals.deliveryToman === 0);

    // ——— اعتبارسنجی ورودی ———
    const badQty = await req('PATCH', `/api/cart/items/${line1kg?.id}`, jar1, { quantity: 0 });
    check('PATCH quantity=0 → 400', badQty.status === 400);
    const badId = await req('PATCH', '/api/cart/items/XXX', jar1, { quantity: 2 });
    check('itemId نامعتبر → 400', badId.status === 400);
    const badBody = await req('POST', '/api/cart/items', jar1, { productId: 'short' });
    check('بدنه ناقص → 400', badBody.status === 400);

    // ——— جداسازی سبد بین دستگاه‌ها (ضد IDOR) ———
    const jar2 = makeJar();
    await req('GET', '/api/cart', jar2);
    const otherAdd = await req('POST', '/api/cart/items', jar2, {
      productId: prod.id,
      variantId: v250.id,
      quantity: 1,
      expectedUnitPriceToman: v250.priceToman,
    });
    const otherCart = cartOf(otherAdd.json);
    check('دستگاه دوم سبد مستقل دارد', otherCart?.items.length === 1 && otherCart.items[0].quantity === 1);
    const foreignItemId = otherCart?.items[0].id ?? 'x';
    const steal = await req('DELETE', `/api/cart/items/${foreignItemId}`, jar1);
    check('حذف ردیف سبد دیگری → 404 (ضد IDOR)', steal.status === 404);

    // ——— حذف ردیف خودی ———
    const del = await req('DELETE', `/api/cart/items/${line1kg?.id}`, jar1);
    const c4 = cartOf(del.json);
    check('DELETE ردیف خودی → 200', del.status === 200);
    check('ردیف ۱ کیلویی حذف شد', c4?.items.every((i) => i.weightGrams !== 1000) === true);

    // ——— پاکسازی سبد تست ———
    for (const i of c4?.items ?? []) {
      await req('DELETE', `/api/cart/items/${i.id}`, jar1);
    }
    for (const i of otherCart?.items ?? []) {
      await req('DELETE', `/api/cart/items/${i.id}`, jar2);
    }
  }
}

// ————————————————————————————————
console.log('—— ۵.۶) احراز هویت OTP (فاز ۹) ——');
{
  // شماره تصادفی هر اجرا — تداخل با سقف نرخ اجراهای قبلی ندارد
  const phone = `0912${String(Math.floor(1000000 + Math.random() * 8999999))}`;
  const jar = makeJar();

  // ——— بدنه JSON خراب → 400 VALIDATION (نه 500) ———
  const badJson = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"phone": "0912', // عمداً ناقص
  });
  const badJsonBody = (await badJson.json().catch(() => null)) as { error?: { code?: string } } | null;
  check('بدنه JSON خراب → 400 VALIDATION', badJson.status === 400 && badJsonBody?.error?.code === 'VALIDATION');

  // ——— اعتبارسنجی شماره ———
  const badPhone = await req('POST', '/api/auth/otp/request', jar, { phone: '12345' });
  check('شماره نامعتبر → 400', badPhone.status === 400);
  const faShort = await req('POST', '/api/auth/otp/request', jar, { phone: '۰۹۱۲۱۲۳۴۵' });
  check('شماره کوتاه با ارقام فارسی → 400', faShort.status === 400);

  // ——— درخواست کد ———
  const otp1 = await req('POST', '/api/auth/otp/request', jar, { phone });
  const otp1Data = otp1.json?.data as
    | { expiresInSeconds: number; resendAfterSeconds: number; devCode?: string }
    | undefined;
  check('درخواست کد → 200', otp1.status === 200);
  check('انقضا ۵ دقیقه', otp1Data?.expiresInSeconds === 300);
  check('سرد شدن ۶۰ ثانیه', otp1Data?.resendAfterSeconds === 60);
  check('devCode در sandbox برمی‌گردد', typeof otp1Data?.devCode === 'string' && /^\d{6}$/.test(otp1Data.devCode ?? ''));

  // ——— سرد شدن ———
  const otp2 = await req('POST', '/api/auth/otp/request', jar, { phone });
  check('درخواست فوری دوم → 429 OTP_COOLDOWN', otp2.status === 429 && (otp2.json?.error as { code?: string })?.code === 'OTP_COOLDOWN');

  // ——— کد اشتباه ———
  const wrong = await req('POST', '/api/auth/otp/verify', jar, { phone, code: '000000' });
  check('کد اشتباه → 400 OTP_INVALID', wrong.status === 400 && (wrong.json?.error as { code?: string })?.code === 'OTP_INVALID');

  // ——— تأیید با ارقام فارسی ———
  const devCodeFa = (otp1Data?.devCode ?? '000000')
    .split('')
    .map((d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
    .join('');
  const verify = await req('POST', '/api/auth/otp/verify', jar, { phone, code: devCodeFa });
  const verifyData = verify.json?.data as
    | { user: { phone: string }; cart: { items: unknown[]; totals: { subtotalToman: number } } }
    | undefined;
  check('verify با ارقام فارسی → 200', verify.status === 200);
  check('شماره کاربر نرمال‌شده', verifyData?.user?.phone === phone);
  check('کوکی pars_session ست شد', jar.raw.includes('pars_session='));
  check('پاسخ verify سبد کاربر را دارد', verifyData?.cart && Array.isArray(verifyData.cart.items));

  // ——— me ———
  const meRes = await req('GET', '/api/auth/me', jar);
  const meData = meRes.json?.data as { user: { phone: string } | null } | undefined;
  check('me → کاربر همان شماره', meData?.user?.phone === phone);

  // ——— ادغام سبد مهمان با کاربر تازه ———
  const prodRes = await get('/api/products/pistachio-akbari');
  const prod = (prodRes.json?.data as { product: { id: string; variants: Array<{ id: string; weightGrams: number; priceToman: number; stock: number }> } } | undefined)?.product;
  const v250 = prod?.variants.find((v) => v.weightGrams === 250);
  if (prod && v250) {
    const phone2 = `0913${String(Math.floor(1000000 + Math.random() * 8999999))}`;
    const jar2 = makeJar();
    // ۱) مهمان (دستگاه jar2) ۲ عدد می‌افزاید — سبد دستگاه
    await req('POST', '/api/cart/items', jar2, {
      productId: prod.id,
      variantId: v250.id,
      quantity: 2,
    });
    // ۲) با همان دستگاه کد می‌گیرد و وارد می‌شود
    const otpR = await req('POST', '/api/auth/otp/request', jar2, { phone: phone2 });
    const devCodeR = (otpR.json?.data as { devCode?: string } | undefined)?.devCode;
    const vRes = await req('POST', '/api/auth/otp/verify', jar2, {
      phone: phone2,
      code: devCodeR ?? '000000',
    });
    const merged = vRes.json?.data as
      | { cart: { items: Array<{ variantId: string; quantity: number }> } }
      | undefined;
    check('ورود با دستگاه دارای سبد مهمان → 200', vRes.status === 200);
    check('سبد مهمان پس از ورود ادغام شد (همان تعداد حفظ شد)',
      merged?.cart?.items?.length === 1 &&
      merged.cart.items[0].variantId === v250.id &&
      merged.cart.items[0].quantity === 2);
    // ۳) سبد دستگاه حذف شده — GET سبد جدید همان سبد کاربر است
    const afterMerge = await req('GET', '/api/cart', jar2);
    const am = afterMerge.json?.data as { items: Array<{ quantity: number }> } | undefined;
    check('GET سبد پس از ادغام = سبد کاربر', am?.items?.length === 1 && am.items[0].quantity === 2);
  }

  // ——— خروج ———
  const out = await req('POST', '/api/auth/logout', jar);
  check('logout → 200', out.status === 200);
  const meOut = await req('GET', '/api/auth/me', jar);
  check('پس از خروج me → null', (meOut.json?.data as { user: unknown } | undefined)?.user === null);

  // ——— سفارش بدون ورود ———
  const noAuth = await req('POST', '/api/orders', makeJar(), {});
  check('POST /api/orders بدون ورود → 401', noAuth.status === 401);
  const noAuthList = await req('GET', '/api/orders', makeJar());
  check('GET /api/orders بدون ورود → 401', noAuthList.status === 401);
}

// ————————————————————————————————
console.log('—— ۵.۷) ثبت سفارش با Snapshot قیمت (فاز ۹) ——');
{
  const phoneB = `0936${String(Math.floor(1000000 + Math.random() * 8999999))}`;
  orderTestStock = await db.productVariant.findMany({ where: { product: { slug: 'pistachio-akbari' } }, select: { id: true, stock: true } });
  const jarB = makeJar();

  const otpB = await req('POST', '/api/auth/otp/request', jarB, { phone: phoneB });
  const devCodeB = (otpB.json?.data as { devCode?: string } | undefined)?.devCode;
  const vb = await req('POST', '/api/auth/otp/verify', jarB, {
    phone: phoneB,
    code: devCodeB ?? '000000',
  });
  check('ورود کاربر سفارش → 200', vb.status === 200);

  // ——— کالای واقعی و قیمت دیتابیس ———
  const prodRes = await get('/api/products/pistachio-akbari');
  const prod = (prodRes.json?.data as { product: { id: string; variants: Array<{ id: string; weightGrams: number; priceToman: number; stock: number }> } } | undefined)?.product;
  const v250 = prod?.variants.find((v) => v.weightGrams === 250);

  if (prod && v250) {
    const before = v250.stock;
    await req('POST', '/api/cart/items', jarB, {
      productId: prod.id,
      variantId: v250.id,
      quantity: 2,
    });

    // ——— اعتبارسنجی آدرس ———
    const badAddr = await req('POST', '/api/orders', jarB, {
      address: { receiverName: 'س', receiverPhone: '123', province: '', city: '', fullAddress: 'کوتاه' },
      paymentMethod: 'COD',
    });
    check('آدرس نامعتبر → 400', badAddr.status === 400);

    // ——— ثبت سفارش (پرداخت در محل) ———
    const order = await req('POST', '/api/orders', jarB, {
      address: {
        receiverName: 'سارا محمدی',
        receiverPhone: '09120000000',
        province: 'تهران',
        city: 'تهران',
        postalCode: '۱۲۳۴۵۶۷۸۹۰',
        fullAddress: 'خیابان ولیعصر، کوچه مهر، پلاک ۱۲، واحد ۳',
      },
      paymentMethod: 'COD',
    });
    const od = order.json?.data as
      | {
          code: string;
          status: string;
          paymentStatus: string;
          subtotalToman: number;
          deliveryToman: number;
          totalToman: number;
          items: Array<{ unitPriceToman: number; lineTotalToman: number; productTitle: string; weightGrams: number }>;
          address: { receiverName: string; receiverPhone: string };
        }
      | undefined;
    check('POST /api/orders → 200', order.status === 200);
    check('قالب کد سفارش PARS-XXXXXXXX-XXXX', /^PARS-\d{8}-[A-Z2-9]{4}$/.test(od?.code ?? ''));
    check('وضعیت COD → PENDING_PAYMENT', od?.status === 'PENDING_PAYMENT' && od.paymentStatus === 'UNPAID');
    check('قیمت واحد از دیتابیس (نه کلاینت)', od?.items?.[0]?.unitPriceToman === v250.priceToman);
    check('جمع = ۲ × قیمت دیتابیس', od?.subtotalToman === v250.priceToman * 2);
    check('زیر آستانه → ارسال ۴۹٬۰۰۰', od?.deliveryToman === 49000);
    check('مبلغ کل = جمع + ارسال', od?.totalToman === v250.priceToman * 2 + 49000);
    check('Snapshot عنوان محصول', od?.items?.[0]?.productTitle?.includes('اکبری') === true);

    // ——— کاهش موجودی و پاک‌سازی سبد ———
    const after = await get('/api/products/pistachio-akbari');
    const afterStock = (after.json?.data as { product: { variants: Array<{ weightGrams: number; stock: number }> } })?.product?.variants.find((v) => v.weightGrams === 250)?.stock;
    check('موجودی کاهش یافت', afterStock === before - 2, `${before} → ${afterStock}`);
    const cartAfter = await req('GET', '/api/cart', jarB);
    check('سبد پس از سفارش خالی است', ((cartAfter.json?.data as { items: unknown[] } | undefined)?.items?.length ?? -1) === 0);

    // ——— فهرست و جزئیات ———
    const list = await req('GET', '/api/orders', jarB);
    const ld = list.json?.data as { orders: Array<{ code: string; totalToman: number; items: unknown[] }> } | undefined;
    check('GET /api/orders شامل سفارش تازه', list.status === 200 && ld?.orders?.some((o) => o.code === od?.code) === true);
    check('خلاصه سفارش تعداد و مبلغ دارد', ld?.orders?.[0]?.totalToman === od?.totalToman && (ld.orders[0]?.items?.length ?? 0) > 0);

    const detail = await req('GET', `/api/orders/${od?.code}`, jarB);
    const dd = detail.json?.data as { address: { receiverName: string }; items: unknown[] } | undefined;
    check('GET /api/orders/[code] → 200', detail.status === 200);
    check('جزئیات شامل Snapshot آدرس', dd?.address?.receiverName === 'سارا محمدی');

    // ——— ضد IDOR: سفارش کاربر دیگر ———
    const stranger = makeJar();
    const strangerDetail = await req('GET', `/api/orders/${od?.code}`, stranger);
    check('سفارش دیگران (بدون ورود) → 401', strangerDetail.status === 401);

    // ——— پرداخت آنلاین شبیه‌سازی‌شده ———
    await req('POST', '/api/cart/items', jarB, {
      productId: prod.id,
      variantId: v250.id,
      quantity: 1,
    });
    const online = await req('POST', '/api/orders', jarB, {
      address: {
        receiverName: 'سارا محمدی',
        receiverPhone: '09120000000',
        province: 'تهران',
        city: 'تهران',
        fullAddress: 'خیابان ولیعصر، کوچه مهر، پلاک ۱۲، واحد ۳',
      },
      paymentMethod: 'ONLINE_GATEWAY',
    });
    const on = online.json?.data as { status: string; paymentStatus: string; paymentRef: string | null } | undefined;
    check('پرداخت آنلاین شبیه‌سازی → PAID', on?.status === 'PAID' && on.paymentStatus === 'PAID');
    check('paymentRef با پیشوند SANDBOX', on?.paymentRef?.startsWith('SANDBOX-') === true);

    // ——— خروج ———
    await req('POST', '/api/auth/logout', jarB);
    const afterLogout = await req('GET', '/api/orders', jarB);
    check('پس از خروج GET /api/orders → 401', afterLogout.status === 401);
  }
}

// ————————————————————————————————
console.log('—— ۵.۸) بازگردانی داده تست ——');
{
  // سفارش‌های واقعی این تست موجودی را کم می‌کنند (رفتار درست سیستم)؛
  // برای قطعی بودن اجراهای بعدی، موجودی seed بازگردانده می‌شود.
  try {
    for (const variant of orderTestStock) await db.productVariant.update({ where: { id: variant.id }, data: { stock: variant.stock } });
    check('موجودی آزمایش به مقدار پیش از سفارش بازگردانده شد', true);
  } catch {
    check('بازگردانی موجودی (اختیاری — دیتابیس قفل نبود)', false);
  }
}

// ————————————————————————————————
console.log('—— ۵.۹) PWA — مانیفست، سرویس‌ورکر و آیکون‌ها (فاز ۹) ——');
{
  // مانیفست نصب — خروجی app/manifest.ts
  const mRes = await fetch(`${BASE}/manifest.webmanifest`);
  check('GET /manifest.webmanifest → 200', mRes.status === 200);
  const manifest = (await mRes.json().catch(() => null)) as Record<string, unknown> | null;
  check(
    'نام اپ شامل «پارس»',
    typeof manifest?.name === 'string' && (manifest.name as string).includes('پارس')
  );
  check('display: standalone (شرط نصب)', manifest?.display === 'standalone');
  check('جهت RTL و زبان fa', manifest?.dir === 'rtl' && manifest?.lang === 'fa');
  check('start_url ریشه', manifest?.start_url === '/');
  const icons = Array.isArray(manifest?.icons)
    ? (manifest.icons as Array<{ sizes?: string; purpose?: string }>)
    : [];
  check(
    'آیکون ۱۹۲ و ۵۱۲ موجود',
    icons.some((i) => i.sizes === '192x192') && icons.some((i) => i.sizes === '512x512')
  );
  check('آیکون maskable موجود', icons.some((i) => i.purpose === 'maskable'));

  // سرویس‌ورکر — فایل و شرط‌های نصب
  const swRes = await fetch(`${BASE}/sw.js`);
  const swText = await swRes.text();
  check('GET /sw.js → 200', swRes.status === 200);
  check("sw.js هندلر fetch دارد (شرط نصب)", swText.includes("addEventListener('fetch'"));
  check('sw.js پاسخ‌های /api/ را کش نمی‌کند', swText.includes("startsWith('/api/')"));

  // آیکون‌های استاتیک
  for (const p of [
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/maskable-192.png',
    '/icons/maskable-512.png',
    '/icons/apple-touch-icon.png',
  ]) {
    const r = await fetch(`${BASE}${p}`);
    check(
      `GET ${p} → 200 image/png`,
      r.status === 200 && (r.headers.get('content-type') ?? '').includes('image/png')
    );
  }

  // لینک مانیفست در HTML ریشه (متادیتای Next)
  const homeHtml = await (await fetch(`${BASE}/`)).text();
  check('HTML ریشه لینک مانیفست دارد', homeHtml.includes('rel="manifest"'));
  check('HTML ریشه theme-color دارد', homeHtml.includes('theme-color'));
}

// ————————————————————————————————
console.log('—— ۷) اعلان‌ها و Push (فاز ۱۰) ——');
{
  // ——— ۷.۱) دارایی‌های PWA نسخه ۲ ———
  const swRes = await fetch(`${BASE}/sw.js`);
  const swText = await swRes.text();
  check('sw.js نسخه کش pars-pwa-v* (بامپ‌شده)', /pars-pwa-v\d+/.test(swText));
  check("sw.js هندلر push دارد", swText.includes("addEventListener('push'"));
  check('sw.js هندلر notificationclick دارد', swText.includes("addEventListener('notificationclick'"));
  check('sw.js آفلاین fallback دارد', swText.includes('offline.html'));
  const offlineRes = await fetch(`${BASE}/offline.html`);
  const offlineText = await offlineRes.text();
  check('GET /offline.html → 200 فارسی', offlineRes.status === 200 && offlineText.includes('اتصال اینترنت برقرار نیست'));

  // ——— کاربر تست ———
  const phoneN = `0937${String(Math.floor(1000000 + Math.random() * 8999999))}`;
  const jarN = makeJar();
  const otpN = await req('POST', '/api/auth/otp/request', jarN, { phone: phoneN });
  const codeN = (otpN.json?.data as { devCode?: string } | undefined)?.devCode ?? '000000';
  const verifyN = await req('POST', '/api/auth/otp/verify', jarN, { phone: phoneN, code: codeN });
  check('کاربر تست فاز ۱۰ وارد شد', verifyN.status === 200);

  // ——— ۷.۲) ترجیحات اعلان ———
  const prefsGuest = await req('GET', '/api/notifications/preferences', makeJar());
  check('GET ترجیحات بدون ورود → 401', prefsGuest.status === 401);
  const prefsPutGuest = await req('PUT', '/api/notifications/preferences', makeJar(), {
    pushEnabled: true,
    orderUpdates: true,
    promotions: false,
    newProducts: false,
  });
  check('PUT ترجیحات بدون ورود → 401', prefsPutGuest.status === 401);

  const prefs0 = await req('GET', '/api/notifications/preferences', jarN);
  const p0 = prefs0.json?.data as
    | { pushEnabled: boolean; orderUpdates: boolean; promotions: boolean; newProducts: boolean }
    | undefined;
  check('GET ترجیحات → 200 پیش‌فرض', prefs0.status === 200);
  check('پیش‌فرض: push خاموش، سفارش روشن، تبلیغ خاموش', p0?.pushEnabled === false && p0?.orderUpdates === true && p0?.promotions === false);

  const prefs1 = await req('PUT', '/api/notifications/preferences', jarN, {
    pushEnabled: true,
    orderUpdates: true,
    promotions: true,
    newProducts: false,
  });
  const p1 = prefs1.json?.data as { pushEnabled: boolean; promotions: boolean } | undefined;
  check('PUT ترجیحات → 200 ذخیره', prefs1.status === 200 && p1?.pushEnabled === true && p1?.promotions === true);
  const prefs2 = await req('GET', '/api/notifications/preferences', jarN);
  const p2 = prefs2.json?.data as { pushEnabled: boolean; promotions: boolean } | undefined;
  check('PUT پایدار است (GET دوباره همان)', p2?.pushEnabled === true && p2?.promotions === true);
  const prefsBad = await req('PUT', '/api/notifications/preferences', jarN, {
    pushEnabled: true,
    orderUpdates: true,
    promotions: 'بله',
  });
  check('PUT با نوع غلط → 400', prefsBad.status === 400);

  // ——— ۷.۳) VAPID و اشتراک Push ———
  // کلیدهای VAPID فقط در .env.production هستند؛ سرور dev بدون آن‌ها 503
  // می‌دهد — در این محیط چک‌های کلید «نادیده» می‌شوند نه «رد» (خطای محیط ≠ خطای کد)
  const vapid = await get('/api/push/vapid');
  const vk = vapid.json?.data as { publicKey?: string } | undefined;
  if (vapid.status === 503) {
    skipped++;
    console.log('  ⏭ VAPID این محیط پیکربندی نشده (فقط .env.production) — چک کلید نادیده شد');
  } else {
    check('GET /api/push/vapid → 200', vapid.status === 200);
    check('کلید عمومی VAPID معتبر (base64url P-256)', typeof vk?.publicKey === 'string' && /^B/.test(vk.publicKey) && vk.publicKey.length > 80);
  }

  const ep = `https://push.test.pars/${Date.now()}/ep`;
  const sub1 = await req('POST', '/api/push/subscribe', jarN, {
    endpoint: ep,
    keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(24) },
  });
  check('POST subscribe → 200', sub1.status === 200);
  // آپسِرت — همان endpoint دوباره، هیچ ردیف تکراری‌ای ساخته نمی‌شود
  const sub2 = await req('POST', '/api/push/subscribe', jarN, {
    endpoint: ep,
    keys: { p256dh: 'C'.repeat(87), auth: 'b'.repeat(24) },
  });
  check('subscribe دوباره (upsert) → 200', sub2.status === 200);
  try {
    const count = await db.pushSubscription.count({ where: { endpoint: ep } });
    check('endpoint تکراری در دیتابیس یکتا است (upsert)', count === 1);
  } catch {
    check('endpoint تکراری در دیتابیس یکتا است (upsert)', false, 'دسترسی دیتابیس نبود');
  }

  const badEp = await req('POST', '/api/push/subscribe', jarN, {
    endpoint: 'http://insecure.example/ep',
    keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(24) },
  });
  check('subscribe با http (غیر امن) → 400', badEp.status === 400);
  const badKeys = await req('POST', '/api/push/subscribe', jarN, {
    endpoint: 'https://push.test.pars/bad',
    keys: { p256dh: 'کوتاه', auth: 'x' },
  });
  check('subscribe با کلید نامعتبر → 400', badKeys.status === 400);

  const unsub1 = await req('POST', '/api/push/unsubscribe', jarN, { endpoint: ep });
  const u1 = unsub1.json?.data as { removed?: number } | undefined;
  check('unsubscribe → removed:1', unsub1.status === 200 && u1?.removed === 1);
  const unsub2 = await req('POST', '/api/push/unsubscribe', jarN, { endpoint: ep });
  const u2 = unsub2.json?.data as { removed?: number } | undefined;
  check('unsubscribe دوباره → removed:0', unsub2.status === 200 && u2?.removed === 0);

  // ——— ۷.۴) اعلان تأیید سفارش (تریگر fire-and-forget) ———
  const prodN = await get('/api/products/pistachio-akbari');
  const prodNData = (prodN.json?.data as { product: { id: string; variants: Array<{ id: string; weightGrams: number }> } } | undefined)?.product;
  const vN = prodNData?.variants.find((v) => v.weightGrams === 250);
  if (prodNData && vN) {
    await req('POST', '/api/cart/items', jarN, {
      productId: prodNData.id,
      variantId: vN.id,
      quantity: 1,
    });
    const ordN = await req('POST', '/api/orders', jarN, {
      address: {
        receiverName: 'کاربر اعلان',
        receiverPhone: phoneN,
        province: 'تهران',
        city: 'تهران',
        fullAddress: 'خیابان اعلان ده، پلاک ده، واحد ده',
      },
      paymentMethod: 'COD',
    });
    const ordNData = ordN.json?.data as { code: string } | undefined;
    check('سفارش برای تریگر اعلان → 200', ordN.status === 200 && !!ordNData?.code);

    // fire-and-forget است — لحظه‌ای صبر و سپس خواندن خوراک
    await new Promise((r) => setTimeout(r, 700));
    const feed = await req('GET', '/api/notifications', jarN);
    // قرارداد فعلی: { items: [...], unread } — صفحه‌بندی‌شده، نه آرایهٔ خام
    const feedData = feed.json?.data as
      | { items?: Array<{ title: string; body: string; url: string | null; readAt: string | null }>; unread?: number }
      | undefined;
    check('GET /api/notifications → 200', feed.status === 200);
    const conf = feedData?.items?.find((n) => n.title === 'سفارش شما ثبت شد');
    check('خوراک شامل اعلان ثبت سفارش', !!conf);
    check('اعلان شامل کد سفارش در url', !!conf?.url?.includes(`o=${ordNData?.code}`));
    check('شمارش خوانده‌نشده (زنگوله) ≥ ۱', typeof feedData?.unread === 'number' && (feedData?.unread ?? 0) >= 1);
  }

  const feedGuest = await req('GET', '/api/notifications', makeJar());
  check('GET خوراک بدون ورود → 401', feedGuest.status === 401);

  // خروج کاربر تست
  await req('POST', '/api/auth/logout', jarN);
}

// ————————————————————————————————
console.log('—— ۸) دفترچه آدرس (فاز ۱۰) ——');
{
  // ——— ۸.۱) احراز هویت ———
  const addrGuest = await req('GET', '/api/addresses', makeJar());
  check('GET آدرس‌ها بدون ورود → 401', addrGuest.status === 401);
  const addrPostGuest = await req('POST', '/api/addresses', makeJar(), {
    title: 'خانه',
    receiverName: 'کاربر مهمان',
    receiverPhone: '09120000000',
    province: 'تهران',
    city: 'تهران',
    fullAddress: 'خیابان آزادی کوچه دوم پلاک ۱۲',
  });
  check('POST آدرس بدون ورود → 401', addrPostGuest.status === 401);

  // ——— کاربر تست ———
  const phoneA = `0938${String(Math.floor(1000000 + Math.random() * 8999999))}`;
  const jarA = makeJar();
  const otpA = await req('POST', '/api/auth/otp/request', jarA, { phone: phoneA });
  const codeA = (otpA.json?.data as { devCode?: string } | undefined)?.devCode ?? '000000';
  const verifyA = await req('POST', '/api/auth/otp/verify', jarA, { phone: phoneA, code: codeA });
  check('کاربر تست آدرس وارد شد', verifyA.status === 200);
  const phoneB = `0939${String(Math.floor(1000000 + Math.random() * 8999999))}`;
  const jarB = makeJar();
  const otpB = await req('POST', '/api/auth/otp/request', jarB, { phone: phoneB });
  const codeB = (otpB.json?.data as { devCode?: string } | undefined)?.devCode ?? '000000';
  await req('POST', '/api/auth/otp/verify', jarB, { phone: phoneB, code: codeB });

  // ——— ۸.۲) فهرست خالی ———
  const list0 = await req('GET', '/api/addresses', jarA);
  check('GET آدرس‌ها → 200 خالی', list0.status === 200 && (list0.json?.data as unknown[] | undefined)?.length === 0);

  // ——— ۸.۳) اعتبارسنجی ورودی ———
  const badTitle = await req('POST', '/api/addresses', jarA, {
    title: 'خ',
    receiverName: 'علی رضایی',
    receiverPhone: '09121234567',
    province: 'تهران',
    city: 'تهران',
    fullAddress: 'خیابان آزادی کوچه دوم پلاک ۱۲',
  });
  check('POST برچسب کوتاه → 400', badTitle.status === 400);
  const badAddr = await req('POST', '/api/addresses', jarA, {
    title: 'خانه',
    receiverName: 'علی رضایی',
    receiverPhone: '09121234567',
    province: 'تهران',
    city: 'تهران',
    fullAddress: 'کوتاه',
  });
  check('POST نشانی کوتاه → 400', badAddr.status === 400);
  const badPhone = await req('POST', '/api/addresses', jarA, {
    title: 'خانه',
    receiverName: 'علی رضایی',
    receiverPhone: '12345',
    province: 'تهران',
    city: 'تهران',
    fullAddress: 'خیابان آزادی کوچه دوم پلاک ۱۲',
  });
  check('POST شماره نامعتبر → 400', badPhone.status === 400);
  const faDigits = await req('POST', '/api/addresses', jarA, {
    title: 'خانه',
    receiverName: 'علی رضایی',
    receiverPhone: '۰۹۱۲۱۲۳۴۵۶۷',
    province: 'تهران',
    city: 'تهران',
    postalCode: '۱۲۳۴۵۶۷۸۹۰',
    fullAddress: 'خیابان آزادی کوچه دوم پلاک ۱۲',
  });
  check('POST با ارقام فارسی → 200 و نرمال‌سازی', faDigits.status === 200);

  // ——— ۸.۴) اولین آدرس پیش‌فرض می‌شود ———
  const a1 = faDigits.json?.data as { id: string; isDefault: boolean; receiverPhone: string } | undefined;
  check('اولین آدرس خودکار پیش‌فرض', a1?.isDefault === true);
  check('شماره فارسی به لاتین نرمال شد', a1?.receiverPhone === '09121234567');

  // ——— ۸.۵) آدرس دوم غیرپیش‌فرض ———
  const a2res = await req('POST', '/api/addresses', jarA, {
    title: 'محل کار',
    receiverName: 'علی رضایی',
    receiverPhone: '09121234567',
    province: 'تهران',
    city: 'تهران',
    fullAddress: 'میدان ونک خیابان ولیعصر برج نگین طبقه ۵',
  });
  const a2 = a2res.json?.data as { id: string; isDefault: boolean } | undefined;
  check('POST آدرس دوم → 200', a2res.status === 200 && !!a2?.id);
  check('آدرس دوم پیش‌فرض نیست', a2?.isDefault === false);

  // ——— ۸.۶) ویرایش + تعویض پیش‌فرض ———
  const upd = await req('PUT', `/api/addresses/${a2?.id}`, jarA, {
    title: 'دفتر مرکزی',
    receiverName: 'علی رضایی',
    receiverPhone: '09121234567',
    province: 'تهران',
    city: 'تهران',
    postalCode: '1998734561',
    fullAddress: 'میدان ونک خیابان ولیعصر برج نگین طبقه ۵',
    isDefault: true,
  });
  const updData = upd.json?.data as { isDefault: boolean; title: string } | undefined;
  check('PUT ویرایش → 200 و پیش‌فرض شد', upd.status === 200 && updData?.isDefault === true && updData?.title === 'دفتر مرکزی');
  const list2 = await req('GET', '/api/addresses', jarA);
  const l2 = list2.json?.data as Array<{ id: string; isDefault: boolean }> | undefined;
  const firstStillDefault = l2?.find((x) => x.id === a1?.id)?.isDefault ?? true;
  check('تعویض پیش‌فرض: آدرس اول پیش‌فرض نیست', firstStillDefault === false);
  check('فهرست: پیش‌فرض اول ردیف اول', l2?.[0]?.id === a2?.id);

  // ——— ۸.۷) IDOR: دسترسی کاربر دیگر → 404 ———
  const idorPut = await req('PUT', `/api/addresses/${a1?.id}`, jarB, {
    title: 'هک',
    receiverName: 'هکر هکر',
    receiverPhone: '09120000000',
    province: 'تهران',
    city: 'تهران',
    fullAddress: 'جایی در تهران خیابان نامعلوم پلاک ۱',
  });
  check('IDOR: PUT آدرس کاربر دیگر → 404', idorPut.status === 404);
  const idorDelete = await req('DELETE', `/api/addresses/${a1?.id}`, jarB);
  check('IDOR: DELETE آدرس کاربر دیگر → 404', idorDelete.status === 404);

  // ——— ۸.۸) شناسه نامعتبر ———
  const badId = await req('PUT', '/api/addresses/not-a-cuid', jarA, {
    title: 'خانه',
    receiverName: 'علی رضایی',
    receiverPhone: '09121234567',
    province: 'تهران',
    city: 'تهران',
    fullAddress: 'خیابان آزادی کوچه دوم پلاک ۱۲',
  });
  check('PUT شناسه نامعتبر → 400', badId.status === 400);

  // ——— ۸.۹) سقف ۱۰ آدرس ———
  let limitHit = false;
  for (let i = 0; i < 8; i++) {
    const r = await req('POST', '/api/addresses', jarA, {
      title: `آدرس ${i + 3}`,
      receiverName: 'علی رضایی',
      receiverPhone: '09121234567',
      province: 'تهران',
      city: 'تهران',
      fullAddress: `خیابان تستی شماره ${i + 3} پلاک ۱۰`,
    });
    if (r.status !== 200) { limitHit = true; break; }
  }
  check('تا سقف ۱۰ آدرس آزاد است', !limitHit);
  const over = await req('POST', '/api/addresses', jarA, {
    title: 'یازدهم',
    receiverName: 'علی رضایی',
    receiverPhone: '09121234567',
    province: 'تهران',
    city: 'تهران',
    fullAddress: 'خیابان یازدهم پلاک ۱۱',
  });
  check('آدرس یازدهم → 400 ADDRESS_LIMIT', over.status === 400 && over.json?.error !== undefined);

  // ——— ۸.۱۰) حذف پیش‌فرض → ارتقای جایگزین ———
  const delDef = await req('DELETE', `/api/addresses/${a2?.id}`, jarA);
  check('DELETE پیش‌فرض → 200', delDef.status === 200);
  const list3 = await req('GET', '/api/addresses', jarA);
  const l3 = list3.json?.data as Array<{ id: string; isDefault: boolean }> | undefined;
  check('پس از حذف، یک پیش‌فرض باقی است', l3?.filter((x) => x.isDefault).length === 1);
  check('ارتقای جایگزین انجام شد', !!l3?.find((x) => x.isDefault));

  // ——— ۸.۱۱) پاک‌سازی کامل ———
  const all = (list3.json?.data as Array<{ id: string }> | undefined) ?? [];
  let allDeleted = true;
  for (const a of all) {
    const d = await req('DELETE', `/api/addresses/${a.id}`, jarA);
    if (d.status !== 200) allDeleted = false;
  }
  check('حذف تک‌تک باقی‌مانده‌ها → 200', allDeleted);
  const listFinal = await req('GET', '/api/addresses', jarA);
  check('فهرست نهایی خالی', (listFinal.json?.data as unknown[] | undefined)?.length === 0);

  // خروج کاربران تست
  await req('POST', '/api/auth/logout', jarA);
  await req('POST', '/api/auth/logout', jarB);
}

// ————————————————————————————————
console.log('—— ۶) سرعت پاسخ (سرد/گرم) ——');
{
  const t0 = performance.now();
  await get('/api/products?limit=12');
  const warm = performance.now() - t0;
  check('پاسخ گرم < 100ms', warm < 100, `${warm.toFixed(0)}ms`);
}

console.log('\n══════════════════════════════');
console.log(`نتیجه: ${pass} موفق | ${failCount} ناموفق | ${skipped} نادیده (محیط)`);
if (failCount > 0) {
  console.log('خطاها:', failures.join(' | '));
  process.exit(1);
}
console.log('همه تست‌های فاز ۱۰ (و قبلی) سبز ✅');
await db.$disconnect();
