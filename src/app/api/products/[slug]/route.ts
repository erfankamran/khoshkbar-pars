import type { NextRequest } from 'next/server';
import { getProductDetail } from '@/server/services/catalog.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { emptyQuerySchema, slugParamSchema } from '@/server/validators/catalog.schema';
import { getSessionUser } from '@/server/lib/auth';
import { PRIVATE_PRICING_HEADERS } from '@/server/lib/customer-pricing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products/[slug] — جزئیات کامل محصول + ۴ محصول مرتبط
 * Expected queries: 2
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    parseQuery(emptyQuerySchema, req.nextUrl.searchParams);
    const { slug } = await params;
    const validSlug = slugParamSchema.parse(slug);
    const data = await getProductDetail(validSlug, (await getSessionUser(req))?.role);
    return ok(data, PRIVATE_PRICING_HEADERS);
  } catch (e) {
    return handleError(e);
  }
}
