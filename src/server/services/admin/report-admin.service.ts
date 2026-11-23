import { db } from '@/lib/db';

/**
 * سرویس گزارش فروش (فاز ۱۱.۶ — بخش ۱۶ مشخصات: گزارش فروش)
 *
 * Expected queries: ۶ — همه دسته‌ای/تجمعی؛ بدون N+1:
 *   سفارش‌های بازه ۱ + کاربران جدید ۱ + اقلامِ پرفروش (groupBy) ۱ +
 *   aggregate اقلام فروخته‌شده ۱ + عنوان/دسته محصولات ۱ + دسته‌ها ۱
 *
 * - درآمد فقط سفارش‌های غیرلغوشده (CANCELED حذف) — همسو با داشبورد
 * - دسته‌بندی روزی در حافظه انجام می‌شود (سفارش‌های ۳۰ روز حجم ناچیز دارند)
 *   تا SQLite بدون groupBy تاریخِ خام کار کند
 * - کلید روز «YYYY-MM-DD» محلی است؛ برچسب شمسی در UI ساخته می‌شود
 */

// ------------------------------------------------------------
// DTO
// ------------------------------------------------------------

export interface SalesReportDTO {
  rangeDays: number;
  totals: {
    revenueToman: number;
    ordersCount: number;
    aovToman: number;
    cancelRate: number; // ۰ تا ۱
    itemsSold: number;
  };
  daily: Array<{ day: string; revenueToman: number; ordersCount: number }>;
  ordersByStatus: Record<string, number>;
  paymentBreakdown: Record<string, number>;
  newUsers: { total: number; daily: Array<{ day: string; count: number }> };
  topProducts: Array<{
    productId: string;
    title: string;
    categoryTitle: string | null;
    quantity: number;
    revenueToman: number;
  }>;
}

// ------------------------------------------------------------
// کمکی‌های تاریخ
// ------------------------------------------------------------

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** کلیدهای همه روزهای بازه — قدیمی به جدید */
function buildDayKeys(days: number): string[] {
  const keys: string[] = [];
  const start = startOfToday();
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    keys.push(dayKey(d));
  }
  return keys;
}

function zeroMap(keys: string[]): Map<string, number> {
  return new Map(keys.map((k) => [k, 0]));
}

// ------------------------------------------------------------
// گزارش
// ------------------------------------------------------------

export async function getSalesReport(rangeDays: 7 | 14 | 30): Promise<SalesReportDTO> {
  const keys = buildDayKeys(rangeDays);
  const firstKey = keys[0]!;
  const rangeStart = new Date(`${firstKey}T00:00:00`);
  const notCanceled = { not: 'CANCELED' as const };

  const [orders, newUsers, topRows, itemsAgg] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: rangeStart } },
      select: { createdAt: true, totalToman: true, status: true, paymentStatus: true },
    }),
    db.user.findMany({
      where: { createdAt: { gte: rangeStart } },
      select: { createdAt: true },
    }),
    db.orderItem.groupBy({
      by: ['productId'],
      where: { order: { createdAt: { gte: rangeStart }, status: notCanceled } },
      _sum: { quantity: true, lineTotalToman: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 8,
    }),
    db.orderItem.aggregate({
      where: { order: { createdAt: { gte: rangeStart }, status: notCanceled } },
      _sum: { quantity: true },
    }),
  ]);

  // ——— دسته‌بندی روزی سفارش‌ها + تفکیک وضعیت‌ها ———
  const revenueByDay = zeroMap(keys);
  const ordersByDay = zeroMap(keys);
  const usersByDay = zeroMap(keys);
  const ordersByStatus: Record<string, number> = {};
  const paymentBreakdown: Record<string, number> = {};
  let revenue = 0;
  let canceled = 0;

  for (const o of orders) {
    const key = dayKey(o.createdAt);
    if (revenueByDay.has(key)) {
      ordersByDay.set(key, (ordersByDay.get(key) ?? 0) + 1);
    }
    ordersByStatus[o.status] = (ordersByStatus[o.status] ?? 0) + 1;
    paymentBreakdown[o.paymentStatus] = (paymentBreakdown[o.paymentStatus] ?? 0) + 1;
    if (o.status === 'CANCELED') {
      canceled += 1;
      continue;
    }
    revenue += o.totalToman;
    if (revenueByDay.has(key)) {
      revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + o.totalToman);
    }
  }

  for (const u of newUsers) {
    const key = dayKey(u.createdAt);
    if (usersByDay.has(key)) {
      usersByDay.set(key, (usersByDay.get(key) ?? 0) + 1);
    }
  }

  // ——— پرفروش‌ها: واکشی دسته‌ای عنوان/دسته — بدون N+1 ———
  const products = topRows.length
    ? await db.product.findMany({
        where: { id: { in: topRows.map((r) => r.productId) } },
        select: { id: true, title: true, categoryId: true, category: { select: { title: true } } },
      })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const ordersCount = orders.length;
  // میانگین سبد فقط روی سفارش‌های معتبر (غیرلغو) — هم‌مقام با مخرج «درآمد»
  const validOrders = ordersCount - canceled;
  return {
    rangeDays,
    totals: {
      revenueToman: revenue,
      ordersCount,
      aovToman: validOrders > 0 ? Math.round(revenue / validOrders) : 0,
      cancelRate: ordersCount > 0 ? canceled / ordersCount : 0,
      itemsSold: itemsAgg._sum.quantity ?? 0,
    },
    daily: keys.map((k) => ({
      day: k,
      revenueToman: revenueByDay.get(k) ?? 0,
      ordersCount: ordersByDay.get(k) ?? 0,
    })),
    ordersByStatus,
    paymentBreakdown,
    newUsers: {
      total: newUsers.length,
      daily: keys.map((k) => ({ day: k, count: usersByDay.get(k) ?? 0 })),
    },
    topProducts: topRows.map((r) => ({
      productId: r.productId,
      title: productMap.get(r.productId)?.title ?? 'محصول حذف‌شده',
      categoryTitle: productMap.get(r.productId)?.category?.title ?? null,
      quantity: r._sum.quantity ?? 0,
      revenueToman: r._sum.lineTotalToman ?? 0,
    })),
  };
}
