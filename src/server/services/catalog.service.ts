import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { parseProductAttributes } from '@/lib/product-attributes';
import type { ProductQuery } from '@/server/validators/catalog.schema';
import { customerVariants } from '@/server/lib/customer-pricing';

/**
 * سرویس کاتالوگ (فاز ۵)
 *
 * قانون ضد N+1 (اثبات‌شده با آزمون رشد limit در فاز ۵):
 * - همه لیست‌ها با یک findMany و select صریح (هیچ‌گاه SELECT *) می‌آیند.
 * - داده‌های وابسته (تصویر، دسته، واریانت‌ها) با select داخل همان findMany با
 *   batch-IN fetch می‌شوند — تعداد دستور SQL ثابت است و با تعداد ردیف‌ها رشد نمی‌کند
 *   (اندازه‌گیری: limit=1/12/24 → همیشه ۶ دستور).
 * - اعداد زیر «دستور SQL اندازه‌گیری‌شده در dev.log» هستند، نه صرفاً ادعا.
 */

// ------------------------------------------------------------
// انتخاب صریح «کارت محصول» — واحد مشترک لیست‌ها و جستجو
// ------------------------------------------------------------
export const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  shortDescription: true,
  salesCount: true,
  ratingSum: true,
  ratingCount: true,
  isSuggested: true,
  category: { select: { slug: true, title: true } },
  images: {
    select: { url: true, alt: true },
    orderBy: { sortOrder: Prisma.SortOrder.asc },
    take: 1,
  },
  variants: {
    where: { isActive: true },
    orderBy: { weightGrams: Prisma.SortOrder.asc },
    select: {
      id: true,
      weightGrams: true,
      priceToman: true,
      isWholesale: true,
      pricePerKgToman: true,
      compareAtPriceToman: true,
      stock: true,
    },
  },
} satisfies Prisma.ProductSelect;

export type ProductRow = Prisma.ProductGetPayload<{ select: typeof CARD_SELECT }>;

/** DTO کارت محصول — هم‌شکل استفاده در UI (فاز ۶) */
export interface ProductCardDTO {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  image: { url: string; alt: string | null } | null;
  category: { slug: string; title: string };
  rating: number;
  ratingCount: number;
  salesCount: number;
  isSuggested: boolean;
  /** واریانت‌های فعال — انتخابگر وزن روی کارت بدون درخواست اضافه کار می‌کند */
  variants: Array<{
    id: string;
    weightGrams: number;
    priceToman: number;
    compareAtPriceToman: number | null;
    stock: number;
    isWholesale: boolean;
    pricePerKgToman: number | null;
  }>;
  /** محدوده قیمت از ارزان‌ترین تا گران‌ترین واریانت فعال */
  minPriceToman: number;
  maxPriceToman: number;
  hasDiscount: boolean;
  /** بیشترین درصد تخفیف بین واریانت‌ها (برای بج قرمز/طلایی کارت) */
  maxDiscountPercent: number;
  totalStock: number;
}

export function toCardDTO(p: ProductRow, role?: string): ProductCardDTO {
  const variants = customerVariants(p.variants, role);
  const prices = variants.map((v) => v.priceToman);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  let maxDiscountPercent = 0;
  for (const v of variants) {
    if (v.compareAtPriceToman && v.compareAtPriceToman > v.priceToman) {
      const pct = Math.round(
        ((v.compareAtPriceToman - v.priceToman) / v.compareAtPriceToman) * 100
      );
      if (pct > maxDiscountPercent) maxDiscountPercent = pct;
    }
  }

  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    shortDescription: p.shortDescription,
    image: p.images[0] ?? null,
    category: p.category,
    rating: p.ratingCount > 0 ? Number((p.ratingSum / p.ratingCount).toFixed(1)) : 0,
    ratingCount: p.ratingCount,
    salesCount: p.salesCount,
    isSuggested: p.isSuggested,
    variants,
    minPriceToman: minPrice,
    maxPriceToman: maxPrice,
    hasDiscount: maxDiscountPercent > 0,
    maxDiscountPercent,
    totalStock: variants.reduce((s, v) => s + v.stock, 0),
  };
}

// ------------------------------------------------------------
// دسته‌بندی‌ها — اندازه‌گیری: ۲ دستور SQL ثابت (main + count زیرپرسش)
// ------------------------------------------------------------
export async function getCategories() {
  const rows = await db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      imageUrl: true,
      sortOrder: true,
      _count: {
        select: { products: { where: { isActive: true } } },
      },
    },
  });

  return {
    items: rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      imageUrl: c.imageUrl,
      productCount: c._count.products,
    })),
  };
}

