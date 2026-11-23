import { revalidateStoreCache, CACHE_TAGS } from '@/server/lib/cache-tags';
import { db } from '@/lib/db';
import { parseProductAttributes } from '@/lib/product-attributes';
import { ApiError } from '@/server/lib/api';
import {
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
} from '@/server/validators/admin.schema';
import { buildSearchText, isUniqueViolation, pageOffset } from './shared';
import type { z } from 'zod';

/**
 * مدیریت محصولات (فاز ۱۴) — CRUD کامل با واریانت وزنی و تصاویر
 *
 * قواعد کلیدی:
 * - searchText همیشه سمت سرور با normalizePersian بازسازی می‌شود (جستجوی فارسی)
 * - واریانت‌ها upsert بر اساس weightGrams — حذف واریانتِ سفارش‌دار مجاز نیست
 *   (Restrict از OrderItem) → به‌جای حذف، غیرفعال می‌شود تا تاریخ سفارش نشکند
 * - تصاویر هر بار کامل جایگزین می‌شوند (ارجاع FK ندارند)
 * - حذف محصول با تاریخچه سفارش → 409 CONFLICT (پیشنهاد: غیرفعال‌سازی)
 */

type ProductCreateInput = z.infer<typeof productCreateSchema>;
type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
type ProductListQuery = z.infer<typeof productListQuerySchema>;

const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  shortDescription: true,
  isSuggested: true,
  isActive: true,
  salesCount: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, title: true, slug: true } },
  images: { orderBy: { sortOrder: 'asc' as const }, select: { url: true, alt: true } },
  variants: {
    orderBy: { weightGrams: 'asc' as const },
    select: {
      id: true,
      weightGrams: true,
      priceToman: true,
      isWholesale: true,
      pricePerKgToman: true,
      compareAtPriceToman: true,
      sku: true,
      stock: true,
      isActive: true,
    },
  },
  _count: { select: { orderItems: true, reviews: true } },
} as const;

/** فهرست محصولات با جستجو، فیلتر دسته/وضعیت و صفحه‌بندی — Expected queries: ۲ */
export async function listAdminProducts(query: ProductListQuery) {
  const where = {
    AND: [
      query.q
        ? {
            OR: [
              { title: { contains: query.q } },
              { slug: { contains: query.q } },
            ],
          }
        : {},
      query.categoryId && query.categoryId !== 'all' ? { categoryId: query.categoryId } : {},
      query.status === 'active' ? { isActive: true } : {},
      query.status === 'inactive' ? { isActive: false } : {},
    ],
  };

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: query.pageSize,
      skip: pageOffset(query.page, query.pageSize),
    }),
    db.product.count({ where }),
  ]);

  return { products: rows, total, page: query.page, pageSize: query.pageSize };
}

/** جزئیات یک محصول برای ویرایش — شامل همه فیلدها */
export async function getAdminProduct(id: string) {
  const product = await db.product.findUnique({
    where: { id },
    select: {
      ...LIST_SELECT,
      description: true,
      attributes: true,
    },
  });
  if (!product) throw ApiError.notFound('محصول یافت نشد');
  return { product };
}

async function assertCategoryExists(categoryId: string) {
  const cat = await db.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!cat) throw new ApiError(400, 'VALIDATION', 'دسته‌بندی انتخابی وجود ندارد');
}

async function assertSlugFree(slug: string, excludeId?: string) {
  const existing = await db.product.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing && existing.id !== excludeId) {
    throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');
  }
}

/** ساخت محصول + واریانت‌ها + تصاویر در یک تراکنش */
export async function createAdminProduct(input: ProductCreateInput) {
  revalidateStoreCache(CACHE_TAGS.HOME, CACHE_TAGS.FEED);

  await assertCategoryExists(input.categoryId);
  await assertSlugFree(input.slug);

  const category = await db.category.findUnique({
    where: { id: input.categoryId },
    select: { title: true },
  });

  const searchText = buildSearchText(
    [input.title, input.shortDescription, input.description],
    input.attributes,
    category?.title
  );

  const product = await db.product.create({
    data: {
      slug: input.slug,
      title: input.title,
      categoryId: input.categoryId,
      shortDescription: input.shortDescription ?? null,
      description: input.description ?? null,
      attributes: JSON.stringify(input.attributes),
      searchText,
      isSuggested: input.isSuggested,
      isActive: input.isActive,
      images: {
        create: input.images.map((img, i) => ({
          url: img.url,
          alt: img.alt ?? null,
          sortOrder: i,
        })),
      },
      variants: { create: [
        ...input.variants.map((variant) => ({ ...toVariantData(variant), isWholesale: false })),
        ...(input.wholesale ? [{ ...wholesaleVariantData(input.wholesale), isWholesale: true, compareAtPriceToman: null }] : []),
      ] },
    },
    select: { id: true, slug: true },
  });
  return { product };
}

function toVariantData(v: ProductCreateInput['variants'][number]) {
  return {
    weightGrams: v.weightGrams,
    priceToman: v.priceToman,
    compareAtPriceToman:
      v.compareAtPriceToman && v.compareAtPriceToman > v.priceToman
        ? v.compareAtPriceToman
        : null,
    sku: v.sku ?? null,
    stock: v.stock,
    isActive: v.isActive,
  };
}

