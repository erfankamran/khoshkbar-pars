import type { NextRequest } from 'next/server';
import { listPublishedPosts } from '@/server/services/blog.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/posts — فهرست نوشته‌های منتشرشده وبلاگ (عمومی)
 * ورودی نمای وبلاگ SPA و لینک‌سازی داخلی — فقط منتشرشده‌ها، جدیدترین اول
 */
export async function GET(req: NextRequest) {
  try {
    const takeParam = new URL(req.url).searchParams.get('take');
    const take = takeParam ? Number(takeParam) : undefined;
    return ok(await listPublishedPosts({ take }));
  } catch (e) {
    return handleError(e);
  }
}
