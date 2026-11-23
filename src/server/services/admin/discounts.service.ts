import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { discountCreateSchema, discountUpdateSchema } from '@/server/validators/admin.schema';
import { isUniqueViolation, pageOffset } from './shared';
import type { z } from 'zod';

/**
 * مدیریت کدهای تخفیف (فاز ۱۴) — CRUD کامل با آمار مصرف
 * کد یکتا (uppercase) — PERCENT ۱..۱۰۰ / FIXED مبلغ تومان — اعتبارسنجی در schema
 */

type DiscountCreateInput = z.infer<typeof discountCreateSchema>;
type DiscountUpdateInput = z.infer<typeof discountUpdateSchema>;

const LIST_SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  minSubtotalToman: true,
  maxDiscountToman: true,
  usageLimit: true,
  usedCount: true,
  startsAt: true,
  expiresAt: true,
  isActive: true,
  createdAt: true,
} as const;

export async function listAdminDiscounts(query: { page: number; pageSize: number }) {
  const [discounts, total] = await Promise.all([
    db.discountCode.findMany({
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: query.pageSize,
      skip: pageOffset(query.page, query.pageSize),
    }),
    db.discountCode.count(),
  ]);
  return { discounts, total, page: query.page, pageSize: query.pageSize };
}

export async function createAdminDiscount(input: DiscountCreateInput) {
  try {
    const discount = await db.discountCode.create({
      data: {
        code: input.code,
        type: input.type,
        value: input.value,
        minSubtotalToman: input.minSubtotalToman ?? null,
        maxDiscountToman: input.maxDiscountToman ?? null,
        usageLimit: input.usageLimit ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        isActive: input.isActive,
      },
    });
    return { discount };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ApiError(409, 'CODE_TAKEN', 'این کد تخفیف قبلاً ثبت شده است');
    }
    throw e;
  }
}

export async function updateAdminDiscount(id: string, input: DiscountUpdateInput) {
  const existing = await db.discountCode.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('کد تخفیف یافت نشد');
  const discount = await db.discountCode.update({
    where: { id },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.minSubtotalToman !== undefined
        ? { minSubtotalToman: input.minSubtotalToman }
        : {}),
      ...(input.maxDiscountToman !== undefined
        ? { maxDiscountToman: input.maxDiscountToman }
        : {}),
      ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
      ...(input.startsAt !== undefined
        ? { startsAt: input.startsAt ? new Date(input.startsAt) : null }
        : {}),
      ...(input.expiresAt !== undefined
        ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return { discount };
}

export async function deleteAdminDiscount(id: string) {
  const existing = await db.discountCode.findUnique({
    where: { id },
    select: { id: true, code: true },
  });
  if (!existing) throw ApiError.notFound('کد تخفیف یافت نشد');
  await db.discountCode.delete({ where: { id } });
  return { deleted: existing.code };
}
