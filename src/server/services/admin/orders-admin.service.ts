import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { logAdminAction, type AdminUser } from '@/server/lib/rbac';
import type { AddressSnapshot } from '@/server/services/order.service';
import { notifyInbox } from '@/server/services/notification-center.service';
import type {
  AdminOrderAction,
  AdminOrderListQuery,
} from '@/server/validators/admin/order-admin.schema';

/**
 * سرویس مدیریت سفارش‌ها (فاز ۱۱.۳)
 *
 * قواعد حیاتی:
 * - گذار وضعیت فقط از نقشهٔ گذار مجاز — CANCELED فقط پیش از SHIPPED (بند ۱۱.۳)؛
 *   SHIPPED و DELIVERED و CANCELED حالت نهایی هستند
 * - گذارها با updateMany گارددار (where وضعیت فعلی) اجرا می‌شوند تا دو ادمینِ
 *   همزمان هرگز وضعیت را دوبار جابه‌جا نکنند (شرط مسابقه بسته است)
 * - لغو سفارش: بازگردانی موجودی واریانت‌ها + کاهش salesCount + REFUNDED
 *   پرداختِ پرداخت‌شده — همه در «یک» تراکنش اتمیک (قرینهٔ ثبت سفارش فاز ۹)
 * - هر اکشن با logAdminAction ردپای حسابرسی می‌گیرد (ADMIN_ACTION)
 * - 404 برای سفارش ناموجود؛ پیام‌ها فارسی
 *
 * Expected queries:
 *   GET /api/admin/orders — ۳ (صفحه + شمارش کل + کاربران همان صفحه IN) — بدون N+1
 *   GET /api/admin/orders/[id] — ۲ (سفارش+آیتم‌ها + تصاویر IN)
 *   PATCH (گذار ساده) — ۳ (خود + گارد گذار + به‌روزرسانی)
 *   PATCH CANCEL — ۳ + به‌ازای هر ردیف ۲ (موجودی + salesCount) — سقف ۲۰
 */

const PAGE_MAX = 50;

// ------------------------------------------------------------
// DTO ها
// ------------------------------------------------------------

export interface AdminOrderListItemDTO {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  totalToman: number;
  itemCount: number;
  trackingCode: string | null;
  createdAt: string;
  customer: { id: string; fullName: string | null; phone: string };
}

export interface AdminOrderListDTO {
  items: AdminOrderListItemDTO[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AdminOrderDetailDTO extends AdminOrderListItemDTO {
  subtotalToman: number;
  discountToman: number;
  deliveryToman: number;
  paidAt: string | null;
  paymentRef: string | null;
  /** Snapshot روش ارسال پستی در لحظه ثبت — سفارش‌های قدیمی null */
  shippingMethodName: string | null;
  shippingMethodEta: string | null;
  customerNote: string | null;
  adminNote: string | null;
  address: AddressSnapshot;
  items: Array<{
    id: string;
    productId: string;
    slug: string;
    productTitle: string;
    image: string | null;
    weightGrams: number;
    unitPriceToman: number;
    quantity: number;
    lineTotalToman: number;
  }>;
}

// ------------------------------------------------------------
// فهرست سفارش‌ها
// ------------------------------------------------------------

export async function listAdminOrders(
  query: AdminOrderListQuery
): Promise<AdminOrderListDTO> {
  const where = {
    ...(query.status !== 'all' ? { status: query.status } : {}),
    ...(query.paymentStatus !== 'all' ? { paymentStatus: query.paymentStatus } : {}),
    // جستجو: کد سفارش (مقایسه حروف بزرگ) یا شماره/نام مشتری
    ...(query.q
      ? {
          OR: [
            { code: { contains: query.q.toUpperCase() } },
            { user: { phone: { contains: query.q } } },
            { user: { fullName: { contains: query.q } } },
          ],
        }
      : {}),
  };

  const limit = Math.min(query.limit, PAGE_MAX);
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * limit,
      take: limit,
      select: {
        id: true,
        code: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        totalToman: true,
        trackingCode: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, phone: true } },
        _count: { select: { items: true } },
      },
    }),
    db.order.count({ where }),
  ]);

  return {
    page: query.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    items: rows.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      totalToman: o.totalToman,
      itemCount: o._count.items,
      trackingCode: o.trackingCode,
      createdAt: o.createdAt.toISOString(),
      customer: {
        id: o.user.id,
        fullName: o.user.fullName,
        phone: o.user.phone,
      },
    })),
  };
}

