import { revalidateStoreCache, CACHE_TAGS } from '@/server/lib/cache-tags';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { orderListQuerySchema, orderUpdateSchema } from '@/server/validators/admin.schema';
import { notifyInbox } from '@/server/services/notification-center.service';
import { pageOffset } from './shared';
import type { z } from 'zod';

/**
 * مدیریت سفارش‌ها (فاز ۱۴) — فهرست، جزئیات، گذار وضعیت
 *
 * ماشین وضعیت (یک‌طرفه):
 *   PENDING_PAYMENT → PAID | CANCELED
 *   PAID            → PROCESSING | CANCELED
 *   PROCESSING      → SHIPPED | CANCELED
 *   SHIPPED         → DELIVERED
 *   DELIVERED / CANCELED — پایانی
 *
 * روی CANCELED: موجودی واریانت‌ها برمی‌گردد و salesCount اصلاح می‌شود؛
 * اگر پرداخت شده بود → REFUNDED. همه در یک تراکنش.
 */

type OrderListQuery = z.infer<typeof orderListQuerySchema>;
type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;

const TRANSITIONS: Record<string, readonly string[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELED'],
  PAID: ['PROCESSING', 'CANCELED'],
  PROCESSING: ['SHIPPED', 'CANCELED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELED: [],
};

const LIST_SELECT = {
  id: true,
  code: true,
  status: true,
  totalToman: true,
  subtotalToman: true,
  discountToman: true,
  deliveryToman: true,
  paymentMethod: true,
  paymentStatus: true,
  trackingCode: true,
  adminNote: true,
  customerNote: true,
  createdAt: true,
  user: { select: { id: true, phone: true, fullName: true } },
  _count: { select: { items: true } },
} as const;

/** فهرست سفارش‌ها با فیلتر وضعیت و جستجوی کد/شماره — Expected queries: ۲ */
export async function listAdminOrders(query: OrderListQuery) {
  const where = {
    AND: [
      query.status !== 'all' ? { status: query.status } : {},
      query.q
        ? {
            OR: [
              { code: { contains: query.q } },
              { user: { phone: { contains: query.q } } },
            ],
          }
        : {},
    ],
  };

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: query.pageSize,
      skip: pageOffset(query.page, query.pageSize),
    }),
    db.order.count({ where }),
  ]);

  return { orders, total, page: query.page, pageSize: query.pageSize };
}

/** جزئیات کامل سفارش برای پنل — شامل آدرس Snapshot و آیتم‌ها */
export async function getAdminOrder(id: string) {
  const order = await db.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, phone: true, fullName: true, createdAt: true } },
      items: {
        select: {
          id: true,
          productTitle: true,
          weightGrams: true,
          unitPriceToman: true,
          compareAtPriceToman: true,
          quantity: true,
          lineTotalToman: true,
          product: { select: { slug: true, images: { take: 1, select: { url: true } } } },
        },
      },
    },
  });
  if (!order) throw ApiError.notFound('سفارش یافت نشد');
  return { order };
}