// ------------------------------------------------------------
// لیست محصولات با بخش/مرتب‌سازی/صفحه‌بندی
// اندازه‌گیری واقعی (dev.log، بدون رشد با limit):
//   مسیر استاندارد: ۶ دستور ثابت (ids + count + صفحه: main/دسته/تصویر/واریانت)
//   مرتب‌سازی قیمتی: ۶ دستور ثابت (minPrice همه + صفحه کامل؛ منطق JS —
//   در رشد کاتالوگ به GROUP BY مهاجرت می‌کند — یادداشت فاز ۱۳)
// ------------------------------------------------------------
export async function getProducts(q: ProductQuery, role?: string) {
  const where: Prisma.ProductWhereInput = { isActive: true };

  if (q.category) where.category = { slug: q.category };
  if (q.section === 'suggested') where.isSuggested = true;
  if (q.section === 'discounted') {
    where.variants = {
      some: { isActive: true, compareAtPriceToman: { not: null } },
    };
  }

  const skip = (q.page - 1) * q.limit;

  // ——— مسیر مرتب‌سازی قیمتی: minPrice همه نتایج → مرتب‌سازی JS → صفحه ———
  if (q.sort === 'cheap' || q.sort === 'expensive') {
    const all = await db.product.findMany({
      where,
      select: { id: true, variants: { where: { isActive: true }, select: { priceToman: true, pricePerKgToman: true, isWholesale: true } } },
    });
    const withPrice = all
      .map((p) => ({
        id: p.id,
        min: customerVariants(p.variants, role).length ? Math.min(...customerVariants(p.variants, role).map((v) => v.isWholesale ? v.pricePerKgToman ?? v.priceToman : v.priceToman)) : Infinity,
      }))
      .sort((a, b) => (q.sort === 'cheap' ? a.min - b.min : b.min - a.min));

    const total = withPrice.length;
    const pageIds = withPrice.slice(skip, skip + q.limit).map((x) => x.id);
    const rows = pageIds.length
      ? await db.product.findMany({
          where: { id: { in: pageIds }, isActive: true },
          select: CARD_SELECT,
        })
      : [];
    // حفظ ترتیب مرتب‌سازی قیمتی
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = pageIds.map((id) => byId.get(id)).filter((r): r is ProductRow => !!r);

    return {
      items: items.map((product) => toCardDTO(product, role)),
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
      hasMore: skip + q.limit < total,
    };
  }

  // ——— مسیر استاندارد: orderBy در SQL ———
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    q.section === 'bestseller' || (q.section === 'all' && q.sort === 'popular')
      ? { salesCount: 'desc' }
      : q.sort === 'newest' || q.section === 'new'
        ? { createdAt: 'desc' }
        : { salesCount: 'desc' };

  // کوئری ids صفحه فعلی + شمارش کل به‌موازات (پرش به داده سنگین فقط بعداً)
  const [idRows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy,
      select: { id: true },
      take: q.limit,
      skip,
    }),
    db.product.count({ where }),
  ]);

  const pageIds = idRows.map((r) => r.id);
  const rows = pageIds.length
    ? await db.product.findMany({
        where: { id: { in: pageIds }, isActive: true },
        select: CARD_SELECT,
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = pageIds.map((id) => byId.get(id)).filter((r): r is ProductRow => !!r);

  return {
    items: items.map((product) => toCardDTO(product, role)),
    total,
    page: q.page,
    limit: q.limit,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
    hasMore: skip + q.limit < total,
  };
}

// ------------------------------------------------------------
// جزئیات محصول + مرتبط‌ها — اندازه‌گیری: ۸ دستور SQL ثابت (۴ جزئیات + ۴ مرتبط)
// ------------------------------------------------------------
export async function getProductDetail(slug: string, role?: string) {
  const p = await db.product.findUnique({
    where: { slug },
    select: {
      ...CARD_SELECT,
      isActive: true,
      description: true,
      attributes: true,
      createdAt: true,
      images: {
        select: { url: true, alt: true },
        orderBy: { sortOrder: Prisma.SortOrder.asc },
      },
      variants: {
        where: { isActive: true },
        orderBy: { weightGrams: Prisma.SortOrder.asc },
        select: {
          id: true,
          weightGrams: true,
          priceToman: true,
          isWholesale: true,
          pricePerKgToman: true,
          compareAtPriceToman: true,
          stock: true,
          sku: true,
        },
      },
      category: { select: { slug: true, title: true, id: true } },
    },
  });

  if (!p || !p.isActive) throw ApiError.notFound('محصول یافت نشد');

  // محصولات مرتبط: همان دسته، پرفروش‌تر، بدون خود محصول
  const relatedRows = await db.product.findMany({
    where: { categoryId: p.category.id, isActive: true, id: { not: p.id } },
    orderBy: { salesCount: 'desc' },
    take: 4,
    select: CARD_SELECT,
  });

  const attributes = parseProductAttributes(p.attributes).map(({ key, value }) => ({ k: key, v: value }));

  const detail = {
    ...toCardDTO(p, role),
    // گالری کامل تصاویر (به ترتیب sortOrder) — تصویر اول همان «image» کارت است
    images: p.images,
    description: p.description,
    attributes,
    skuFirst: customerVariants(p.variants, role)[0]?.sku ?? null,
  };

  return { product: detail, related: relatedRows.map((product) => toCardDTO(product, role)) };
}
