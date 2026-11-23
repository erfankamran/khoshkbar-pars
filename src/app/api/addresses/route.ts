import type { NextRequest } from 'next/server';
import { createAddress, listAddresses } from '@/server/services/address.service';
import { getSessionUser } from '@/server/lib/auth';
import { ApiError, handleError, ok, readJson } from '@/server/lib/api';
import { saveAddressSchema } from '@/server/validators/address.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/addresses — دفترچه آدرس کاربر جاری (پیش‌فرض اول)
 * Expected queries: 3 (نشست ۲ + فهرست ۱)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'برای مشاهده آدرس‌ها وارد حساب شوید');
    return ok(await listAddresses(user));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * POST /api/addresses — افزودن آدرس جدید (سقف ۱۰؛ اولین آدرس پیش‌فرض می‌شود)
 * Expected queries: ۷ (نشست ۲ + شمارش ۱ + تراکنش BEGIN + برداشتن پیش‌فرض + درج + COMMIT) — اندازه‌گیری‌شده
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'برای افزودن آدرس وارد حساب شوید');
    const body = saveAddressSchema.parse(await readJson(req));
    return ok(await createAddress(user, body));
  } catch (e) {
    return handleError(e);
  }
}
