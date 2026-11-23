import { Prisma } from '@prisma/client';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { normalizePersian } from '@/lib/fa';
import type {
  AdminCategoryCreate,
  AdminCategoryUpdate,
  AdminImageCreate,
  AdminImageUpdate,
  AdminProductCreate,
  AdminProductListQuery,
  AdminProductUpdate,
  AdminVariantCreate,
  AdminVariantUpdate,
} from '@/server/validators/admin/catalog.schema';

/**
 * سرویس مدیریت کاتالوگ پنل ادمین (فاز ۱۱.۲ — بخش ۱۶ مشخصات)
 *
 * قواعد:
 * - ضد N+1: لیست = ۲ دستور ثابت (count + findOne صفحه)؛ جزئیات = ۳ دستور ثابت.
 * - searchText هرگز مستقیم از ادمین نمی‌گیرد — با normalizePersian از
 *   title/توضیحات/ویژگی‌ها/عنوان دسته بازسازی می‌شود (همان منطق seed؛
 *   تک‌منبع منطق جستجو — بخش ۱۴ معماری).
 * - حذف: سفارش‌خورده‌ها هرگز حذف نمی‌شوند (FK Restrict در OrderItem) —
 *   خطای 409 HAS_REFERENCES با پیام راهنما؛ راه درست، غیرفعال‌سازی است.
 * - خطاهای یکتایی (slug، وزن) پیش‌بررسی دوستانه + دفاع P2002 می‌دهند.
 */

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function isForeignKeyViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003';
}

/** ساخت متن نرمال‌شده جستجو — منطق یکسان با prisma/seed.ts (بخش ۱۴) */
function buildSearchText(
  p: {
    slug: string;
    title: string;
    shortDescription?: string | null;
    description?: string | null;
    attributes?: Array<{ k: string; v: string }> | null;
  },
  categoryTitle: string
): string {
  const parts = [
    p.title,
    p.shortDescription,
    p.description,
    p.attributes?.map((a) => `${a.k} ${a.v}`).join(' '),
    categoryTitle,
    p.slug.replace(/-/g, ' '),
  ];
  return normalizePersian(parts.filter(Boolean).join(' '));
}

/** فایل تصویر باید واقعاً در /public موجود باشد — جلوگیری از URL اشتباه/تایپی */
function assertImageFileExists(url: string): void {
  const filePath = path.join(process.cwd(), 'public', url);
  if (!existsSync(filePath)) {
    throw new ApiError(400, 'IMAGE_NOT_FOUND', 'فایل تصویر در مسیر /public یافت نشد');
  }
}

// ------------------------------------------------------------
// محصولات — لیست و جزئیات
// ------------------------------------------------------------

export interface AdminProductListItemDTO {
  id: string;
  slug: string;
  title: string;
  isActive: boolean;
  isSuggested: boolean;
  salesCount: number;
  createdAt: string;
  updatedAt: string;
  category: { id: string; slug: string; title: string };
  image: { url: string; alt: string | null } | null;
  variantCount: number;
  totalStock: number;
  minPriceToman: number;
  maxPriceToman: number;
  hasDiscount: boolean;
}

export interface AdminVariantDTO {
  id: string;
  weightGrams: number;
  priceToman: number;
  compareAtPriceToman: number | null;
  sku: string | null;
  stock: number;
  isActive: boolean;
  /** آیا در سفارش ثبت‌شده استفاده شده؟ (حذف ممنوع — غیرفعال‌سازی جایگزین) */
  hasOrders: boolean;
}

export interface AdminProductDetailDTO extends AdminProductListItemDTO {
  shortDescription: string | null;
  description: string | null;
  attributes: Array<{ k: string; v: string }>;
  variants: AdminVariantDTO[];
  images: Array<{ id: string; url: string; alt: string | null; sortOrder: number }>;
  /** آیا خود محصول در هیچ سفارشی هست؟ (حذف سخت ممکن نیست) */
  hasOrders: boolean;
}

