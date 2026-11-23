import type { NextRequest } from 'next/server';
import { getOrderForUser } from '@/server/services/order.service';
import { getSessionUser } from '@/server/lib/auth';
import { ApiError, handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

const CODE_RE = /^PARS-\d{8}-[A-Z2-9]{4}$/;

/**
 * GET /api/orders/[code] — جزئیات سفارش (فقط مالک — سفارش دیگران → 404)
 * Expected queries: 6 (نشست ۲ + سفارش+آیتم‌ها ۲ + تصاویر batch-IN ۱) — اندازه‌گیری‌شده
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'برای مشاهده سفارش وارد حساب شوید');
    const { code } = await params;
    if (!CODE_RE.test(code)) {
      throw new ApiError(400, 'VALIDATION', 'کد سفارش نامعتبر است');
    }
    return ok(await getOrderForUser(user, code));
  } catch (e) {
    return handleError(e);
  }
}
