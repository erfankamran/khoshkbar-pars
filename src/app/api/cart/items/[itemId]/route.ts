import type { NextRequest } from 'next/server';
import {
  applyDeviceIdentity,
  removeItem,
  resolveCart,
  updateItem,
} from '@/server/services/cart.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import {
  cartItemIdParamSchema,
  updateCartItemSchema,
} from '@/server/validators/cart.schema';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/cart/items/[itemId] — تغییر تعداد (با سقف موجودی)
 * مالک سبد از resolveCart — ردیف متعلق به همان سبد باشد (ضد IDOR)
 * Expected queries: 14 (نشست ۰-۱ + upsert ۵ + findFirst با واکشی ۳ + نوشتن ۱ + خواندن ۵) — اندازه‌گیری‌شده
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { cartId, deviceId, isNewDevice } = await resolveCart(req);
    const { itemId } = await params;
    const validItemId = cartItemIdParamSchema.parse(itemId);
    const body = updateCartItemSchema.parse(await readJson(req));
    const data = await updateItem(cartId, validItemId, body.quantity, body.weightGrams);
    const res = ok(data);
    if (deviceId) applyDeviceIdentity(res, deviceId, req);
    return res;
  } catch (e) {
    return handleError(e);
  }
}

/**
 * DELETE /api/cart/items/[itemId] — حذف ردیف
 * Expected queries: 11 (upsert ۵ + deleteMany ۱ + خواندن ۵؛ اگر آخرین ردیف حذف شود → ۸) — اندازه‌گیری‌شده
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { cartId, deviceId, isNewDevice } = await resolveCart(req);
    const { itemId } = await params;
    const validItemId = cartItemIdParamSchema.parse(itemId);
    const data = await removeItem(cartId, validItemId);
    const res = ok(data);
    if (deviceId) applyDeviceIdentity(res, deviceId, req);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
