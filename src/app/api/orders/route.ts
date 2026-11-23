import type { NextRequest } from 'next/server';
import { createOrderFromCart, listOrdersForUser } from '@/server/services/order.service';
import { getSessionUser } from '@/server/lib/auth';
import { ApiError, handleError, ok, readJson } from '@/server/lib/api';
import { createOrderSchema, listOrdersQuerySchema } from '@/server/validators/order.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders — فهرست سفارش‌های کاربر جاری (صفحه‌بندی)
 * Expected queries: 5 (نشست ۲ + سفارش‌ها ۱ + آیتم‌ها IN ۱ + تصاویر batch-IN ۱)
 * — اندازه‌گیری‌شده در measure-queries.sh
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'برای مشاهده سفارش‌ها وارد حساب شوید');
    const query = listOrdersQuerySchema.parse(
      Object.fromEntries(new URL(req.url).searchParams.entries())
    );
    return ok(await listOrdersForUser(user, query.page));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * POST /api/orders — ثبت سفارش از سبد کاربر با Snapshot کامل قیمت
 * Expected queries: خواندن ~۱۰ (نشست ۲ + سبد ۱ + getCartData ۵ + کد ~۲) +
 * تراکنش به‌ازای هر ردیف ۳ دستور + سفارش ۱ + پاک‌سازی سبد ۱ — اندازه‌گیری‌شده
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'برای ثبت سفارش وارد حساب شوید');
    const body = createOrderSchema.parse(await readJson(req));
    // origin برای آدرس بازگشت از درگاه پرداخت (فاز ۱۶)
    return ok(await createOrderFromCart(user, body, { origin: req.nextUrl.origin }));
  } catch (e) {
    return handleError(e);
  }
}
