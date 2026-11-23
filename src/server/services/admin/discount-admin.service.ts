import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { logAdminAction, type AdminUser } from '@/server/lib/rbac';
import type {
  AdminDiscountCreate,
  AdminDiscountListQuery,
  AdminDiscountUpdate,
} from '@/server/validators/admin/discount-admin.schema';

/**
 * سرویس مدیریت کدهای تخفیف (فاز ۱۱.۴)
 *
 * - کد یکتاست (unique در دیتابیس) — تداخل → 409 CODE_EXISTS
 * - حذف کدِ استفاده‌شده ممنوع است (سفارش‌ها به آن ارجاع دارند) → 409 HAS_REFERENCES؛
 *   مسیر درست، غیرفعال‌سازی است (report دست نخورده می‌ماند)
 * - هر نوشتن با logAdminAction ردپای حسابرسی می‌گیرد
 *
 * Expected queries:
 *   GET /api/admin/discounts — ۲ (صفحه + شمارش) — بدون N+1
 *   POST — ۲ (یکتایی + insert) + لاگ
 *   PATCH — ۳ (خود + یکتایی در صورت تغییر کد + update) + لاگ
 *   DELETE — ۲ (خود + delete) + لاگ
 */

const PAGE_MAX = 50;

export interface AdminDiscountDTO {
  id: string;
  code: string;
  type: string;
  value: number;
  minSubtotalToman: number | null;
  maxDiscountToman: number | null;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  /** وضعیت محاسبه‌شده برای نمایش — کد فعال ممکن است منقضی شده باشد */
  liveStatus: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE';
  usedInOrders: number;
  createdAt: string;
}

export interface AdminDiscountListDTO {
  items: AdminDiscountDTO[];
  total: number;
  page: number;
  totalPages: number;
}

function toDTO(
  d: {
    id: string;
    code: string;
    type: string;
    value: number;
    minSubtotalToman: number | null;
    maxDiscountToman: number | null;
    usageLimit: number | null;
    usedCount: number;
    startsAt: Date | null;
    expiresAt: Date | null;
    isActive: boolean;
    createdAt: Date;
  },
  usedInOrders: number
): AdminDiscountDTO {
  const now = Date.now();
  let liveStatus: AdminDiscountDTO['liveStatus'];
  if (!d.isActive) liveStatus = 'INACTIVE';
  else if (d.startsAt && d.startsAt.getTime() > now) liveStatus = 'SCHEDULED';
  else if (d.expiresAt && d.expiresAt.getTime() < now) liveStatus = 'EXPIRED';
  else liveStatus = 'ACTIVE';

  return {
    id: d.id,
    code: d.code,
    type: d.type,
    value: d.value,
    minSubtotalToman: d.minSubtotalToman,
    maxDiscountToman: d.maxDiscountToman,
    usageLimit: d.usageLimit,
    usedCount: d.usedCount,
    startsAt: d.startsAt?.toISOString() ?? null,
    expiresAt: d.expiresAt?.toISOString() ?? null,
    isActive: d.isActive,
    liveStatus,
    usedInOrders,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function listAdminDiscounts(
  query: AdminDiscountListQuery
): Promise<AdminDiscountListDTO> {
  const where = {
    ...(query.status !== 'all' ? { isActive: query.status === 'active' } : {}),
    ...(query.q ? { code: { contains: query.q.toUpperCase() } } : {}),
  };

  const limit = Math.min(query.limit, PAGE_MAX);
  const [rows, total] = await Promise.all([
    db.discountCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * limit,
      take: limit,
    }),
    db.discountCode.count({ where }),
  ]);

  // تعداد سفارش‌های استفاده‌کننده — batch-IN (ضد N+1)
  const ids = rows.map((d) => d.id);
  const usageRows = ids.length
    ? await db.order.groupBy({
        by: ['discountCodeId'],
        where: { discountCodeId: { in: ids } },
        _count: { discountCodeId: true },
      })
    : [];
  const usageByCode = new Map(
    usageRows.map((u) => [u.discountCodeId as string, u._count.discountCodeId])
  );

  return {
    page: query.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    items: rows.map((d) => toDTO(d, usageByCode.get(d.id) ?? 0)),
  };
}

async function assertCodeFree(code: string, exceptId?: string): Promise<void> {
  const existing = await db.discountCode.findUnique({
    where: { code },
    select: { id: true },
  });
  if (existing && existing.id !== exceptId) {
    throw new ApiError(409, 'CODE_EXISTS', 'این کد قبلاً ثبت شده است');
  }
}

