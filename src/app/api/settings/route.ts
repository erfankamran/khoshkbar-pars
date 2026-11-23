import type { NextRequest } from 'next/server';
import { getPublicSettings } from '@/server/services/content.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { emptyQuerySchema } from '@/server/validators/catalog.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/settings — فقط کلیدهای عمومی (whitelist):
 * آستانه ارسال رایگان، هزینه ارسال، حداقل سفارش، وضعیت فروشگاه، تلفن پشتیبانی
 * Expected queries: 1
 */
export async function GET(req: NextRequest) {
  try {
    parseQuery(emptyQuerySchema, req.nextUrl.searchParams);
    const data = await getPublicSettings();
    return ok(data);
  } catch (e) {
    return handleError(e);
  }
}
