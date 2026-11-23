import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/server/lib/auth';
import { ApiError, handleError, ok, readJson } from '@/server/lib/api';
import { verifyOrderPayment } from '@/server/services/payment-verify.service';
import { paymentVerifySchema } from '@/server/validators/order.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/verify — تأیید پرداخت پس از بازگشت از درگاه (فاز ۱۶)
 *
 * صفحه /payment/callback بعد از بازگشت کاربر از زیبال این را صدا می‌زند.
 * سرور مستقیماً به gateway.zibal.ir/v1/verify وصل می‌شود؛ پارامتر success
 * در URL بازگشت هرگز ملاک نیست (جعل‌پذیر). مالک سفارش الزامی (ضد IDOR).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'برای بررسی پرداخت وارد حساب شوید');
    const body = paymentVerifySchema.parse(await readJson(req));
    return ok(await verifyOrderPayment(user, body));
  } catch (e) {
    return handleError(e);
  }
}
