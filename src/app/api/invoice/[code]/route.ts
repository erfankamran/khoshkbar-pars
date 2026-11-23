import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/server/lib/auth';
import { ApiError, handleError, ok } from '@/server/lib/api';
import { getInvoiceForUser } from '@/server/services/invoice.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invoice/[code] — دادهٔ فاکتور چاپی A5 (درخواست کاربر — گزینه ۲)
 * دسترسی: مالک سفارش یا ادمین؛ سفارش دیگران → 404 (ضد IDOR)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'برای مشاهده فاکتور وارد حساب شوید');
    }
    const { code } = await params;
    return ok(await getInvoiceForUser(user, code));
  } catch (e) {
    return handleError(e);
  }
}
