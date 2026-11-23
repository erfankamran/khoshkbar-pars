import { getHomeData } from '@/server/services/home.service';
import { handleError, ok } from '@/server/lib/api';
import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/server/lib/auth';
import { PRIVATE_PRICING_HEADERS } from '@/server/lib/customer-pricing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/home — همه داده صفحه اصلی در یک درخواست
 * (استوری، بنر، دسته‌بندی‌ها، ۴ بخش محصول)
 *
 * Expected queries: 27 ثابت (موازی با Promise.all — مستندات در home.service)
 */
export async function GET(req: NextRequest) {
  try {
    const data = await getHomeData((await getSessionUser(req))?.role);
    return ok(data, PRIVATE_PRICING_HEADERS);
  } catch (e) {
    return handleError(e);
  }
}
