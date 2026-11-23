import type { NextRequest } from 'next/server';
import { getBanners } from '@/server/services/content.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { emptyQuerySchema } from '@/server/validators/catalog.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/banners — اسلایدر صفحه اصلی
 * Expected queries: 1
 */
export async function GET(req: NextRequest) {
  try {
    parseQuery(emptyQuerySchema, req.nextUrl.searchParams);
    const data = await getBanners();
    return ok(data);
  } catch (e) {
    return handleError(e);
  }
}
