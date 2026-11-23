import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import type { NextRequest } from 'next/server';
import { logAdminAction, type AdminUser } from '@/server/lib/rbac';
import type {
  AdminUserAction,
  AdminUserListQuery,
} from '@/server/validators/admin/user-admin.schema';

/**
 * سرویس مدیریت کاربران (فاز ۱۱.۶ — بخش ۱۶ مشخصات: لیست کاربران، نقش‌ها)
 *
 * Expected queries:
 * - listAdminUsers: ۳ (count + صفحه + aggregate سفارش‌های همان صفحه) — بدون N+1
 * - getAdminUserDetail: ۶ (کاربر + ۴ شمارش + aggregate مبلغ + ۵ سفارش آخر)
 * - applyAdminUserAction: حداکثر ۴ (خواندن هدف + شمارش مدیران در صورت نیاز
 *   + به‌روزرسانی + ابطال نشست‌ها)
 *
 * حفاظت‌های حیاتی:
 * - هیچ مدیری نمی‌تواند روی حساب خودش اکشن تغییر نقش/غیرفعال‌سازی بزند
 *   (409 SELF_ACTION) — ضد قفل‌شدن پنل
 * - نقش/فعالیتِ آخرین مدیر فعال قابل سلب نیست (409 LAST_ADMIN)
 * - غیرفعال‌سازی فوراً دسترسی را می‌بندد: جلسه سمت سرور isActive را چک
 *   می‌کند (auth.ts) و همه نشست‌های فعال هم ابطال می‌شوند
 * - هر نوشتن با logAdminAction در SecurityLog ثبت می‌شود (ADMIN_ACTION)
 */

// ------------------------------------------------------------
// DTOها
// ------------------------------------------------------------

export interface AdminUserListDTO {
  items: Array<{
    id: string;
    phone: string;
    fullName: string | null;
    role: string;
    isActive: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    ordersCount: number;
    totalSpentToman: number;
  }>;
  total: number;
  page: number;
  totalPages: number;
}

export interface AdminUserDetailDTO {
  id: string;
  phone: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  stats: {
    ordersCount: number;
    reviewsCount: number;
    favoritesCount: number;
    addressesCount: number;
    totalSpentToman: number;
  };
  recentOrders: Array<{
    id: string;
    code: string;
    status: string;
    paymentStatus: string;
    totalToman: number;
    createdAt: string;
  }>;
}

// ------------------------------------------------------------
// لیست کاربران
// ------------------------------------------------------------

