import type { NextRequest } from 'next/server';
import { getProducts } from '@/server/services/catalog.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { productQuerySchema } from '@/server/validators/catalog.schema';
import { getSessionUser } from '@/server/lib/auth';
import { PRIVATE_PRICING_HEADERS } from '@/server/lib/customer-pricing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products
 * ?category=<slug> & section=all|bestseller|new|discounted|suggested
 * & sort=popular|newest|cheap|expensive & page=1 & limit=12
 *
 * Expected queries:
 *   - sort=popular|newest / section=bestseller|new|suggested|discounted → 3
 *   - sort=cheap|expensive → 2 (مرتب‌سازی قیمتی در JS؛ یادداشت در سرویس)
 *
 * پاسخ شامل واریانت‌های فعال هر محصول است تا انتخابگر وزن روی کارت
 * بدون درخواست اضافه کار کند (پیش‌نیاز فاز ۶).
 */
export async function GET(req: NextRequest) {
  try {
    const q = parseQuery(productQuerySchema, req.nextUrl.searchParams);
    const data = await getProducts(q, (await getSessionUser(req))?.role);
    return ok(data, PRIVATE_PRICING_HEADERS);
  } catch (e) {
    return handleError(e);
  }
}