const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  isActive: true,
  isSuggested: true,
  salesCount: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, slug: true, title: true } },
  images: {
    select: { url: true, alt: true },
    orderBy: { sortOrder: Prisma.SortOrder.asc },
    take: 1,
  },
  variants: {
    // ادمین واریانت‌های غیرفعال را هم می‌بیند (فروشگاه فقط فعال‌ها)
    select: {
      priceToman: true,
      compareAtPriceToman: true,
      stock: true,
    },
  },
} satisfies Prisma.ProductSelect;

type AdminProductRow = Prisma.ProductGetPayload<{ select: typeof LIST_SELECT }>;

function toListItemDTO(p: AdminProductRow): AdminProductListItemDTO {
  const prices = p.variants.map((v) => v.priceToman);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    isActive: p.isActive,
    isSuggested: p.isSuggested,
    salesCount: p.salesCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    category: p.category,
    image: p.images[0] ?? null,
    variantCount: p.variants.length,
    totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
    minPriceToman: prices.length ? Math.min(...prices) : 0,
    maxPriceToman: prices.length ? Math.max(...prices) : 0,
    hasDiscount: p.variants.some(
      (v) => v.compareAtPriceToman != null && v.compareAtPriceToman > v.priceToman
    ),
  };
}

export async function listAdminProducts(q: AdminProductListQuery): Promise<{
  items: AdminProductListItemDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const where: Prisma.ProductWhereInput = {};

  if (q.status === 'active') where.isActive = true;
  if (q.status === 'inactive') where.isActive = false;
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.q) {
    // جستجو روی متن نرمال‌شده — «پيارم» عربی هم «پیا رام» را می‌یابد (فاز ۵)
    where.searchText = { contains: normalizePersian(q.q) };
  }

  const skip = (q.page - 1) * q.limit;
  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: LIST_SELECT,
      take: q.limit,
      skip,
    }),
    db.product.count({ where }),
  ]);

  return {
    items: rows.map(toListItemDTO),
    total,
    page: q.page,
    limit: q.limit,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
  };
}

export async function getAdminProduct(id: string): Promise<AdminProductDetailDTO> {
  const p = await db.product.findUnique({
    where: { id },
    select: {
      ...LIST_SELECT,
      shortDescription: true,
      description: true,
      attributes: true,
      images: {
        select: { id: true, url: true, alt: true, sortOrder: true },
        orderBy: { sortOrder: Prisma.SortOrder.asc },
      },
      variants: {
        orderBy: { weightGrams: Prisma.SortOrder.asc },
        select: {
          id: true,
          weightGrams: true,
          priceToman: true,
          compareAtPriceToman: true,
          sku: true,
          stock: true,
          isActive: true,
        },
      },
    },
  });
  if (!p) throw ApiError.notFound('محصول یافت نشد');

  // کدام واریانت‌ها سفارش‌خورده‌اند؟ (یک groupBy برای همه واریانت‌ها — بدون N+1)
  const orderedRows = await db.orderItem.groupBy({
    by: ['variantId'],
    where: { variantId: { in: p.variants.map((v) => v.id) } },
    _count: { _all: true },
  });
  const orderedSet = new Set(orderedRows.map((r) => r.variantId));

  const hasOrders = await db.orderItem.count({ where: { productId: id }, take: 1 });

  let attributes: Array<{ k: string; v: string }> = [];
  if (p.attributes) {
    try {
      const parsed: unknown = JSON.parse(p.attributes);
      if (Array.isArray(parsed)) {
        attributes = parsed.filter(
          (x): x is { k: string; v: string } =>
            !!x &&
            typeof x === 'object' &&
            typeof (x as { k?: unknown }).k === 'string' &&
            typeof (x as { v?: unknown }).v === 'string'
        );
      }
    } catch {
      /* داده خراب → خالی؛ صفحه ادیتور نمی‌شکند */
    }
  }

  return {
    ...toListItemDTO(p),
    shortDescription: p.shortDescription,
    description: p.description,
    attributes,
    hasOrders: hasOrders > 0,
    variants: p.variants.map((v) => ({
      id: v.id,
      weightGrams: v.weightGrams,
      priceToman: v.priceToman,
      compareAtPriceToman: v.compareAtPriceToman,
      sku: v.sku,
      stock: v.stock,
      isActive: v.isActive,
      hasOrders: orderedSet.has(v.id),
    })),
    images: p.images,
  };
}

