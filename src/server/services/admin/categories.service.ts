import { revalidateStoreCache, CACHE_TAGS } from '@/server/lib/cache-tags';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { categoryCreateSchema, categoryUpdateSchema } from '@/server/validators/admin.schema';
import { isForeignViolation, isUniqueViolation, pageOffset } from './shared';
import type { z } from 'zod';

/**
 * مدیریت دسته‌بندی‌ها (فاز ۱۴) — CRUD با شمارش محصولات
 * حذف دسته دارای محصول مجاز نیست (Restrict) → 409 با پیشنهاد غیرفعال‌سازی
 */

type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

/** فهرست همه دسته‌ها با شمارش محصول فعال — Expected queries: ۲ */
export async function listAdminCategories() {
  const [categories, total] = await Promise.all([
    db.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
    }),
    db.category.count(),
  ]);
  return { categories, total };
}

export async function createAdminCategory(input: CategoryCreateInput) {
  revalidateStoreCache(CACHE_TAGS.HOME, CACHE_TAGS.FEED);

  try {
    const category = await db.category.create({ data: input });
    return { category };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');
    }
    throw e;
  }
}

export async function updateAdminCategory(id: string, input: CategoryUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.HOME, CACHE_TAGS.FEED);

  const existing = await db.category.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('دسته‌بندی یافت نشد');
  try {
    const category = await db.category.update({ where: { id }, data: input });
    return { category };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده است');
    }
    throw e;
  }
}

export async function deleteAdminCategory(id: string) {
  revalidateStoreCache(CACHE_TAGS.HOME, CACHE_TAGS.FEED);

  const existing = await db.category.findUnique({
    where: { id },
    select: { id: true, title: true, _count: { select: { products: true } } },
  });
  if (!existing) throw ApiError.notFound('دسته‌بندی یافت نشد');
  if (existing._count.products > 0) {
    throw new ApiError(
      409,
      'CONFLICT',
      `این دسته ${existing._count.products} محصول دارد — ابتدا محصولات را جابه‌جا یا دسته را غیرفعال کنید`
    );
  }
  await db.category.delete({ where: { id } });
  return { deleted: existing.title };
}