// ------------------------------------------------------------
// جزئیات سفارش
// ------------------------------------------------------------

export async function getAdminOrderDetail(id: string): Promise<AdminOrderDetailDTO> {
  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      subtotalToman: true,
      discountToman: true,
      deliveryToman: true,
      totalToman: true,
      paymentMethod: true,
      paymentStatus: true,
      paidAt: true,
      paymentRef: true,
      shippingMethodName: true,
      shippingMethodEta: true,
      trackingCode: true,
      customerNote: true,
      adminNote: true,
      createdAt: true,
      addressSnapshot: true,
      user: { select: { id: true, fullName: true, phone: true } },
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          productId: true,
          productTitle: true,
          weightGrams: true,
          unitPriceToman: true,
          quantity: true,
          lineTotalToman: true,
          product: {
            select: {
              slug: true,
              images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
            },
          },
        },
      },
    },
  });

  if (!order) throw ApiError.notFound('سفارش یافت نشد');

  let address: AddressSnapshot;
  try {
    address = JSON.parse(order.addressSnapshot) as AddressSnapshot;
  } catch {
    address = {
      receiverName: '',
      receiverPhone: '',
      province: '',
      city: '',
      fullAddress: order.addressSnapshot,
    };
  }

  return {
    id: order.id,
    code: order.code,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    totalToman: order.totalToman,
    itemCount: order.items.reduce((s, i) => s + i.quantity, 0),
    trackingCode: order.trackingCode,
    createdAt: order.createdAt.toISOString(),
    customer: {
      id: order.user.id,
      fullName: order.user.fullName,
      phone: order.user.phone,
    },
    subtotalToman: order.subtotalToman,
    discountToman: order.discountToman,
    deliveryToman: order.deliveryToman,
    paidAt: order.paidAt?.toISOString() ?? null,
    paymentRef: order.paymentRef,
    shippingMethodName: order.shippingMethodName,
    shippingMethodEta: order.shippingMethodEta,
    customerNote: order.customerNote,
    adminNote: order.adminNote,
    address,
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      slug: i.product.slug,
      productTitle: i.productTitle,
      image: i.product.images[0]?.url ?? null,
      weightGrams: i.weightGrams,
      unitPriceToman: i.unitPriceToman,
      quantity: i.quantity,
      lineTotalToman: i.lineTotalToman,
    })),
  };
}

// ------------------------------------------------------------
// گذار وضعیت — نقشهٔ مجاز (منبع حقیقت قواعد بند ۱۱.۳)
// ------------------------------------------------------------

/** گذارهای مجاز هر اکشن — CANCELED فقط پیش از SHIPPED */
const ALLOWED_FROM: Record<AdminOrderAction['action'], string[]> = {
  MARK_PAID: ['PENDING_PAYMENT'],
  START_PROCESSING: ['PAID'],
  SHIP: ['PROCESSING'],
  DELIVER: ['SHIPPED'],
  CANCEL: ['PENDING_PAYMENT', 'PAID', 'PROCESSING'],
  UPDATE_TRACKING: ['SHIPPED'],
  SET_ADMIN_NOTE: [], // مستقل از وضعیت
};

/** وضعیت مقصد هر اکشن گذاری — null یعنی وضعیت تغییر نمی‌کند */
const ACTION_TARGET: Record<AdminOrderAction['action'], string | null> = {
  MARK_PAID: 'PAID',
  START_PROCESSING: 'PROCESSING',
  SHIP: 'SHIPPED',
  DELIVER: 'DELIVERED',
  CANCEL: 'CANCELED',
  UPDATE_TRACKING: null,
  SET_ADMIN_NOTE: null,
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  PROCESSING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال‌شده',
  DELIVERED: 'تحویل‌شده',
  CANCELED: 'لغو شده',
};