function wholesaleVariantData(value: NonNullable<ProductCreateInput['wholesale']>) {
  const priceToman = Math.round(value.pricePerKgToman * value.weightGrams / 1000);
  if (priceToman > 2_000_000_000) throw new ApiError(400, 'VALIDATION', 'مبلغ حداقل خرید عمده بیش از حد مجاز است');
  return { ...value, priceToman };
}

/**
 * ویرایش محصول — فیلدهای متن + بازسازی واریانت‌ها/تصاویر در یک تراکنش.
 * واریانت‌ها upsert بر اساس weightGrams؛ واریانت سفارش‌دار قابل حذف نیست
 * (Restrict) → غیرفعال می‌شود.
 */
export async function updateAdminProduct(id: string, input: ProductUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.HOME, CACHE_TAGS.FEED);

  const current = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      categoryId: true,
      slug: true,
      title: true,
      shortDescription: true,
      description: true,
      variants: { select: { id: true, weightGrams: true, isWholesale: true } },
    },
  });
  if (!current) throw ApiError.notFound('محصول یافت نشد');

  const categoryId = input.categoryId ?? current.categoryId;
  if (input.categoryId && input.categoryId !== current.categoryId) {
    await assertCategoryExists(input.categoryId);
  }
  if (input.slug && input.slug !== current.slug) {
    await assertSlugFree(input.slug, id);
  }

  // ——— ساخت متن جستجو از مقادیر نهایی ———
  const [category, parsedAttrs] = await Promise.all([
    db.category.findUnique({ where: { id: categoryId }, select: { title: true } }),
    input.attributes !== undefined
      ? Promise.resolve(input.attributes)
      : db.product
          .findUnique({ where: { id }, select: { attributes: true } })
          .then((p) => parseProductAttributes(p?.attributes)),
  ]);

  const title = input.title ?? current.title;
  const shortDescription = input.shortDescription !== undefined ? input.shortDescription : current.shortDescription;
  const description = input.description !== undefined ? input.description : current.description;
  const searchText = buildSearchText([title, shortDescription, description], parsedAttrs, category?.title);

  const updated = await db.$transaction(async (tx) => {
    // ——— واریانت‌ها: upsert بر اساس وزن ———
    if (input.variants) {
      const incomingWeights = new Set(input.variants.map((v) => v.weightGrams));
      for (const v of input.variants) {
        const existing = current.variants.find((e) => !e.isWholesale && e.weightGrams === v.weightGrams);
        if (existing) {
          await tx.productVariant.update({
            where: { id: existing.id },
            data: toVariantData(v),
          });
        } else {
          await tx.productVariant.create({
            data: { ...toVariantData(v), productId: id, isWholesale: false },
          });
        }
      }
      // واریانت‌هایی که در ورودی نیستند → غیرفعال (حذف فقط اگر بدون ارجاع)
      for (const e of current.variants) {
        if (e.isWholesale) continue;
        if (incomingWeights.has(e.weightGrams)) continue;
        try {
          await tx.productVariant.delete({ where: { id: e.id } });
        } catch {
          await tx.productVariant.update({
            where: { id: e.id },
            data: { isActive: false },
          });
        }
      }
    }

    if (input.wholesale !== undefined) {
      await tx.productVariant.updateMany({ where: { productId: id, isWholesale: true }, data: { isActive: false } });
      if (input.wholesale) {
        await tx.productVariant.upsert({
          where: { productId_weightGrams_isWholesale: { productId: id, weightGrams: input.wholesale.weightGrams, isWholesale: true } },
          create: { ...wholesaleVariantData(input.wholesale), productId: id, isWholesale: true },
          update: { ...wholesaleVariantData(input.wholesale), compareAtPriceToman: null },
        });
      }
    }

    // ——— تصاویر: جایگزینی کامل ———
    if (input.images) {
      await tx.productImage.deleteMany({ where: { productId: id } });
      if (input.images.length > 0) {
        await tx.productImage.createMany({
          data: input.images.map((img, i) => ({
            productId: id,
            url: img.url,
            alt: img.alt ?? null,
            sortOrder: i,
          })),
        });
      }
    }

    return tx.product.update({
      where: { id },
      data: {
        slug: input.slug,
        title,
        categoryId,
        shortDescription,
        description,
        ...(input.attributes !== undefined
          ? { attributes: JSON.stringify(input.attributes) }
          : {}),
        searchText,
        ...(input.isSuggested !== undefined ? { isSuggested: input.isSuggested } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: { id: true, slug: true, isActive: true },
    });
  });

  return { product: updated };
}

/**
 * حذف محصول — اگر سفارش تاریخی دارد (OrderItem → Restrict) حذف فیزیکی
 * ممکن نیست → 409 با پیشنهاد غیرفعال‌سازی. نظرات/علاقه‌مندی/سبد Cascade می‌شوند.
 */
export async function deleteAdminProduct(id: string) {
  revalidateStoreCache(CACHE_TAGS.HOME, CACHE_TAGS.FEED);

  const product = await db.product.findUnique({
    where: { id },
    select: { id: true, title: true, _count: { select: { orderItems: true } } },
  });
  if (!product) throw ApiError.notFound('محصول یافت نشد');
  if (product._count.orderItems > 0) {
    throw new ApiError(
      409,
      'CONFLICT',
      'این محصول سفارش ثبت‌شده دارد و حذف فیزیکی ممکن نیست — آن را غیرفعال کنید'
    );
  }
  await db.product.delete({ where: { id } });
  return { deleted: product.title };
}
