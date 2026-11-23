import { revalidateStoreCache, CACHE_TAGS } from '@/server/lib/cache-tags';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { bannerCreateSchema, bannerUpdateSchema } from '@/server/validators/admin.schema';
import type { z } from 'zod';

/**
 * مدیریت بنرهای صفحه اصلی (فاز ۱۴) — CRUD کامل
 * linkView/linkParams همان ناوِ view-stack فروشگاه است (category/product/search/…)
 */

type BannerCreateInput = z.infer<typeof bannerCreateSchema>;
type BannerUpdateInput = z.infer<typeof bannerUpdateSchema>;

/** فهرست همه بنرها به ترتیب نمایش — Expected queries: ۱ */
export async function listAdminBanners() {
  const banners = await db.banner.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return { banners };
}

export async function createAdminBanner(input: BannerCreateInput) {
  revalidateStoreCache(CACHE_TAGS.HOME);

  const banner = await db.banner.create({
    data: {
      title: input.title,
      subtitle: input.subtitle ?? null,
      imageUrl: input.imageUrl,
      linkView: input.linkView ?? null,
      linkParams: input.linkParams ? JSON.stringify(input.linkParams) : null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  return { banner };
}

export async function updateAdminBanner(id: string, input: BannerUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.HOME);

  const existing = await db.banner.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('بنر یافت نشد');
  const banner = await db.banner.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.linkView !== undefined ? { linkView: input.linkView } : {}),
      ...(input.linkParams !== undefined
        ? { linkParams: JSON.stringify(input.linkParams) }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return { banner };
}

export async function deleteAdminBanner(id: string) {
  revalidateStoreCache(CACHE_TAGS.HOME);

  const existing = await db.banner.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!existing) throw ApiError.notFound('بنر یافت نشد');
  await db.banner.delete({ where: { id } });
  return { deleted: existing.title };
}
