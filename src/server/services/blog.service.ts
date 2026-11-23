import { db } from '@/lib/db';
import { pageExcerpt } from '@/lib/markdown';
import { blocksToPlain, parsePageBlocks } from '@/lib/page-blocks';

/**
 * وبلاگ عمومی (درخواست کاربر) — خواندن نوشته‌های منتشرشده
 *
 * - فقط isPublished=true؛ مرتب‌سازی بر اساس تاریخ انتشار نزولی
 * - ورودی سئو: خلاصه با اولویت excerpt → pageExcerpt(content) → بلوک‌ها
 * - بازدید: شمارش سبک با update (بدون قفل — دقت آماری کافی است)
 */

export interface PublicPostListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  tags: string[];
  publishedAt: string;
  viewCount: number;
}

export interface PublicPostDetail extends PublicPostListItem {
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}

function tagsToList(tags: string | null): string[] {
  return tags ? tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6) : [];
}

function excerptOf(
  excerpt: string | null,
  content: string
): string {
  const own = excerpt?.trim();
  if (own) return own;
  return pageExcerpt(content) || '';
}

/** فهرست نوشته‌های منتشرشده — Expected queries: ۱ */
export async function listPublishedPosts(opts?: { take?: number }): Promise<{
  posts: PublicPostListItem[];
}> {
  const take = Math.min(Math.max(opts?.take ?? 24, 1), 50);
  const posts = await db.post.findMany({
    where: { isPublished: true },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      coverUrl: true,
      tags: true,
      publishedAt: true,
      createdAt: true,
      viewCount: true,
    },
    take,
  });
  return {
    posts: posts.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: excerptOf(p.excerpt, p.content),
      coverUrl: p.coverUrl,
      tags: tagsToList(p.tags),
      publishedAt: (p.publishedAt ?? p.createdAt).toISOString(),
      viewCount: p.viewCount,
    })),
  };
}

/** خواندن نوشته منتشرشده با slug — پیش‌نویس/ناموجود → null */
export async function getPublishedPost(slug: string): Promise<PublicPostDetail | null> {
  const p = await db.post.findFirst({
    where: { slug: slug.toLowerCase(), isPublished: true },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      coverUrl: true,
      metaTitle: true,
      metaDescription: true,
      tags: true,
      publishedAt: true,
      createdAt: true,
      viewCount: true,
      updatedAt: true,
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: excerptOf(p.excerpt, p.content),
    content: p.content,
    coverUrl: p.coverUrl,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    tags: tagsToList(p.tags),
    publishedAt: (p.publishedAt ?? p.createdAt).toISOString(),
    viewCount: p.viewCount,
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** افزایش شمارش بازدید — fire-and-forget (خطا نباید صفحه را بترکاند) */
export function incrementPostView(id: string): void {
  db.post
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);
}

/**
 * توضیحات متا یک نوشته — اولویت: metaDescription → excerpt → pageExcerpt
 * (برای generateMetadata و RSS)
 */
export function postSeoDescription(p: {
  metaDescription: string | null;
  excerpt: string;
  content: string;
  blocks?: string | null;
}): string {
  if (p.metaDescription?.trim()) return p.metaDescription.trim();
  if (p.excerpt?.trim()) return p.excerpt.trim();
  const blocks = parsePageBlocks(p.blocks ?? null);
  if (blocks) {
    const plain = blocksToPlain(blocks);
    if (plain) return plain.slice(0, 160);
  }
  return pageExcerpt(p.content) || '';
}