// ------------------------------------------------------------
// محصولات — ایجاد/ویرایش/حذف
// ------------------------------------------------------------

export async function createProduct(input: AdminProductCreate): Promise<AdminProductDetailDTO> {
  const category = await db.category.findUnique({
    where: { id: input.categoryId },
    select: { id: true, title: true },
  });
  if (!category) throw ApiError.notFound('دسته‌بندی یافت نشد');

  const slugTaken = await db.product.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (slugTaken) throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');

  const created = await db.product.create({
    data: {
      slug: input.slug,
      title: input.title,
      categoryId: input.categoryId,
      shortDescription: input.shortDescription ?? null,
      description: input.description ?? null,
      attributes: input.attributes?.length ? JSON.stringify(input.attributes) : null,
      searchText: buildSearchText(
        {
          slug: input.slug,
          title: input.title,
          shortDescription: input.shortDescription,
          description: input.description,
          attributes: input.attributes,
        },
        category.title
      ),
      isSuggested: input.isSuggested,
      isActive: input.isActive,
    },
    select: { id: true },
  });

  return getAdminProduct(created.id);
}

export async function updateProduct(
  id: string,
  input: AdminProductUpdate
): Promise<AdminProductDetailDTO> {
  const existing = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      description: true,
      attributes: true,
      categoryId: true,
      category: { select: { title: true } },
    },
  });
  if (!existing) throw ApiError.notFound('محصول یافت نشد');

  // اسلاگ تغییر کرده؟ یکتایی به‌جز خود رکورد
  if (input.slug && input.slug !== existing.slug) {
    const taken = await db.product.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (taken) throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');
  }

  // دسته تغییر کرده؟ وجود دسته جدید
  let newCategoryTitle: string | null = null;
  if (input.categoryId && input.categoryId !== existing.categoryId) {
    const cat = await db.category.findUnique({
      where: { id: input.categoryId },
      select: { title: true },
    });
    if (!cat) throw ApiError.notFound('دسته‌بندی یافت نشد');
    newCategoryTitle = cat.title;
  }

  // متن جستجو فقط وقتی بازسازی می‌شود که ورودی متن یا دسته تغییر کرده باشد
  const textFieldsChanged =
    (input.title !== undefined && input.title !== existing.title) ||
    (input.shortDescription !== undefined && input.shortDescription !== existing.shortDescription) ||
    (input.description !== undefined && input.description !== existing.description) ||
    input.attributes !== undefined ||
    newCategoryTitle !== null;

  const nextAttributes = input.attributes ?? undefined;
  let searchText: string | undefined;
  if (textFieldsChanged) {
    const nextParsedAttributes =
      nextAttributes ??
      (existing.attributes
        ? (JSON.parse(existing.attributes) as Array<{ k: string; v: string }>)
        : []);
    searchText = buildSearchText(
      {
        slug: input.slug ?? existing.slug,
        title: input.title ?? existing.title,
        shortDescription: input.shortDescription ?? existing.shortDescription,
        description: input.description ?? existing.description,
        attributes: nextParsedAttributes,
      },
      newCategoryTitle ?? existing.category.title
    );
  }

  try {
    await db.product.update({
      where: { id },
      data: {
        slug: input.slug,
        title: input.title,
        categoryId: input.categoryId,
        shortDescription: input.shortDescription,
        description: input.description,
        attributes: nextAttributes ? JSON.stringify(nextAttributes) : undefined,
        searchText,
        isSuggested: input.isSuggested,
        isActive: input.isActive,
      },
      select: { id: true },
    });
  } catch (e) {
    if (isUniqueViolation(e))
      throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');
    throw e;
  }

  return getAdminProduct(id);
}

