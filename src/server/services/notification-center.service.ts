import { db } from '@/lib/db';
import type { SessionUser } from '@/server/lib/auth';
import { notificationTarget } from '@/lib/notification-target';

/**
 * مرکز اعلان‌های داخل اپ — زنگولهٔ فروشگاه و پنل مدیریت
 *
 * معماری:
 * - هر رویداد (سبد جدید، ثبت سفارش، پرداخت، تغییر وضعیت) یک ردیف
 *   Notification به‌ازای «هر گیرنده» می‌سازد — فن‌اوت برای همهٔ مدیرهای فعال
 * - وضعیت خوانده‌شدن (readAt) per-recipient است؛ دایرهٔ قرمز زنگوله =
 *   شمارش ردیف‌های با readAt خالی
 * - نوشتن اعلان هرگز جریان اصلی (ثبت سفارش و…) را نمی‌شکند —
 *   توابع notify با catch کامل و فراخوانی void امن هستند
 * - ضد IDOR: خواندن/علامت‌گذاری/حذف فقط روی ردیف‌های userId خود کاربر
 */

const FEED_LIMIT = 30;

// ------------------------------------------------------------
// DTO
// ------------------------------------------------------------

export interface CenterNotificationDTO {
  id: string;
  // CART_NEW | ORDER_NEW | ORDER_STATUS | PAYMENT | REVIEW | BROADCAST | SYSTEM
  type: string;
  title: string;
  body: string;
  url: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationCenterDTO {
  items: CenterNotificationDTO[];
  unread: number;
}

// ------------------------------------------------------------
// نوشتن اعلان — fire-and-forget امن
// ------------------------------------------------------------

export interface NotifyPayload {
  type: 'CART_NEW' | 'ORDER_NEW' | 'ORDER_STATUS' | 'PAYMENT' | 'REVIEW' | 'BROADCAST' | 'SYSTEM';
  title: string;
  body: string;
  /** مقصد داخل‌اپ — فروشگاه: /?o=PARS-… ؛ ادمین: /admin/… */
  url?: string;
}

/**
 * ساخت ردیف اعلان برای یک کاربر — هرگز throw نمی‌کند (فراخوانی با void امن است)
 * Expected queries: ۱ (insert)
 */
export async function notifyInbox(userId: string, payload: NotifyPayload): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        url: payload.url ?? null,
      },
    });
  } catch {
    // اعلان هرگز جریان اصلی را نمی‌شکند
  }
}

/**
 * فن‌اوت اعلان به همهٔ مدیرهای فعال — هر مدیر ردیف مستقل می‌گیرد
 * (وضعیت خوانده‌شدن per-recipient می‌ماند)
 * Expected queries: ۱ (مدیرها) + به‌ازای هر مدیر ۱ insert
 */
export async function notifyAdmins(payload: NotifyPayload): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      await notifyInbox(admin.id, payload);
    }
  } catch {
    // اعلان هرگز جریان اصلی را نمی‌شکند
  }
}

// ------------------------------------------------------------
// خواندن — خوراک زنگوله
// ------------------------------------------------------------

/**
 * ۳۰ اعلان آخر کاربر + شمارش خوانده‌نشده
 * Orders are resolved in one batch to repair legacy destinations and amounts.
 */
export async function listNotificationCenter(
  user: SessionUser
): Promise<NotificationCenterDTO> {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: FEED_LIMIT,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        url: true,
        readAt: true,
        createdAt: true,
      },
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  // Prefer an explicit order ID/code over text; text only repairs legacy list links.
  const orderReferenceFor = (row: typeof rows[number]): { id?: string; code?: string } | undefined => {
    if (!['ORDER_NEW', 'ORDER_STATUS', 'PAYMENT'].includes(row.type)) return;
    const target = notificationTarget(row.url);
    const id = target?.href.match(/^\/admin\/orders\/([^/?#]+)(?:[?#]|$)/)?.[1];
    if (id) return { id };
    const code = target?.orderCode ?? row.body.match(/\bPARS-\d{8}-[A-Z2-9]{4}\b/)?.[0];
    return code ? { code } : undefined;
  };
  const refs = rows.map(orderReferenceFor).filter((ref) => !!ref);
  const orders = refs.length ? await db.order.findMany({
    where: { OR: refs, ...(user.role === 'ADMIN' ? {} : { userId: user.id }) },
    select: { id: true, code: true, totalToman: true, items: { select: { quantity: true } } },
  }) : [];
  const byCode = new Map(orders.map((order) => [order.code, order]));
  const byId = new Map(orders.map((order) => [order.id, order]));

  return {
    unread,
    items: rows.map((r) => {
      const ref = orderReferenceFor(r);
      const order = ref?.id ? byId.get(ref.id) : ref?.code ? byCode.get(ref.code) : undefined;
      const target = notificationTarget(r.url);
      let url = target?.href ?? null;
      if (r.type === 'CART_NEW' && url === '/admin/orders') url = null;
      let body = r.body;
      if (order) {
        url = target?.href.startsWith('/admin/orders') && user.role === 'ADMIN'
          ? `/admin/orders/${order.id}` : `/?o=${order.code}`;
        if (r.type === 'ORDER_NEW') {
          const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
          body = `سفارش ${order.code} شامل ${quantity.toLocaleString('fa-IR')} کالا به مبلغ ${order.totalToman.toLocaleString('fa-IR')} تومان ثبت شد`;
        } else if (r.type === 'PAYMENT') {
          body = `پرداخت سفارش ${order.code} به مبلغ ${order.totalToman.toLocaleString('fa-IR')} تومان تأیید شد`;
        }
      } else if (ref) {
        // A deleted or inaccessible order must never redirect to an unrelated list.
        url = null;
      }
      return {
        id: r.id,
        type: r.type,
        title: r.title,
        body,
        url,
        isRead: r.readAt !== null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  };
}

/**
 * شمارش سبک خوانده‌نشده‌ها — برای Polling دوره‌ای زنگوله
 * Expected queries: ۱
 */
export async function unreadCount(user: SessionUser): Promise<{ unread: number }> {
  const unread = await db.notification.count({
    where: { userId: user.id, readAt: null },
  });
  return { unread };
}

// ------------------------------------------------------------
// علامت‌گذاری خوانده‌شده
// ------------------------------------------------------------

export interface MarkReadResult {
  updated: number;
  unread: number;
}

/**
 * علامت‌گذاری خوانده‌شده — یکی (id) یا همه
 * گارد مالکیت در همان دستور (ضد IDOR)
 * Expected queries: ۲ (update + count)
 */
export async function markNotificationsRead(
  user: SessionUser,
  input: { id?: string; all?: boolean }
): Promise<MarkReadResult> {
  if (!input.all && !input.id) {
    return { updated: 0, unread: await countUnread(user.id) };
  }

  const res = await db.notification.updateMany({
    where: {
      userId: user.id,
      readAt: null,
      ...(input.all ? {} : { id: input.id as string }),
    },
    data: { readAt: new Date() },
  });

  return { updated: res.count, unread: await countUnread(user.id) };
}

async function countUnread(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

/** Each recipient owns their copy; deleting it never removes another user's copy. */
export async function deleteNotification(user: SessionUser, id: string) {
  const result = await db.notification.deleteMany({ where: { id, userId: user.id } });
  return { deleted: result.count, unread: await countUnread(user.id) };
}
