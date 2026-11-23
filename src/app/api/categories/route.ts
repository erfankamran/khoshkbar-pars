import type { NextRequest } from 'next/server';
import { getCategories } from '@/server/services/catalog.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { emptyQuerySchema } from '@/server/validators/catalog.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/categories — لیست دسته‌بندی‌ها با تعداد محصول فعال
 * Expected queries: 1
 */
export async function GET(req: NextRequest) {
  try {
    parseQuery(emptyQuerySchema, req.nextUrl.searchParams);
    const data = await getCategories();
    return ok(data);
  } catch (e) {
    return handleError(e);
  }
}