export async function deleteProduct(id: string): Promise<{ deleted: true }> {
  const existing = await db.product.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });
  if (!existing) throw ApiError.notFound('محصول یافت نشد');

  try {
    await db.product.delete({ where: { id } });
    return { deleted: true };
  } catch (e) {
    // OrderItem → Restrict: محصول سفارش‌خورده تاریخ است و باید بایگانی شود
    if (isForeignKeyViolation(e)) {
      throw new ApiError(
        409,
        'HAS_REFERENCES',
        'این محصول سابقه سفارش دارد و حذف آن ممکن نیست — آن را غیرفعال کنید'
      );
    }
    throw e;
  }
}

// ------------------------------------------------------------
// واریانت وزنی
// ------------------------------------------------------------

export async function createVariant(
  productId: string,
  input: AdminVariantCreate
): Promise<AdminProductDetailDTO> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw ApiError.notFound('محصول یافت نشد');

  const dup = await db.productVariant.findUnique({
    where: { productId_weightGrams_isWholesale: { productId, weightGrams: input.weightGrams, isWholesale: false } },
    select: { id: true },
  });
  if (dup)
    throw new ApiError(409, 'WEIGHT_EXISTS', 'برای این وزن قبلاً واریانت ساخته شده است');

  await db.productVariant.create({
    data: {
      productId,
      weightGrams: input.weightGrams,
      priceToman: input.priceToman,
      compareAtPriceToman: input.compareAtPriceToman ?? null,
      sku: input.sku ?? null,
      stock: input.stock,
      isActive: input.isActive,
    },
  });

  return getAdminProduct(productId);
}

export async function updateVariant(
  id: string,
  input: AdminVariantUpdate
): Promise<AdminProductDetailDTO> {
  const existing = await db.productVariant.findUnique({
    where: { id },
    select: { id: true, productId: true, weightGrams: true, priceToman: true, compareAtPriceToman: true },
  });
  if (!existing) throw ApiError.notFound('واریانت یافت نشد');

  if (input.weightGrams && input.weightGrams !== existing.weightGrams) {
    const dup = await db.productVariant.findUnique({
      where: {
        productId_weightGrams_isWholesale: {
          productId: existing.productId,
          weightGrams: input.weightGrams,
          isWholesale: false,
        },
      },
      select: { id: true },
    });
    if (dup)
      throw new ApiError(409, 'WEIGHT_EXISTS', 'برای این وزن قبلاً واریانت ساخته شده است');
  }

  // تطبیق قیمت نهایی (بعد از ادغام فیلدهای ارسالی با موجود) — PATCH جزئی امن می‌ماند
  const nextPrice = input.priceToman ?? existing.priceToman;
  const nextCompare = input.compareAtPriceToman ?? existing.compareAtPriceToman;
  if (nextCompare != null && nextCompare <= nextPrice) {
    throw new ApiError(
      400,
      'VALIDATION',
      'قیمت قبل از تخفیف باید بیشتر از قیمت فروش باشد'
    );
  }

  await db.productVariant.update({
    where: { id },
    data: {
      weightGrams: input.weightGrams,
      priceToman: input.priceToman,
      compareAtPriceToman: input.compareAtPriceToman,
      sku: input.sku,
      stock: input.stock,
      isActive: input.isActive,
    },
  });

  return getAdminProduct(existing.productId);
}

export async function deleteVariant(id: string): Promise<{ deleted: true }> {
  const existing = await db.productVariant.findUnique({
    where: { id },
    select: { id: true, productId: true },
  });
  if (!existing) throw ApiError.notFound('واریانت یافت نشد');

  try {
    await db.productVariant.delete({ where: { id } });
    return { deleted: true };
  } catch (e) {
    if (isForeignKeyViolation(e)) {
      throw new ApiError(
        409,
        'HAS_REFERENCES',
        'این واریانت سابقه سفارش دارد و حذف آن ممکن نیست — آن را غیرفعال کنید'
      );
    }
    throw e;
  }
}

// ------------------------------------------------------------
// تصاویر محصول
// ------------------------------------------------------------

