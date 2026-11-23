import type { NextRequest } from 'next/server';
import { getPublicPageBySlug } from '@/server/services/content.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pages/[slug] — متن کامل یک صفحه فعال (درخواست کاربر)
 * ناموجود/غیرفعال → data: null (نمای کاربر حالت «یافت نشد» را نشان می‌دهد)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    return ok(await getPublicPageBySlug(slug));
  } catch (e) {
    return handleError(e);
  }
}
