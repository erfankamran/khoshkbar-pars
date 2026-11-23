import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { userListQuerySchema, userUpdateSchema } from '@/server/validators/admin.schema';
import { pageOffset } from './shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';

/**
 * مدیریت کاربران (فاز ۱۴ + فیلتر جغرافیایی استان/شهر — درخواست کاربر) — فهرست، مسدودسازی، تغییر نقش
 *
 * گاردهای امنیتی:
 * - مدیر نمی‌تواند نقش خودش را عوض کند یا خودش را مسدود کند (قفل‌شدن پنل)
 * - آخرین مدیر فعال قابل حذف/تنزل نیست (از دست رفتن دسترسی مدیریت)
 */

type UserListQuery = z.infer<typeof userListQuerySchema>;
type UserUpdateInput = z.infer<typeof userUpdateSchema>;

/** استخراج province/city از JSON addressSnapshot — خطا نادیده گرفته می‌شود */
function parseSnapshotGeo(snapshot: string | null): { province?: string; city?: string } | null {
  try {
    const snap = JSON.parse(snapshot ?? '{}') as { province?: string; city?: string };
    return snap;
  } catch {
    return null;
  }
}

export async function listAdminUsers(query: UserListQuery) {
  const andFilters: Prisma.UserWhereInput[] = [
    query.q
      ? {
          OR: [
            { phone: { contains: query.q } },
            { fullName: { contains: query.q } },
          ],
        }
      : {},
    query.filter === 'active' ? { isActive: true } : {},
    query.filter === 'blocked' ? { isActive: false } : {},
    query.filter === 'admins' ? { role: 'ADMIN' } : {},
    query.filter === 'partners' ? { role: 'PARTNER' } : {},
  ];

  // ——— فیلتر جغرافیایی (استان/شهر): از آدرس‌های ذخیره‌شده + snapshot سفارش‌ها ———
  // snapshot با JSON.stringify بدون فاصله ذخیره می‌شود → جستجوی «key":"value» دقیق است
  if (query.province || query.city) {
    const addressWhere: Prisma.AddressWhereInput = {
      ...(query.province ? { province: query.province } : {}),
      ...(query.city ? { city: query.city } : {}),
    };
    const snapshotContains = query.city
      ? `"city":"${query.city}"`
      : `"province":"${query.province}"`;
    const [addrRows, orderRows] = await Promise.all([
      db.address.findMany({ where: addressWhere, select: { userId: true }, distinct: ['userId'] }),
      db.order.findMany({
        where: { addressSnapshot: { contains: snapshotContains } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);
    const ids = [...new Set([...addrRows, ...orderRows].map((r) => r.userId))];
    andFilters.push({ id: { in: ids } });
  }

  const where: Prisma.UserWhereInput = { AND: andFilters };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.pageSize,
      skip: pageOffset(query.page, query.pageSize),
      select: {
        id: true,
        phone: true,
        fullName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        avatarUrl: true,
        _count: { select: { orders: true, addresses: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  // ——— موقعیت هر کاربر صفحه (استان/شهر از آدرس‌ها + snapshot سفارش‌ها) ———
  // دو query دسته‌ای برای کل صفحه — بدون N+1
  const pageIds = users.map((u) => u.id);
  const locMap = new Map<string, { provinces: Map<string, number>; cities: Map<string, number> }>();
  const bumpLoc = (userId: string, province?: string | null, city?: string | null) => {
    if (!province?.trim() && !city?.trim()) return;
    let entry = locMap.get(userId);
    if (!entry) {
      entry = { provinces: new Map(), cities: new Map() };
      locMap.set(userId, entry);
    }
    const p = province?.trim();
    const c = city?.trim();
    if (p) entry.provinces.set(p, (entry.provinces.get(p) ?? 0) + 1);
    if (c) entry.cities.set(c, (entry.cities.get(c) ?? 0) + 1);
  };
  if (pageIds.length) {
    const [locAddrRows, locOrderRows] = await Promise.all([
      db.address.findMany({
        where: { userId: { in: pageIds } },
        select: { userId: true, province: true, city: true },
      }),
      db.order.findMany({
        where: { userId: { in: pageIds } },
        select: { userId: true, addressSnapshot: true },
      }),
    ]);
    for (const r of locAddrRows) bumpLoc(r.userId, r.province, r.city);
    for (const r of locOrderRows) {
      const snap = parseSnapshotGeo(r.addressSnapshot);
      if (snap) bumpLoc(r.userId, snap.province, snap.city);
    }
  }
  const sortKeys = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const usersWithLocations = users.map((u) => {
    const entry = locMap.get(u.id);
    return {
      ...u,
      locations: entry
        ? { provinces: sortKeys(entry.provinces), cities: sortKeys(entry.cities) }
        : { provinces: [], cities: [] },
    };
  });

  return { users: usersWithLocations, total, page: query.page, pageSize: query.pageSize };
}

/**
 * استان‌ها/شهرهای یکتا برای فیلترهای جغرافیایی صفحهٔ کاربران —
 * تعداد «کاربر یکتا» برای هر استان و شهر (از آدرس‌ها + snapshot سفارش‌ها)
 */
export async function getAdminUsersGeo() {
  const [addrRows, orderRows] = await Promise.all([
    db.address.findMany({ select: { userId: true, province: true, city: true } }),
    db.order.findMany({ select: { userId: true, addressSnapshot: true } }),
  ]);

  const tree = new Map<string, { users: Set<string>; cities: Map<string, Set<string>> }>();
  const bump = (province?: string | null, city?: string | null, userId?: string) => {
    const p = province?.trim();
    const c = city?.trim();
    if (!p && !c) return;
    // فقط استان شناخته‌شده؛ شهر بدون استان → «سایر» نمی‌سازیم (دادهٔ ناقص نادیده می‌شود)
    if (!p) return;
    let node = tree.get(p);
    if (!node) {
      node = { users: new Set(), cities: new Map() };
      tree.set(p, node);
    }
    if (userId) node.users.add(userId);
    if (!c) return;
    if (!node.cities.has(c)) node.cities.set(c, new Set());
    if (userId) node.cities.get(c)!.add(userId);
  };
  for (const r of addrRows) bump(r.province, r.city, r.userId);
  for (const r of orderRows) {
    const snap = parseSnapshotGeo(r.addressSnapshot);
    if (snap) bump(snap.province, snap.city, r.userId);
  }

  const provinces = [...tree.entries()]
    .map(([name, node]) => ({
      name,
      users: node.users.size,
      cities: [...node.cities.entries()]
        .sort((a, b) => b[1].size - a[1].size)
        .map(([city]) => city),
    }))
    .sort((a, b) => b.users - a.users || a.name.localeCompare(b.name, 'fa'));
  const cities = [...tree.entries()]
    .flatMap(([province, node]) =>
      [...node.cities.entries()].map(([name, users]) => ({
        name,
        province,
        users: users.size,
      }))
    )
    .sort((a, b) => b.users - a.users || a.name.localeCompare(b.name, 'fa'));

  return { provinces, cities };
}

export async function updateAdminUser(
  id: string,
  input: UserUpdateInput,
  actor: { id: string }
) {
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, phone: true, role: true, isActive: true },
  });
  if (!target) throw ApiError.notFound('کاربر یافت نشد');

  // ——— گارد ۱: خود ———
  if (target.id === actor.id) {
    throw new ApiError(400, 'SELF_MODIFY', 'تغییر نقش یا وضعیت حساب خودتان مجاز نیست');
  }

  const losesAdmin =
    target.role === 'ADMIN' &&
    target.isActive &&
    ((input.role !== undefined && input.role !== 'ADMIN') || input.isActive === false);
  if (losesAdmin) {
    const activeAdmins = await db.user.count({
      where: { role: 'ADMIN', isActive: true },
    });
    if (activeAdmins <= 1) {
      throw new ApiError(
        409,
        'LAST_ADMIN',
        'حداقل یک مدیر فعال باید باقی بماند — ابتدا مدیر دیگری اضافه کنید'
      );
    }
  }

  const user = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({
    where: { id },
    data: {
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
    },
    select: { id: true, phone: true, role: true, isActive: true },
    });
    if (input.role === 'PARTNER') {
      await tx.partnerRequest.updateMany({ where: { userId: id }, data: {
        status: 'APPROVED', reviewedById: actor.id, reviewedAt: new Date(), reviewNote: null,
      } });
    } else if (input.role) {
      await tx.partnerRequest.updateMany({ where: { userId: id, status: { in: ['APPROVED', 'PENDING'] } }, data: {
        status: 'REVOKED', reviewedById: actor.id, reviewedAt: new Date(), reviewNote: 'نقش حساب توسط مدیریت تغییر کرد',
      } });
    }
    return updated;
  });

  // مسدودسازی → باطل‌کردن همه نشست‌های فعال (خروج فوری از همه دستگاه‌ها)
  if (input.isActive === false) {
    await db.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return { user };
}

// ——— جزئیات کامل کاربر (درخواست کاربر) ———
// پروفایل + آمار خرید + سفارش‌های اخیر + آدرس‌ها — همه‌چیز در یک نگاه
/** وضعیت‌هایی که «خرید موفق» حساب می‌شوند — لغوشده و در انتظار پرداخت مستثنا */
const PAID_STATUSES = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const;

export async function getAdminUserDetail(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      role: true,
      isActive: true,
      phoneVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { orders: true, addresses: true } },
    },
  });
  if (!user) throw ApiError.notFound('کاربر یافت نشد');

  // ——— آمار سفارش‌ها با یک groupBy — Expected queries: ۲ ———
  const groups = await db.order.groupBy({
    by: ['status'],
    where: { userId: id },
    _count: { _all: true },
    _sum: { totalToman: true },
  });

  let totalSpentToman = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let canceledCount = 0;
  for (const g of groups) {
    const count = g._count._all;
    const sum = g._sum.totalToman ?? 0;
    if ((PAID_STATUSES as readonly string[]).includes(g.status)) {
      paidCount += count;
      totalSpentToman += sum;
    } else if (g.status === 'PENDING_PAYMENT') {
      pendingCount += count;
    } else if (g.status === 'CANCELED') {
      canceledCount += count;
    }
  }

  // ——— ۱۰ سفارش اخیر + همه آدرس‌ها — Expected queries: ۴ ———
  const [recentOrders, addresses] = await Promise.all([
    db.order.findMany({
      where: { userId: id },
      select: {
        id: true,
        code: true,
        status: true,
        totalToman: true,
        discountToman: true,
        paymentMethod: true,
        paymentStatus: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.address.findMany({
      where: { userId: id },
      select: {
        id: true,
        title: true,
        receiverName: true,
        receiverPhone: true,
        province: true,
        city: true,
        postalCode: true,
        fullAddress: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  const lastOrderAt = recentOrders[0]?.createdAt ?? null;

  return {
    user,
    stats: {
      totalSpentToman,
      paidCount,
      pendingCount,
      canceledCount,
      totalCount: paidCount + pendingCount + canceledCount,
      lastOrderAt,
    },
    recentOrders,
    addresses,
  };
}
