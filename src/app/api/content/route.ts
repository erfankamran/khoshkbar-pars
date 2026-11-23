import type { NextRequest } from 'next/server';
import { getSiteContent } from '@/server/services/content.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { emptyQuerySchema } from '@/server/validators/catalog.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/content — محتوای عمومی فروشگاه (فاز ۳):
 * پرسش‌های متداول، شماره‌های تماس، نمادهای اعتماد، لینک‌های فوتر
 * فقط رکوردهای فعال به ترتیب نمایش — Expected queries: ۴ (موازی)
 */
export async function GET(req: NextRequest) {
  try {
    parseQuery(emptyQuerySchema, req.nextUrl.searchParams);
    return ok(await getSiteContent());
  } catch (e) {
    return handleError(e);
  }
}
