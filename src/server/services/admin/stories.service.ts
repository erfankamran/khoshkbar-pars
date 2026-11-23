import { revalidateStoreCache, CACHE_TAGS } from '@/server/lib/cache-tags';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { storyCreateSchema, storyUpdateSchema } from '@/server/validators/admin.schema';
import type { z } from 'zod';

/**
 * مدیریت استوری‌ها (فاز ۱۴) — CRUD کامل
 * هر «دایره استوری» یک گروه (groupKey) با چند آیتم رسانه است.
 */

type StoryCreateInput = z.infer<typeof storyCreateSchema>;
type StoryUpdateInput = z.infer<typeof storyUpdateSchema>;

export async function listAdminStories() {
  const rows = await db.story.findMany({
    orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  // گروه‌بندی برای نمایش پنل
  const groups = new Map<
    string,
    { groupKey: string; groupTitle: string; items: typeof rows }
  >();
  for (const s of rows) {
    const g = groups.get(s.groupKey) ?? {
      groupKey: s.groupKey,
      groupTitle: s.groupTitle,
      items: [],
    };
    g.items.push(s);
    groups.set(s.groupKey, g);
  }
  const stories = Array.from(groups.values());
  return { groups: stories, total: rows.length };
}

export async function createAdminStory(input: StoryCreateInput) {
  revalidateStoreCache(CACHE_TAGS.HOME);

  const story = await db.story.create({
    data: {
      groupKey: input.groupKey,
      groupTitle: input.groupTitle,
      thumbUrl: input.thumbUrl,
      mediaType: input.mediaType,
      mediaUrl: input.mediaUrl,
      caption: input.caption ?? null,
      linkView: input.linkView ?? null,
      linkParams: input.linkParams ? JSON.stringify(input.linkParams) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  return { story };
}

export async function updateAdminStory(id: string, input: StoryUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.HOME);

  const existing = await db.story.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('استوری یافت نشد');
  const story = await db.story.update({
    where: { id },
    data: {
      ...(input.groupKey !== undefined ? { groupKey: input.groupKey } : {}),
      ...(input.groupTitle !== undefined ? { groupTitle: input.groupTitle } : {}),
      ...(input.thumbUrl !== undefined ? { thumbUrl: input.thumbUrl } : {}),
      ...(input.mediaType !== undefined ? { mediaType: input.mediaType } : {}),
      ...(input.mediaUrl !== undefined ? { mediaUrl: input.mediaUrl } : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.linkView !== undefined ? { linkView: input.linkView } : {}),
      ...(input.linkParams !== undefined
        ? { linkParams: JSON.stringify(input.linkParams) }
        : {}),
      ...(input.expiresAt !== undefined
        ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return { story };
}

export async function deleteAdminStory(id: string) {
  revalidateStoreCache(CACHE_TAGS.HOME);

  const existing = await db.story.findUnique({
    where: { id },
    select: { id: true, groupTitle: true },
  });
  if (!existing) throw ApiError.notFound('استوری یافت نشد');
  await db.story.delete({ where: { id } });
  return { deleted: existing.groupTitle };
}
