import type { NextRequest } from 'next/server';
import { deleteAddress, updateAddress } from '@/server/services/address.service';
import { getSessionUser } from '@/server/lib/auth';
import { ApiError, handleError, ok, readJson } from '@/server/lib/api';
import { addressIdSchema, saveAddressSchema } from '@/server/validators/address.schema';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/addresses/[id] — ویرایش آدرس (فقط مالک — آدرس دیگری → 404)
 * Expected queries: ۶ (نشست ۲ + یافتن ۱ + تراکنش BEGIN + برداشتن پیش‌فرض + بروزرسانی + COMMIT) — اندازه‌گیری‌شده
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'برای ویرایش آدرس وارد حساب شوید');
    const { id } = await params;
    if (!addressIdSchema.safeParse(id).success) {
      throw new ApiError(400, 'VALIDATION', 'شناسه آدرس نامعتبر است');
    }
    const body = saveAddressSchema.parse(await readJson(req));
    return ok(await updateAddress(user, id, body));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * DELETE /api/addresses/[id] — حذف آدرس (فقط مالک؛ ارتقای جایگزین اگر پیش‌فرض بود)
 * Expected queries: ۷ (نشست ۲ + یافتن ۱ + تراکنش BEGIN + حذف + ارتقای جایگزین ۲ + COMMIT) — اندازه‌گیری‌شده
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'برای حذف آدرس وارد حساب شوید');
    const { id } = await params;
    if (!addressIdSchema.safeParse(id).success) {
      throw new ApiError(400, 'VALIDATION', 'شناسه آدرس نامعتبر است');
    }
    return ok(await deleteAddress(user, id));
  } catch (e) {
    return handleError(e);
  }
}
