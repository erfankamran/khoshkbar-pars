import type { NextRequest } from 'next/server';
import { searchProducts } from '@/server/services/search.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { searchQuerySchema } from '@/server/validators/catalog.schema';
import { getSessionUser } from '@/server/lib/auth';
import { PRIVATE_PRICING_HEADERS } from '@/server/lib/customer-pricing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/search?q=&limit=
 *
 * جستجوی زنده با نرمال‌سازی دوسویه فارسی:
 * ی/ي، ک/ك، أإآ/ا، ة/ه، اعراب، نیم‌فاصله و ارقام فارسی/عربی یکسان‌سازی می‌شوند.
 * q خالی → پیشنهاد پرفروش‌ها (mode=suggest).
 *
 * Expected queries: q خالی → 1 | q پر → 2
 */
export async function GET(req: NextRequest) {
  try {
    const q = parseQuery(searchQuerySchema, req.nextUrl.searchParams);
    const data = await searchProducts(q, (await getSessionUser(req))?.role);
    return ok(data, PRIVATE_PRICING_HEADERS);
  } catch (e) {
    return handleError(e);
  }
}
