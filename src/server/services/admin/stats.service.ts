import { db } from '@/lib/db';
import {
  jalaliDayKey,
  jalaliMonthKey,
  lastJalaliMonths,
  formatJalaliDayShort,
} from '@/lib/jalali';
import { toFaDigits } from '@/lib/fa';

/**
 * سرویس آمار داشبورد مدیریت (فاز ۱۱ + گزارش‌های فروش روزانه/ماهانه و وضعیت مشتری‌ها)
 *
 * همه aggregate/groupBy/findMany دسته‌ای؛ هیچ N+1:
 *   درآمد امروز/هفته/ماه ۳ + وضعیت سفارش‌ها ۱ + سفارش امروز ۱ +
 *   کاربران کل/امروز/۳۰روز/مسدود ۴ + محصول فعال ۱ + نظرات در انتظار ۱ + مجموع اقلام ۱ +
 *   پرفروش‌ها (groupBy ۱ + عنوان‌ها ۱) + سفارش‌های اخیر ۱ + موجودی کم ۱ +
 *   سری زمانی روز/ماه ۱ (گروه‌بندی در JS بر اساس تقویم تهران) +
 *   خریداران (groupBy ۱) + مشتریان برتر (groupBy ۱ + کاربران ۱) + مشتریان اخیر (findMany ۱ + groupBy ۱)
 *
 * - درآمد = مجموع totalToman سفارش‌های غیرلغوشده (CANCELED حذف می‌شود)
 * - گروه‌بندی روز/ماه بر اساس تقویم تهران (+۳:۳۰) — همسو با نمایش جلالی
 * - مبالغ همیشه عدد صحیح تومان
 */

export interface AdminStatsDTO {
  revenue: {
    todayToman: number;
    weekToman: number;
    monthToman: number;
  };
  // ——— گزارش‌های فروش (درخواست کاربر: ماهانه + روزانه) ———
  /** ۳۰ روز اخیر — قدیمی‌ترین → امروز؛ برچسب کوتاه برای محور و کامل برای تولتیپ */
  dailySales: Array<{
    shortLabel: string;
    label: string;
    revenueToman: number;
    ordersCount: number;
  }>;
  /** ۱۲ ماه جلالی اخیر — قدیمی‌ترین → ماه جاری؛ برچسب = نام ماه */
  monthlySales: Array<{
    label: string;
    revenueToman: number;
    ordersCount: number;
  }>;
  /** میانگین مبلغ هر سفارش غیرلغوشده در ۳۰ روز اخیر */
  avgOrderToman30: number;
  ordersByStatus: Record<string, number>;
  ordersToday: number;
  // ——— وضعیت سریع مشتری‌ها (درخواست کاربر) ———
  customers: {
    total: number;
    /** دست‌کم ۱ سفارش غیرلغوشده */
    buyers: number;
    /** دست‌کم ۲ سفارش غیرلغوشده */
    repeatBuyers: number;
    /** ثبت‌نام‌شده در ۳۰ روز اخیر */
    newLast30: number;
    /** مسدودشده (isActive=false) */
    blocked: number;
  };
  /** ۵ مشتری برتر بر اساس مبلغ خرید کل (غیرلغوشده) */
  topCustomers: Array<{
    id: string;
    fullName: string | null;
    phone: string;
    avatarUrl: string | null;
    ordersCount: number;
    totalSpentToman: number;
  }>;
  users: {
    total: number;
    today: number;
  };
  activeProducts: number;
  pendingReviews: number;
  topProducts: Array<{
    productId: string;
    title: string;
    quantity: number;
    revenueToman: number;
  }>;
  recentOrders: Array<{
    code: string;
    status: string;
    paymentStatus: string;
    totalToman: number;
    createdAt: string;
    customerUserId: string;
    customerName: string | null;
    customerPhone: string;
  }>;
  // مشتریان اخیر — کلیک‌پذیر روی داشبورد → دیالوگ جزئیات کاربر
  recentUsers: Array<{
    id: string;
    fullName: string | null;
    phone: string;
    avatarUrl: string | null;
    role: string;
    isActive: boolean;
    createdAt: string;
    ordersCount: number;
    totalSpentToman: number;
  }>;
  lowStock: Array<{
    productTitle: string;
    weightGrams: number;
    stock: number;
  }>;
  totalItemsSold: number;
  // ——— پراکندگی جغرافیایی فروش/مشتری (نقشهٔ ایران داشبورد — درخواست کاربر) ———
  geo: {
    /** استان‌ها مرتب بر اساس فروش نزولی — فقط استان‌های دارای داده (آدرس یا سفارش) */
    provinces: Array<{
      name: string;
      revenueToman: number;
      ordersCount: number;
      /** تعداد کاربر یکتا — از snapshot سفارش‌ها + دفترچهٔ آدرس */
      customers: number;
      /** شهرهای استان مرتب بر تعداد کاربر */
      cities: string[];
    }>;
    /** استان دارای دست‌کم یک سفارش غیرلغوشده */
    provincesWithSales: number;
    /** شهرهای یکتا با دست‌کم یک سفارش غیرلغوشده */
    citiesWithSales: number;
  };
}

