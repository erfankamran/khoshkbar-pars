import type { NextRequest } from 'next/server';
import { getPublishedPost, incrementPostView } from '@/server/services/blog.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/posts/[slug] — متن کامل یک نوشته منتشرشده (عمومی)
 * پیش‌نویس/ناموجود → data: null (نمای کاربر حالت «یافت نشد» را نشان می‌دهد)
 * هر خواندن موفق یک بازدید شمرده می‌شود (سبک — fire-and-forget)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const post = await getPublishedPost(slug);
    if (post) incrementPostView(post.id);
    return ok(post);
  } catch (e) {
    return handleError(e);
  }
}