export async function createImage(
  productId: string,
  input: AdminImageCreate
): Promise<AdminProductDetailDTO> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw ApiError.notFound('محصول یافت نشد');

  assertImageFileExists(input.url);

  await db.productImage.create({
    data: {
      productId,
      url: input.url,
      alt: input.alt ?? null,
      sortOrder: input.sortOrder,
    },
  });

  return getAdminProduct(productId);
}

export async function updateImage(
  id: string,
  input: AdminImageUpdate
): Promise<AdminProductDetailDTO> {
  const existing = await db.productImage.findUnique({
    where: { id },
    select: { id: true, productId: true, url: true },
  });
  if (!existing) throw ApiError.notFound('تصویر یافت نشد');

  if (input.url && input.url !== existing.url) assertImageFileExists(input.url);

  await db.productImage.update({
    where: { id },
    data: {
      url: input.url,
      alt: input.alt,
      sortOrder: input.sortOrder,
    },
  });

  return getAdminProduct(existing.productId);
}

export async function deleteImage(id: string): Promise<{ deleted: true }> {
  const existing = await db.productImage.findUnique({
    where: { id },
    select: { id: true, productId: true },
  });
  if (!existing) throw ApiError.notFound('تصویر یافت نشد');

  await db.productImage.delete({ where: { id } });
  return { deleted: true };
}

// ------------------------------------------------------------
// دسته‌بندی‌ها
// ------------------------------------------------------------

export interface AdminCategoryDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  activeProductCount: number;
}

export async function listAdminCategories(): Promise<{ items: AdminCategoryDTO[] }> {
  const rows = await db.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      imageUrl: true,
      icon: true,
      sortOrder: true,
      isActive: true,
      _count: { select: { products: true } },
    },
  });

  // شمارش محصولات فعال هر دسته — یک groupBy برای همه دسته‌ها (بدون N+1)
  const activeCounts = await db.product.groupBy({
    by: ['categoryId'],
    where: { isActive: true },
    _count: { _all: true },
  });
  const activeMap = new Map(activeCounts.map((r) => [r.categoryId, r._count._all]));

  return {
    items: rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      imageUrl: c.imageUrl,
      icon: c.icon,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      productCount: c._count.products,
      activeProductCount: activeMap.get(c.id) ?? 0,
    })),
  };
}

export async function createCategory(input: AdminCategoryCreate): Promise<AdminCategoryDTO> {
  const taken = await db.category.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (taken)
    throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');

  try {
    const created = await db.category.create({
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        icon: input.icon ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
      select: { id: true },
    });
    return (await listAdminCategories()).items.find((c) => c.id === created.id)!;
  } catch (e) {
    if (isUniqueViolation(e))
      throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');
    throw e;
  }
}

export async function updateCategory(
  id: string,
  input: AdminCategoryUpdate
): Promise<AdminCategoryDTO> {
  const existing = await db.category.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });
  if (!existing) throw ApiError.notFound('دسته‌بندی یافت نشد');

  if (input.slug && input.slug !== existing.slug) {
    const taken = await db.category.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (taken)
      throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');
  }

  try {
    await db.category.update({
      where: { id },
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description,
        imageUrl: input.imageUrl,
        icon: input.icon,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
      select: { id: true },
    });
  } catch (e) {
    if (isUniqueViolation(e))
      throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');
    throw e;
  }

  return (await listAdminCategories()).items.find((c) => c.id === id)!;
}

export async function deleteCategory(id: string): Promise<{ deleted: true }> {
  const existing = await db.category.findUnique({
    where: { id },
    select: { id: true, _count: { select: { products: true } } },
  });
  if (!existing) throw ApiError.notFound('دسته‌بندی یافت نشد');

  if (existing._count.products > 0) {
    throw new ApiError(
      409,
      'HAS_PRODUCTS',
      `این دسته ${existing._count.products} محصول دارد — ابتدا محصولات را منتقل یا حذف کنید`
    );
  }

  // زیردسته‌ها: parentId با SetNull خودکار جدا می‌شود (بدون از دست رفتن داده)
  await db.category.delete({ where: { id } });
  return { deleted: true };
}
