import type { NextRequest } from 'next/server';
import {
  addItem,
  applyDeviceIdentity,
  resolveCart,
} from '@/server/services/cart.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { addCartItemSchema } from '@/server/validators/cart.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cart/items — افزودن/افزایش کالا
 * مالک سبد: کاربر واردشده یا مهمان — از resolveCart
 * Expected queries: مهمان ۱۴ (نشست ۰ + واریانت+محصول ۲ + upsert ۵ + ردیف موجود ۱ + نوشتن ۱ + خواندن ۵)
 * — اندازه‌گیری‌شده؛ ثابت و مستقل از تعداد ردیف‌های قبلی سبد
 */
export async function POST(req: NextRequest) {
  try {
    const { cartId, deviceId, isNewDevice } = await resolveCart(req);
    const body = addCartItemSchema.parse(await readJson(req));
    const data = await addItem(cartId, body);
    const res = ok(data);
    if (deviceId) applyDeviceIdentity(res, deviceId, req);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
