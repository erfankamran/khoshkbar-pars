import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import type { Prisma } from '@prisma/client';
import { formatPrice, toEnDigits, toFaDigits } from '@/lib/fa';

/**
 * سرویس کد تخفیف — سمت مشتری (فاز ۱۱.۴)
 *
 * منبع حقیقت اعتبارسنجی و محاسبهٔ تخفیف برای endpoint پیش‌نمایش
 * (POST /api/discounts/validate) و ثبت سفارش.
 *
 * قواعد:
 * - کد باید فعال باشد و در بازه شروع/پایان (اگر تعریف شده) قرار گیرد
 * - حداقل مبلغ سبد (minSubtotalToman) باید رعایت شود
 * - ثبت سفارش ظرفیت کد را در همان تراکنش سفارش و موجودی مصرف می‌کند.
 * - PERCENT: floor(درصد × جمع کالاها) با سقف اختیاری maxDiscountToman
 * - FIXED: مبلغ ثابت حداکثر تا جمع کالاها (تخفیف هرگز منفی/بیش از سبد نمی‌شود)
 */

export interface AppliedDiscountDTO {
  code: string;
  type: string;
  value: number;
  discountToman: number;
  /** توضیح فارسی برای نمایش در UI */
  description: string;
}

/** نتیجه کامل برای ثبت سفارش — id و usageLimit برای تراکنش گارددار لازم است */
export interface ResolvedDiscount extends AppliedDiscountDTO {
  id: string;
  usageLimit: number | null;
}

/** محاسبه مبلغ تخفیف برای یک جمع کالا — خالص و بدون I/O */
export function computeDiscount(
  discount: { type: string; value: number; maxDiscountToman: number | null },
  subtotalToman: number
): number {
  const raw =
    discount.type === 'PERCENT'
      ? Math.floor((subtotalToman * discount.value) / 100)
      : discount.value;
  const capped = discount.type === 'PERCENT' && discount.maxDiscountToman !== null
    ? Math.min(raw, discount.maxDiscountToman)
    : raw;
  return Math.max(0, Math.min(capped, subtotalToman));
}

function discountDescription(d: {
  type: string;
  value: number;
  maxDiscountToman: number | null;
}): string {
  return d.type === 'PERCENT'
    ? `${toFaDigits(d.value)}٪ تخفیف${d.maxDiscountToman !== null ? ` (تا سقف ${formatPrice(d.maxDiscountToman)})` : ''}`
    : `${formatPrice(d.value)} تخفیف`;
}

/**
 * اعتبارسنجی و محاسبه کد برای جمع کالای مشخص
 * خطاها: 404 INVALID_CODE | 409 CODE_INACTIVE | 409 CODE_EXPIRED |
 *        409 CODE_NOT_STARTED | 400 MIN_SUBTOTAL | 409 CODE_USAGE_LIMIT |
 *        400 CODE_NOT_APPLICABLE
 */
export async function resolveDiscountForSubtotal(
  codeInput: string,
  subtotalToman: number,
  database: Pick<Prisma.TransactionClient, 'discountCode'> = db
): Promise<ResolvedDiscount> {
  const code = toEnDigits(codeInput.trim()).toUpperCase();
  if (!code) {
    throw new ApiError(404, 'INVALID_CODE', 'کد تخفیف را وارد کنید');
  }

  const discount = await database.discountCode.findUnique({ where: { code } });
  if (!discount) {
    throw new ApiError(404, 'INVALID_CODE', 'کد تخفیف معتبر نیست');
  }
  if (!discount.isActive) {
    throw new ApiError(409, 'CODE_INACTIVE', 'این کد تخفیف غیرفعال است');
  }

  const now = new Date();
  if (discount.startsAt && discount.startsAt.getTime() > now.getTime()) {
    throw new ApiError(409, 'CODE_NOT_STARTED', 'این کد هنوز شروع نشده است');
  }
  if (discount.expiresAt && discount.expiresAt.getTime() < now.getTime()) {
    throw new ApiError(409, 'CODE_EXPIRED', 'مهلت استفاده از این کد تمام شده است');
  }
  if (discount.usageLimit !== null && discount.usedCount >= discount.usageLimit) {
    throw new ApiError(409, 'CODE_USAGE_LIMIT', 'ظرفیت استفاده از این کد پر شده است');
  }
  if (discount.minSubtotalToman !== null && subtotalToman < discount.minSubtotalToman) {
    throw new ApiError(
      400,
      'MIN_SUBTOTAL',
      `حداقل جمع کالاها برای این کد ${formatPrice(discount.minSubtotalToman)} است`
    );
  }

  const discountToman = computeDiscount(discount, subtotalToman);
  if (discountToman <= 0) {
    throw new ApiError(400, 'CODE_NOT_APPLICABLE', 'این کد برای سبد فعلی قابل استفاده نیست');
  }

  return {
    id: discount.id,
    code: discount.code,
    type: discount.type,
    value: discount.value,
    discountToman,
    usageLimit: discount.usageLimit,
    description: discountDescription(discount),
  };
}

/** Recheck the discount before committing, including a concurrent change to its usage limit. */
export async function consumeDiscountForOrder(
  tx: Prisma.TransactionClient,
  quoted: ResolvedDiscount,
  subtotalToman: number
) {
  const current = await resolveDiscountForSubtotal(quoted.code, subtotalToman, tx);
  if (current.id !== quoted.id || current.discountToman !== quoted.discountToman) {
    throw new ApiError(409, 'CODE_CHANGED', 'شرایط کد تخفیف تغییر کرده است. کد را دوباره اعمال کنید.');
  }

  const used = await tx.discountCode.updateMany({
    where: {
      id: current.id,
      OR: [
        { usageLimit: null },
        { usedCount: { lt: tx.discountCode.fields.usageLimit } },
      ],
    },
    data: { usedCount: { increment: 1 } },
  });
  if (used.count !== 1) {
    throw new ApiError(409, 'CODE_USAGE_LIMIT', 'ظرفیت استفاده از این کد پر شده است');
  }
}
