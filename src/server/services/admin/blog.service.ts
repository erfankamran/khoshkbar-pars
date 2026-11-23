import { revalidateStoreCache, CACHE_TAGS } from '@/server/lib/cache-tags';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import {
  postCreateSchema,
  postUpdateSchema,
} from '@/server/validators/admin.schema';
import type { z } from 'zod';

/**
 * مدیریت وبلاگ (درخواست کاربر) — CRUD نوشته‌ها
 *
 * - وبلاگ جایگزین علاقه‌مندی در منوی موبایل + ورودی سئو فروشگاه است
 * - publishedAt اولین‌بار هنگام گذار پیش‌نویس → منتشرشده ثبت می‌شود
 *   (تغییر وضعیت بعدی تاریخ را جابه‌جا نمی‌کند — تاریخ اصلی انتشار می‌ماند)
 * - الگو همان CRUD بنرها/صفحات است: whitelist zod + بازسازی کش
 */

type PostCreateInput = z.infer<typeof postCreateSchema>;
type PostUpdateInput = z.infer<typeof postUpdateSchema>;

/** فهرست همه نوشته‌ها (شامل پیش‌نویس) — Expected queries: ۱ */
export async function listAdminPosts() {
  const posts = await db.post.findMany({
    orderBy: [{ isPublished: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
  });
  return { posts };
}

/** ایجاد نوشته — خطای تکراری‌بودن slug → 409 */
export async function createAdminPost(input: PostCreateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const dup = await db.post.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (dup) throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده — اسلاگ دیگری انتخاب کنید');

  const post = await db.post.create({
    data: {
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt ?? null,
      content: input.content,
      coverUrl: input.coverUrl ?? null,
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      tags: input.tags ?? null,
      isPublished: input.isPublished,
      // انتشار مستقیم هنگام ایجاد → تاریخ انتشار = الان
      publishedAt: input.isPublished ? new Date() : null,
    },
  });
  return { post };
}

/** ویرایش نوشته — اگر slug تغییر کند یکتایی بررسی می‌شود */
export async function updateAdminPost(id: string, input: PostUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.post.findUnique({
    where: { id },
    select: { id: true, slug: true, isPublished: true, publishedAt: true },
  });
  if (!existing) throw ApiError.notFound('نوشته یافت نشد');

  if (input.slug !== undefined && input.slug !== existing.slug) {
    const dup = await db.post.findUnique({ where: { slug: input.slug }, select: { id: true } });
    if (dup) throw new ApiError(409, 'SLUG_TAKEN', 'این اسلاگ قبلاً استفاده شده — اسلاگ دیگری انتخاب کنید');
  }

  // گذار پیش‌نویس → منتشرشده و نبودِ تاریخ قبلی → ثبت تاریخ انتشار الان
  const nowPublishing =
    input.isPublished === true && !existing.isPublished && !existing.publishedAt;

  const post = await db.post.update({
    where: { id },
    data: {
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.excerpt !== undefined ? { excerpt: input.excerpt ?? null } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl ?? null } : {}),
      ...(input.metaTitle !== undefined ? { metaTitle: input.metaTitle ?? null } : {}),
      ...(input.metaDescription !== undefined
        ? { metaDescription: input.metaDescription ?? null }
        : {}),
      ...(input.tags !== undefined ? { tags: input.tags ?? null } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      ...(nowPublishing ? { publishedAt: new Date() } : {}),
    },
  });
  return { post };
}

/** حذف نوشته */
export async function deleteAdminPost(id: string) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.post.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!existing) throw ApiError.notFound('نوشته یافت نشد');
  await db.post.delete({ where: { id } });
  return { deleted: existing.title };
}