/** گذار وضعیت + ویرایش یادداشت/کد رهگیری — با محافظت ماشین وضعیت */
export async function updateAdminOrder(id: string, input: OrderUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.HOME, CACHE_TAGS.FEED);

  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      userId: true,
      status: true,
      trackingCode: true,
      paymentStatus: true,
      items: { select: { variantId: true, quantity: true, productId: true, isWholesale: true, weightGrams: true } },
    },
  });
  if (!order) throw ApiError.notFound('سفارش یافت نشد');

  if (input.status && input.status !== order.status) {
    const allowed = TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new ApiError(
        409,
        'INVALID_TRANSITION',
        `گذار از ${order.status} به ${input.status} مجاز نیست — گذارهای مجاز: ${allowed.join('، ') || 'هیچ'}`
      );
    }
  }

  const nextStatus = input.status ?? order.status;

  const updated = await db.$transaction(async (tx) => {
    // ——— بازگشت موجودی در لغو ———
    if (input.status === 'CANCELED' && order.status !== 'CANCELED') {
      const canceled = await tx.order.updateMany({ where: { id, status: order.status }, data: { status: 'CANCELED' } });
      if (!canceled.count) throw new ApiError(409, 'ORDER_CHANGED', 'وضعیت سفارش تغییر کرده است؛ صفحه را تازه کنید');
      for (const item of order.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.isWholesale ? item.weightGrams : item.quantity } },
        });
        await tx.product.update({
          where: { id: item.productId },
          data: { salesCount: { decrement: item.quantity } },
        });
      }
    }

    return tx.order.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.status === 'PAID' && order.paymentStatus !== 'PAID'
          ? { paymentStatus: 'PAID', paidAt: new Date() }
          : {}),
        ...(input.status === 'CANCELED' && order.paymentStatus === 'PAID'
          ? { paymentStatus: 'REFUNDED' }
          : {}),
        ...(input.trackingCode !== undefined ? { trackingCode: input.trackingCode } : {}),
        ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
      },
      select: {
        id: true,
        code: true,
        status: true,
        paymentStatus: true,
        trackingCode: true,
        adminNote: true,
      },
    });
  });

  void nextStatus;

  // —— مرکز اعلان‌ها (زنگوله) —— fire-and-forget؛ هرگز جریان پنل را نمی‌شکند
  // فقط وقتی واقعاً برای مشتری چیزی عوض شده: گذار وضعیت یا ثبت کد رهگیری
  // (ادمین خودش عامل تغییر است؛ برای او اعلان نمی‌زنیم)
  const statusChanged = !!input.status && input.status !== order.status;
  const trackingChanged =
    input.trackingCode !== undefined && input.trackingCode !== order.trackingCode;
  if (statusChanged && order.userId) {
    const customerMessage: Record<string, { title: string; body: string }> = {
      PAID: {
        title: 'پرداخت سفارش تأیید شد',
        body: `پرداخت سفارش ${updated.code} با موفقیت ثبت شد`,
      },
      PROCESSING: {
        title: 'سفارش شما در حال آماده‌سازی است',
        body: `سفارش ${updated.code} وارد مرحله آماده‌سازی شد`,
      },
      SHIPPED: {
        title: 'سفارش شما ارسال شد',
        body: `سفارش ${updated.code} ارسال شد${updated.trackingCode ? ` — کد رهگیری: ${updated.trackingCode}` : ''}`,
      },
      DELIVERED: {
        title: 'سفارش شما تحویل شد',
        body: `سفارش ${updated.code} تحویل داده شد — از خرید شما سپاسگزاریم`,
      },
      CANCELED: {
        title: 'سفارش شما لغو شد',
        body: `سفارش ${updated.code} لغو شد — برای پیگیری با پشتیبانی تماس بگیرید`,
      },
    };
    const message = input.status ? customerMessage[input.status] : undefined;
    if (message) {
      void notifyInbox(order.userId, {
        type: 'ORDER_STATUS',
        title: message.title,
        body: message.body,
        url: `/?o=${updated.code}`,
      });
    }
  } else if (!statusChanged && trackingChanged && updated.trackingCode && order.userId) {
    void notifyInbox(order.userId, {
      type: 'ORDER_STATUS',
      title: 'کد رهگیری سفارش ثبت شد',
      body: `کد رهگیری سفارش ${updated.code}: ${updated.trackingCode}`,
      url: `/?o=${updated.code}`,
    });
  }

  return { order: updated };
}

/** شمارش هر وضعیت برای تب‌های فیلتر پنل — Expected queries: ۱ (groupBy) */
export async function getOrderStatusCounts() {
  const rows = await db.order.groupBy({
    by: ['status'],
    _count: { status: true },
  });
  const counts: Record<string, number> = {
    all: 0,
    PENDING_PAYMENT: 0,
    PAID: 0,
    PROCESSING: 0,
    SHIPPED: 0,
    DELIVERED: 0,
    CANCELED: 0,
  };
  for (const r of rows) {
    counts[r.status] = r._count.status;
    counts.all += r._count.status;
  }
  return counts;
}

// ——— پراکندگی جغرافیایی فاکتورهای فروش (نقشهٔ ایران صفحهٔ سفارش‌ها — درخواست کاربر) ———
// یک findMany دسته‌ای؛ گروه‌بندی استان/شهر در JS از روی addressSnapshot
// لغوشده‌ها فاکتور فروش حساب نمی‌شوند (همسو با آمار داشبورد)

export interface OrdersGeoDTO {
  provinces: Array<{
    name: string;
    ordersCount: number;
    revenueToman: number;
    cities: string[];
  }>;
  invoicesTotal: number;
  revenueTotal: number;
}

export async function getAdminOrdersGeo(): Promise<OrdersGeoDTO> {
  const rows = await db.order.findMany({
    where: { status: { not: 'CANCELED' } },
    select: { totalToman: true, addressSnapshot: true },
  });

  type ProvinceAgg = { ordersCount: number; revenueToman: number; cities: Map<string, number> };
  const provinces = new Map<string, ProvinceAgg>();

  for (const row of rows) {
    let province: string | undefined;
    let city: string | undefined;
    try {
      const snap = JSON.parse(row.addressSnapshot ?? '{}') as { province?: string; city?: string };
      province = snap.province?.trim() || undefined;
      city = snap.city?.trim() || undefined;
    } catch {
      // snapshot خراب — فاکتور بدون موقعیت، نادیده گرفته می‌شود
    }
    if (!province) continue;
    let agg = provinces.get(province);
    if (!agg) {
      agg = { ordersCount: 0, revenueToman: 0, cities: new Map() };
      provinces.set(province, agg);
    }
    agg.ordersCount += 1;
    agg.revenueToman += row.totalToman;
    if (city) agg.cities.set(city, (agg.cities.get(city) ?? 0) + 1);
  }

  const list = [...provinces.entries()]
    .map(([name, agg]) => ({
      name,
      ordersCount: agg.ordersCount,
      revenueToman: agg.revenueToman,
      cities: [...agg.cities.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c]) => c),
    }))
    .sort((a, b) => b.ordersCount - a.ordersCount || b.revenueToman - a.revenueToman);

  return {
    provinces: list,
    invoicesTotal: list.reduce((s, p) => s + p.ordersCount, 0),
    revenueTotal: list.reduce((s, p) => s + p.revenueToman, 0),
  };
}