export async function createAdminDiscount(
  admin: AdminUser,
  req: NextRequest,
  input: AdminDiscountCreate
): Promise<AdminDiscountDTO> {
  await assertCodeFree(input.code);
  const created = await db.discountCode.create({
    data: {
      code: input.code,
      type: input.type,
      value: input.value,
      minSubtotalToman: input.minSubtotalToman ?? null,
      maxDiscountToman: input.type === 'PERCENT' ? (input.maxDiscountToman ?? null) : null,
      usageLimit: input.usageLimit ?? null,
      startsAt: input.startsAt ?? null,
      expiresAt: input.expiresAt ?? null,
      isActive: input.isActive,
    },
  });
  await logAdminAction(req, admin, 'DISCOUNT_CREATE', { id: created.id, code: created.code });
  return toDTO(created, 0);
}

/**
 * به‌روزرسانی — merge فیلدهای ارسالی روی مقدار فعلی، سپس همان قواعد create
 * (درصد ۱..۱۰۰ و پایان > شروع) تا حالت ناقص نیمه‌به‌روز نشود
 */
export async function updateAdminDiscount(
  admin: AdminUser,
  req: NextRequest,
  id: string,
  input: AdminDiscountUpdate
): Promise<AdminDiscountDTO> {
  const current = await db.discountCode.findUnique({ where: { id } });
  if (!current) throw ApiError.notFound('کد تخفیف یافت نشد');

  const merged = {
    code: input.code ?? current.code,
    type: input.type ?? current.type,
    value: input.value ?? current.value,
    minSubtotalToman:
      input.minSubtotalToman === undefined
        ? current.minSubtotalToman
        : input.minSubtotalToman,
    maxDiscountToman:
      input.maxDiscountToman === undefined ? current.maxDiscountToman : input.maxDiscountToman,
    usageLimit: input.usageLimit === undefined ? current.usageLimit : input.usageLimit,
    startsAt: input.startsAt === undefined ? current.startsAt : (input.startsAt ?? null),
    expiresAt: input.expiresAt === undefined ? current.expiresAt : (input.expiresAt ?? null),
    isActive: input.isActive ?? current.isActive,
  };

  // قواعد ترکیبی — خطای ۴۰۰ با پیام فارسی
  if (merged.type === 'PERCENT' && (merged.value < 1 || merged.value > 100)) {
    throw new ApiError(400, 'VALIDATION', 'درصد تخفیف باید بین ۱ تا ۱۰۰ باشد');
  }
  if (merged.type === 'FIXED' && merged.value < 1000) {
    throw new ApiError(400, 'VALIDATION', 'مبلغ تخفیف ثابت حداقل ۱۰۰۰ تومان است');
  }
  if (merged.type === 'FIXED') {
    merged.maxDiscountToman = null; // سقف فقط برای درصد معنا دارد
  }
  if (merged.startsAt && merged.expiresAt && merged.expiresAt <= merged.startsAt) {
    throw new ApiError(400, 'VALIDATION', 'تاریخ پایان باید بعد از تاریخ شروع باشد');
  }

  if (merged.code !== current.code) await assertCodeFree(merged.code, id);

  const updated = await db.discountCode.update({
    where: { id },
    data: {
      code: merged.code,
      type: merged.type,
      value: merged.value,
      minSubtotalToman: merged.minSubtotalToman,
      maxDiscountToman: merged.maxDiscountToman,
      usageLimit: merged.usageLimit,
      startsAt: merged.startsAt,
      expiresAt: merged.expiresAt,
      isActive: merged.isActive,
    },
  });
  await logAdminAction(req, admin, 'DISCOUNT_UPDATE', {
    id,
    code: updated.code,
    fields: Object.keys(input),
  });

  const usedInOrders = await db.order.count({ where: { discountCodeId: id } });
  return toDTO(updated, usedInOrders);
}

/** حذف — استفاده‌شده → 409 (به‌جای حذف، غیرفعال کنید) */
export async function deleteAdminDiscount(
  admin: AdminUser,
  req: NextRequest,
  id: string
): Promise<{ deleted: true }> {
  const current = await db.discountCode.findUnique({
    where: { id },
    select: { id: true, code: true, usedCount: true },
  });
  if (!current) throw ApiError.notFound('کد تخفیف یافت نشد');
  if (current.usedCount > 0) {
    throw new ApiError(
      409,
      'HAS_REFERENCES',
      'این کد در سفارش‌ها استفاده شده — به‌جای حذف، غیرفعالش کنید'
    );
  }
  await db.discountCode.delete({ where: { id } });
  await logAdminAction(req, admin, 'DISCOUNT_DELETE', { id, code: current.code });
  return { deleted: true };
}
