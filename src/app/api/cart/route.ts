import type { NextRequest } from 'next/server';
import {
  applyDeviceIdentity,
  getCartData,
  resolveCart,
} from '@/server/services/cart.service';
import { handleError, ok } from '@/server/lib/api';
import { PRIVATE_PRICING_HEADERS } from '@/server/lib/customer-pricing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cart — سبد کامل با قیمت‌های معتبر سرور و مبالغ نهایی
 * مالک سبد: کاربر واردشده (نشست) یا مهمان (کوکی دستگاه)
 * Expected queries: مهمان 10 (تراکنش upsert سبد ۵ + خواندن ۵)؛
 * کاربر واردشده ۷ (نشست ۱ + upsert سبد ۱ + خواندن ۵) — اندازه‌گیری‌شده
 */
export async function GET(req: NextRequest) {
  try {
    const { cartId, deviceId, isNewDevice } = await resolveCart(req);
    const data = await getCartData(cartId);
    const res = ok(data, PRIVATE_PRICING_HEADERS);
    // هویت دستگاه: کوکی (SameSite=None روی HTTPS) + هدر پاسخ برای Adoption
    // کلاینت وقتی مرورگر کوکی را در iframe بین‌سایتی نگه نمی‌دارد
    if (deviceId) applyDeviceIdentity(res, deviceId, req);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
