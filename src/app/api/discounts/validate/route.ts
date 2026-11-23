import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError, handleError, ok, readJson } from '@/server/lib/api';
import { getSessionUser } from '@/server/lib/auth';
import { getCartData } from '@/server/services/cart.service';
import { resolveDiscountForSubtotal } from '@/server/services/discount.service';
import { getShippingSettings, resolveShippingFee } from '@/server/services/shipping.service';
import { discountCodeInputSchema } from '@/server/validators/discount.schema';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const validateBodySchema = z.object({
  code: discountCodeInputSchema,
  shippingMethodId: z.string().trim().max(24).optional(),
});

/**
 * POST /api/discounts/validate — پیش‌نمایش کد تخفیف روی سبد کاربر
 * برای دکمه «اعمال» در تسویه حساب — محاسبه نهایی همیشه دوباره در ثبت سفارش
 * انجام می‌شود (این endpoint فقط نمایش است، منبع حقیقت نیست)
 * Expected queries: ۵ (نشست ۱ + سبد ۱ + getCartData ۳)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      throw new ApiError(
        401,
        'UNAUTHENTICATED',
        'برای استفاده از کد تخفیف وارد حساب شوید'
      );
    }
    const { code, shippingMethodId } = validateBodySchema.parse(await readJson(req));

    const cart = await db.cart.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!cart) throw new ApiError(400, 'CART_EMPTY', 'سبد خرید شما خالی است');
    const cartData = await getCartData(cart.id);
    if (cartData.totals.itemCount === 0) {
      throw new ApiError(400, 'CART_EMPTY', 'سبد خرید شما خالی است');
    }

    const subtotalToman = cartData.totals.subtotalToman;
    const [applied, shipping] = await Promise.all([
      resolveDiscountForSubtotal(code, subtotalToman),
      getShippingSettings(),
    ]);
    const { feeToman } = resolveShippingFee(shipping, shippingMethodId, subtotalToman);
    return ok({
      ...applied,
      subtotalToman,
      payableAfterDiscount: subtotalToman - applied.discountToman + feeToman,
    });
  } catch (e) {
    return handleError(e);
  }
}