function invalidTransition(action: AdminOrderAction['action'], current: string): ApiError {
  return new ApiError(
    409,
    'INVALID_TRANSITION',
    `این اقدام برای سفارش «${STATUS_LABELS[current] ?? current}» مجاز نیست`
  );
}

/**
 * اجرای اکشن ادمین روی سفارش — گذار گارددار + حسابرسی
 * خروجی: جزئیات تازهٔ سفارش پس از اعمال
 */
export async function applyAdminOrderAction(
  admin: AdminUser,
  req: NextRequest,
  id: string,
  input: AdminOrderAction
): Promise<AdminOrderDetailDTO> {
  // ۱) سفارش باید موجود باشد — 404 برای ناموجود
  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      userId: true,
      status: true,
      paymentStatus: true,
      adminNote: true,
      discountCodeId: true,
    },
  });
  if (!order) throw ApiError.notFound('سفارش یافت نشد');

  const action = input.action;

  // ۲) یادداشت داخلی — مستقل از وضعیت
  if (action === 'SET_ADMIN_NOTE') {
    await db.order.update({
      where: { id },
      data: { adminNote: input.adminNote || null },
      select: { id: true },
    });
    await logAdminAction(req, admin, 'ORDER_ADMIN_NOTE', {
      orderId: id,
      code: order.code,
      cleared: !input.adminNote,
    });
    return getAdminOrderDetail(id);
  }

  // ۳) گارد گذار — اکشن از وضعیت فعلی مجاز است؟
  if (!ALLOWED_FROM[action].includes(order.status)) {
    throw invalidTransition(action, order.status);
  }

  // ۴) اجرای هر اکشن
  switch (action) {
    case 'MARK_PAID': {
      // ثبت پرداخت دستی (مثلاً کارت‌به‌کارت) — paidAt اگر نبود الان
      const upd = await db.order.updateMany({
        where: { id, status: 'PENDING_PAYMENT' },
        data: {
          status: 'PAID',
          paymentStatus: 'PAID',
          paidAt: new Date(),
        },
      });
      if (upd.count === 0) throw invalidTransition(action, order.status);
      break;
    }

    case 'START_PROCESSING': {
      const upd = await db.order.updateMany({
        where: { id, status: 'PAID' },
        data: { status: 'PROCESSING' },
      });
      if (upd.count === 0) throw invalidTransition(action, order.status);
      break;
    }

    case 'SHIP': {
      const upd = await db.order.updateMany({
        where: { id, status: 'PROCESSING' },
        data: { status: 'SHIPPED', trackingCode: input.trackingCode },
      });
      if (upd.count === 0) throw invalidTransition(action, order.status);
      break;
    }

    case 'DELIVER': {
      const upd = await db.order.updateMany({
        where: { id, status: 'SHIPPED' },
        data: { status: 'DELIVERED' },
      });
      if (upd.count === 0) throw invalidTransition(action, order.status);
      break;
    }

    case 'UPDATE_TRACKING': {
      const upd = await db.order.updateMany({
        where: { id, status: 'SHIPPED' },
        data: { trackingCode: input.trackingCode },
      });
      if (upd.count === 0) throw invalidTransition(action, order.status);
      break;
    }

    case 'CANCEL': {
      // تراکنش اتمیک: گارد گذار + بازگردانی موجودی + فروشگاه‌سنجی معکوس
      // دلیل لغو به یادداشت داخلی افزوده می‌شود (ردپای چرایی برای گزارش)
      const cancelNote = input.reason
        ? `${order.adminNote ? `${order.adminNote}\n` : ''}دلیل لغو: ${input.reason}`
        : order.adminNote;

      const applied = await db.$transaction(async (tx) => {
        // گارد اتمیک — اگر همزمان کسی وضعیت را عوض کرده باشد ۰ ردیف می‌خورد
        const guard = await tx.order.updateMany({
          where: { id, status: { in: ALLOWED_FROM.CANCEL } },
          data: {
            status: 'CANCELED',
            // پرداختِ پرداخت‌شده باید برگردد (REFUNDED)؛ بقیهٔ حالت‌ها دست‌نخورده
            paymentStatus: order.paymentStatus === 'PAID' ? 'REFUNDED' : order.paymentStatus,
            ...(cancelNote !== order.adminNote ? { adminNote: cancelNote } : {}),
          },
        });
        if (guard.count === 0) return false;

        // بازگردانی موجودی — قرینهٔ کاهش در ثبت سفارش (فاز ۹)
        const items = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { variantId: true, productId: true, quantity: true, isWholesale: true, weightGrams: true },
        });
        for (const item of items) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.isWholesale ? item.weightGrams : item.quantity } },
          });
          await tx.product.update({
            where: { id: item.productId },
            data: { salesCount: { decrement: item.quantity } },
          });
        }

        // بازگردانی مصرف کد تخفیف — ظرفیت کد دوباره آزاد می‌شود
        // (گارد gt:0 تا شمارنده هرگز منفی نشود)
        if (order.discountCodeId) {
          await tx.discountCode.updateMany({
            where: { id: order.discountCodeId, usedCount: { gt: 0 } },
            data: { usedCount: { decrement: 1 } },
          });
        }
        return true;
      });

      if (!applied) throw invalidTransition(action, order.status);
      break;
    }
  }

  // ۵) اعلان تغییر وضعیت به مشتری — fire-and-forget؛ هرگز جریان پنل را نمی‌شکند
  //    (ادمین خودش عامل تغییر است؛ برای او اعلان نمی‌زنیم)
  const targetStatus = ACTION_TARGET[action];
  const tracking = 'trackingCode' in input ? input.trackingCode : undefined;
  if (targetStatus) {
    const customerMessage: Record<string, { title: string; body: string }> = {
      PAID: {
        title: 'پرداخت سفارش تأیید شد',
        body: `پرداخت سفارش ${order.code} با موفقیت ثبت شد`,
      },
      PROCESSING: {
        title: 'سفارش شما در حال آماده‌سازی است',
        body: `سفارش ${order.code} وارد مرحله آماده‌سازی شد`,
      },
      SHIPPED: {
        title: 'سفارش شما ارسال شد',
        body: `سفارش ${order.code} ارسال شد${tracking ? ` — کد رهگیری: ${tracking}` : ''}`,
      },
      DELIVERED: {
        title: 'سفارش شما تحویل شد',
        body: `سفارش ${order.code} تحویل داده شد — از خرید شما سپاسگزاریم`,
      },
      CANCELED: {
        title: 'سفارش شما لغو شد',
        body: `سفارش ${order.code} لغو شد — برای پیگیری با پشتیبانی تماس بگیرید`,
      },
    };
    const message = customerMessage[targetStatus];
    if (message) {
      void notifyInbox(order.userId as string, {
        type: 'ORDER_STATUS',
        title: message.title,
        body: message.body,
        url: `/?o=${order.code}`,
      });
    }
  }
  // ثبت/به‌روزرسانی کد رهگیری هم برای مشتری اعلان دارد
  if (action === 'UPDATE_TRACKING' && input.trackingCode) {
    void notifyInbox(order.userId as string, {
      type: 'ORDER_STATUS',
      title: 'کد رهگیری سفارش ثبت شد',
      body: `کد رهگیری سفارش ${order.code}: ${input.trackingCode}`,
      url: `/?o=${order.code}`,
    });
  }

  // ۶) حسابرسی — چه کسی، چه اقدامی، از چه وضعیتی به چه وضعیتی
  await logAdminAction(req, admin, `ORDER_${action}`, {
    orderId: id,
    code: order.code,
    from: order.status,
    to: ACTION_TARGET[action] ?? order.status,
    ...(action === 'CANCEL' && input.reason ? { reason: input.reason } : {}),
  });

  return getAdminOrderDetail(id);
}