const LOW_STOCK_THRESHOLD = 5;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
}

export async function getAdminStats(): Promise<AdminStatsDTO> {
  const today = startOfToday();
  const week = daysAgo(6);
  const month = daysAgo(29);
  const notCanceled = { not: 'CANCELED' as const };

  // ——— درآمد (۳ aggregate) ———
  const [todayAgg, weekAgg, monthAgg] = await Promise.all([
    db.order.aggregate({
      where: { createdAt: { gte: today }, status: notCanceled },
      _sum: { totalToman: true },
    }),
    db.order.aggregate({
      where: { createdAt: { gte: week }, status: notCanceled },
      _sum: { totalToman: true },
    }),
    db.order.aggregate({
      where: { createdAt: { gte: month }, status: notCanceled },
      _sum: { totalToman: true },
    }),
  ]);

  // ——— شمارش‌ها (۹ query) ———
  const [
    statusRows,
    ordersToday,
    usersTotal,
    usersToday,
    usersLast30,
    usersBlocked,
    activeProducts,
    pendingReviews,
    totalSoldAgg,
  ] = await Promise.all([
    db.order.groupBy({ by: ['status'], _count: { _all: true } }),
    db.order.count({ where: { createdAt: { gte: today } } }),
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: today } } }),
    db.user.count({ where: { createdAt: { gte: month } } }),
    db.user.count({ where: { isActive: false } }),
    db.product.count({ where: { isActive: true } }),
    db.review.count({ where: { isApproved: false } }),
    db.orderItem.aggregate({
      where: { order: { status: notCanceled } },
      _sum: { quantity: true },
    }),
  ]);

  const ordersByStatus: Record<string, number> = {};
  for (const row of statusRows) {
    ordersByStatus[row.status] = row._count._all;
  }

  // ——— سری زمانی روز/ماه — یک findMany، گروه‌بندی در JS بر تقویم تهران ———
  const seriesRows = await db.order.findMany({
    where: { createdAt: { gte: daysAgo(379) }, status: notCanceled },
    select: { createdAt: true, totalToman: true },
  });

  // روزانه — اسکلت ۳۰ روز (روز جلالی تهران) و پرکردن از روی سفارش‌ها
  const dailyBuckets = new Map<string, { revenueToman: number; ordersCount: number }>();
  const daySkeleton: Array<{ key: string; shortLabel: string; label: string }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i);
    const key = jalaliDayKey(d);
    dailyBuckets.set(key, { revenueToman: 0, ordersCount: 0 });
    daySkeleton.push({ key, shortLabel: toFaDigits(new Date(d.getTime() + 3.5 * 3600 * 1000).getUTCDate()), label: formatJalaliDayShort(d) });
  }
  for (const row of seriesRows) {
    const bucket = dailyBuckets.get(jalaliDayKey(row.createdAt));
    if (bucket) {
      bucket.revenueToman += row.totalToman;
      bucket.ordersCount += 1;
    }
  }
  const dailySales = daySkeleton.map((d) => ({
    shortLabel: d.shortLabel,
    label: d.label,
    ...(dailyBuckets.get(d.key) as { revenueToman: number; ordersCount: number }),
  }));

  // ماهانه — ۱۲ ماه جلالی اخیر
  const months = lastJalaliMonths(12);
  const monthMap = new Map(
    months.map((m) => [m.key, { label: m.label, revenueToman: 0, ordersCount: 0 }])
  );
  for (const row of seriesRows) {
    const bucket = monthMap.get(jalaliMonthKey(row.createdAt).key);
    if (bucket) {
      bucket.revenueToman += row.totalToman;
      bucket.ordersCount += 1;
    }
  }
  const monthlySales = months.map((m) => monthMap.get(m.key)!);
  const orders30 = dailySales.reduce((s, d) => s + d.ordersCount, 0);
  const revenue30 = dailySales.reduce((s, d) => s + d.revenueToman, 0);

  // ——— وضعیت سریع مشتری‌ها + مشتریان برتر ———
  const [buyerRows, topCustomerRows] = await Promise.all([
    db.order.groupBy({
      by: ['userId'],
      where: { status: notCanceled },
      _count: { _all: true },
    }),
    db.order.groupBy({
      by: ['userId'],
      where: { status: notCanceled },
      _sum: { totalToman: true },
      _count: { _all: true },
      orderBy: { _sum: { totalToman: 'desc' } },
      take: 5,
    }),
  ]);
  const topUsers = topCustomerRows.length
    ? await db.user.findMany({
        where: { id: { in: topCustomerRows.map((r) => r.userId) } },
        select: { id: true, fullName: true, phone: true, avatarUrl: true },
      })
    : [];
  const topUserMap = new Map(topUsers.map((u) => [u.id, u]));

  // ——— پرفروش‌های ۳۰ روز اخیر (groupBy + واکشی دسته‌ای عنوان‌ها — بدون N+1) ———
  const topRows = await db.orderItem.groupBy({
    by: ['productId'],
    where: { order: { createdAt: { gte: month }, status: notCanceled } },
    _sum: { quantity: true, lineTotalToman: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 5,
  });
  const titles = await db.product.findMany({
    where: { id: { in: topRows.map((r) => r.productId) } },
    select: { id: true, title: true },
  });
  const titleMap = new Map(titles.map((t) => [t.id, t.title]));

  // ——— سفارش‌های اخیر (۱ query با join کاربر) — userId برای کلیک داشبورد ———
  const recentRows = await db.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      code: true,
      status: true,
      paymentStatus: true,
      totalToman: true,
      createdAt: true,
      user: { select: { id: true, fullName: true, phone: true } },
    },
  });

  // ——— مشتریان اخیر (۱ findMany + ۱ groupBy خرید — بدون N+1) ———
  // مجموع خرید فقط سفارش‌های غیرلغوشده (همسو با دیالوگ جزئیات کاربر)
  const recentUserRows = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: {
      id: true,
      fullName: true,
      phone: true,
      avatarUrl: true,
      role: true,
      isActive: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  const spentRows = await db.order.groupBy({
    by: ['userId'],
    where: { userId: { in: recentUserRows.map((r) => r.id) }, status: notCanceled },
    _sum: { totalToman: true },
  });
  const spentMap = new Map(spentRows.map((r) => [r.userId, r._sum.totalToman ?? 0]));

  // ——— موجودی کم (۱ query) ———
  const lowStockRows = await db.productVariant.findMany({
    where: { isActive: true, stock: { lte: LOW_STOCK_THRESHOLD } },
    orderBy: { stock: 'asc' },
    take: 8,
    select: { stock: true, weightGrams: true, product: { select: { title: true } } },
  });

  // ——— پراکندگی جغرافیایی فروش و مشتریان (نقشهٔ ایران داشبورد) ———
  // دو findMany دسته‌ای؛ گروه‌بندی در JS — snapshot آدرس سفارش‌ها + دفترچهٔ آدرس کاربران
  const [geoOrderRows, geoAddressRows] = await Promise.all([
    db.order.findMany({
      where: { status: notCanceled },
      select: { userId: true, totalToman: true, addressSnapshot: true },
    }),
    db.address.findMany({ select: { userId: true, province: true, city: true } }),
  ]);

  type GeoAgg = {
    revenueToman: number;
    ordersCount: number;
    users: Set<string>;
    cities: Map<string, { users: Set<string>; ordersCount: number }>;
  };
  const provinceAgg = new Map<string, GeoAgg>();
  const citiesWithOrders = new Set<string>();
  const bumpGeo = (
    provinceRaw: string | null | undefined,
    cityRaw: string | null | undefined,
    userId: string,
    revenueToman: number,
    isOrder: boolean
  ) => {
    const province = provinceRaw?.trim();
    if (!province) return;
    let agg = provinceAgg.get(province);
    if (!agg) {
      agg = { revenueToman: 0, ordersCount: 0, users: new Set(), cities: new Map() };
      provinceAgg.set(province, agg);
    }
    if (isOrder) {
      agg.revenueToman += revenueToman;
      agg.ordersCount += 1;
    }
    agg.users.add(userId);
    const city = cityRaw?.trim();
    if (!city) return;
    let cityAgg = agg.cities.get(city);
    if (!cityAgg) {
      cityAgg = { users: new Set(), ordersCount: 0 };
      agg.cities.set(city, cityAgg);
    }
    if (isOrder) {
      cityAgg.ordersCount += 1;
      citiesWithOrders.add(city);
    }
    cityAgg.users.add(userId);
  };
  for (const row of geoOrderRows) {
    let province: string | undefined;
    let city: string | undefined;
    try {
      const snap = JSON.parse(row.addressSnapshot ?? '{}') as { province?: string; city?: string };
      province = snap.province;
      city = snap.city;
    } catch {
      // snapshot خراب — فقط فروش بدون موقعیت ثبت می‌شود، روند ادامه می‌یابد
    }
    bumpGeo(province, city, row.userId, row.totalToman, true);
  }
  for (const row of geoAddressRows) bumpGeo(row.province, row.city, row.userId, 0, false);

  const geoProvinces = [...provinceAgg.entries()]
    .map(([name, agg]) => ({
      name,
      revenueToman: agg.revenueToman,
      ordersCount: agg.ordersCount,
      customers: agg.users.size,
      cities: [...agg.cities.entries()]
        .sort((a, b) => b[1].users.size - a[1].users.size)
        .map(([city]) => city),
    }))
    .sort((a, b) => b.revenueToman - a.revenueToman || b.customers - a.customers);

  return {
    revenue: {
      todayToman: todayAgg._sum.totalToman ?? 0,
      weekToman: weekAgg._sum.totalToman ?? 0,
      monthToman: monthAgg._sum.totalToman ?? 0,
    },
    geo: {
      provinces: geoProvinces,
      provincesWithSales: geoProvinces.filter((p) => p.ordersCount > 0).length,
      citiesWithSales: citiesWithOrders.size,
    },
    dailySales,
    monthlySales,
    avgOrderToman30: orders30 > 0 ? Math.round(revenue30 / orders30) : 0,
    ordersByStatus,
    ordersToday,
    customers: {
      total: usersTotal,
      buyers: buyerRows.length,
      repeatBuyers: buyerRows.filter((r) => r._count._all >= 2).length,
      newLast30: usersLast30,
      blocked: usersBlocked,
    },
    topCustomers: topCustomerRows.map((r) => ({
      id: r.userId,
      fullName: topUserMap.get(r.userId)?.fullName ?? null,
      phone: topUserMap.get(r.userId)?.phone ?? '—',
      avatarUrl: topUserMap.get(r.userId)?.avatarUrl ?? null,
      ordersCount: r._count._all,
      totalSpentToman: r._sum.totalToman ?? 0,
    })),
    users: { total: usersTotal, today: usersToday },
    activeProducts,
    pendingReviews,
    topProducts: topRows.map((r) => ({
      productId: r.productId,
      title: titleMap.get(r.productId) ?? 'محصول حذف‌شده',
      quantity: r._sum.quantity ?? 0,
      revenueToman: r._sum.lineTotalToman ?? 0,
    })),
    recentOrders: recentRows.map((o) => ({
      code: o.code,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totalToman: o.totalToman,
      createdAt: o.createdAt.toISOString(),
      customerUserId: o.user.id,
      customerName: o.user.fullName,
      customerPhone: o.user.phone,
    })),
    recentUsers: recentUserRows.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      phone: u.phone,
      avatarUrl: u.avatarUrl,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      ordersCount: u._count.orders,
      totalSpentToman: spentMap.get(u.id) ?? 0,
    })),
    lowStock: lowStockRows.map((v) => ({
      productTitle: v.product.title,
      weightGrams: v.weightGrams,
      stock: v.stock,
    })),
    totalItemsSold: totalSoldAgg._sum.quantity ?? 0,
  };
}