export async function listAdminUsers(
  query: AdminUserListQuery
): Promise<AdminUserListDTO> {
  const where = {
    ...(query.q
      ? {
          OR: [
            { phone: { contains: query.q } },
            { fullName: { contains: query.q } },
          ],
        }
      : {}),
    ...(query.role === 'all' ? {} : { role: query.role }),
    ...(query.status === 'all'
      ? {}
      : { isActive: query.status === 'ACTIVE' }),
  };

  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        phone: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
  ]);

  // aggregate سفارش‌های کاربران همین صفحه — یک groupBy، بدون N+1
  const pageIds = rows.map((r) => r.id);
  const orderAggs = pageIds.length
    ? await db.order.groupBy({
        by: ['userId'],
        where: { userId: { in: pageIds }, status: { not: 'CANCELED' } },
        _count: { _all: true },
        _sum: { totalToman: true },
      })
    : [];
  const aggMap = new Map(
    orderAggs.map((a) => [a.userId, { count: a._count._all, sum: a._sum.totalToman ?? 0 }])
  );

  return {
    items: rows.map((u) => ({
      id: u.id,
      phone: u.phone,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      ordersCount: aggMap.get(u.id)?.count ?? 0,
      totalSpentToman: aggMap.get(u.id)?.sum ?? 0,
    })),
    total,
    page: query.page,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

// ------------------------------------------------------------
// جزئیات کاربر
// ------------------------------------------------------------

export async function getAdminUserDetail(id: string): Promise<AdminUserDetailDTO> {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      phone: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });
  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'کاربر یافت نشد');
  }

  const [ordersCount, reviewsCount, favoritesCount, addressesCount, spentAgg, recentOrders] =
    await Promise.all([
      db.order.count({ where: { userId: id, status: { not: 'CANCELED' } } }),
      db.review.count({ where: { userId: id } }),
      db.favorite.count({ where: { userId: id } }),
      db.address.count({ where: { userId: id } }),
      db.order.aggregate({
        where: { userId: id, status: { not: 'CANCELED' } },
        _sum: { totalToman: true },
      }),
      db.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          code: true,
          status: true,
          paymentStatus: true,
          totalToman: true,
          createdAt: true,
        },
      }),
    ]);

  return {
    id: user.id,
    phone: user.phone,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    stats: {
      ordersCount,
      reviewsCount,
      favoritesCount,
      addressesCount,
      totalSpentToman: spentAgg._sum.totalToman ?? 0,
    },
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totalToman: o.totalToman,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

// ------------------------------------------------------------
// اقدامات (تغییر نقش / فعال‌سازی / غیرفعال‌سازی)
// ------------------------------------------------------------

export async function applyAdminUserAction(
  admin: AdminUser,
  req: NextRequest,
  id: string,
  input: AdminUserAction
): Promise<{ ok: true }> {
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, phone: true, role: true, isActive: true },
  });
  if (!target) {
    throw new ApiError(404, 'NOT_FOUND', 'کاربر یافت نشد');
  }

  if (input.action === 'SET_ROLE') {
    // خود-محافظتی: مدیر نقش خودش را عوض نمی‌کند
    if (target.id === admin.id) {
      throw new ApiError(409, 'SELF_ACTION', 'تغییر نقش حساب خودتان مجاز نیست');
    }
    // سلب نقشِ آخرین مدیر فعال ممنوع
    if (target.role === 'ADMIN' && input.role === 'USER') {
      const otherAdmins = await db.user.count({
        where: { role: 'ADMIN', isActive: true, id: { not: target.id } },
      });
      if (otherAdmins === 0) {
        throw new ApiError(
          409,
          'LAST_ADMIN',
          'آخرین مدیر فعال قابل حذف از نقش نیست'
        );
      }
    }
    if (target.role !== input.role) {
      await db.user.update({
        where: { id: target.id },
        data: { role: input.role },
        select: { id: true },
      });
    }
    await logAdminAction(req, admin, 'USER_SET_ROLE', {
      userId: target.id,
      phone: target.phone,
      from: target.role,
      to: input.role,
    });
    return { ok: true };
  }

  if (input.action === 'ACTIVATE') {
    if (!target.isActive) {
      await db.user.update({
        where: { id: target.id },
        data: { isActive: true },
        select: { id: true },
      });
    }
    await logAdminAction(req, admin, 'USER_ACTIVATE', {
      userId: target.id,
      phone: target.phone,
    });
    return { ok: true };
  }

  // ——— DEACTIVATE ———
  if (target.id === admin.id) {
    throw new ApiError(409, 'SELF_ACTION', 'غیرفعال‌سازی حساب خودتان مجاز نیست');
  }
  // غیرفعال‌سازیِ آخرین مدیر فعال هم پنل را قفل می‌کند — ممنوع
  if (target.role === 'ADMIN') {
    const otherAdmins = await db.user.count({
      where: { role: 'ADMIN', isActive: true, id: { not: target.id } },
    });
    if (otherAdmins === 0) {
      throw new ApiError(409, 'LAST_ADMIN', 'آخرین مدیر فعال قابل غیرفعال‌سازی نیست');
    }
  }
  if (target.isActive) {
    // ابطال همه نشست‌های فعال + خاموش کردن حساب — در یک تراکنش
    await db.$transaction([
      db.user.update({
        where: { id: target.id },
        data: { isActive: false },
        select: { id: true },
      }),
      db.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
  await logAdminAction(req, admin, 'USER_DEACTIVATE', {
    userId: target.id,
    phone: target.phone,
  });
  return { ok: true };
}
