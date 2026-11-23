import type { NextRequest } from 'next/server';
import { getStories } from '@/server/services/content.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { emptyQuerySchema } from '@/server/validators/catalog.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stories — استوری‌های گروه‌بندی‌شده صفحه اصلی
 * (گروه‌های منقضی‌شده خودکار حذف می‌شوند)
 * Expected queries: 1
 */
export async function GET(req: NextRequest) {
  try {
    parseQuery(emptyQuerySchema, req.nextUrl.searchParams);
    const data = await getStories();
    return ok(data);
  } catch (e) {
    return handleError(e);
  }
}
