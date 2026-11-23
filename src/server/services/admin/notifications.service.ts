import { sendNotification, setVapidDetails } from 'web-push';
import { db } from '@/lib/db';
import { broadcastSchema } from '@/server/validators/admin.schema';
import type { z } from 'zod';

/**
 * اطلاع‌رسانی گروهی مدیر (فاز ۱۴) — آمار مخاطبان + ارسال Push تبلیغاتی
 *
 * قواعد رضایت‌محور (بخش ۱۱ مشخصات — غیرقابل نقض):
 * - فقط کاربرانی که pushEnabled=true و promotions=true دارند هدف‌گیری می‌شوند
 * - ارسال در پس‌زمینه؛ پاسخ فوری با شمارش صف — نتیجه هر نفر در NotificationLog
 * - اشتراک مرده (۴۱۰/۴۰۴) → isActive=false (پاک‌سازی استاندارد Push)
 */

type BroadcastInput = z.infer<typeof broadcastSchema>;

let vapidConfigured = false;
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:support@pars-shop.ir',
    publicKey,
    privateKey
  );
  vapidConfigured = true;
  return true;
}

/** آمار اطلاع‌رسانی + آخرین لاگ‌ها — Expected queries: ۴ */
export async function getNotificationOverview() {
  const [activeSubs, pushOptIn, promoOptIn, recentLogs] = await Promise.all([
    db.pushSubscription.count({ where: { isActive: true } }),
    db.notificationPreference.count({ where: { pushEnabled: true } }),
    db.notificationPreference.count({ where: { pushEnabled: true, promotions: true } }),
    db.notificationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        body: true,
        status: true,
        error: true,
        sentAt: true,
        createdAt: true,
        user: { select: { phone: true } },
      },
    }),
  ]);

  const sent = await db.notificationLog.count({ where: { status: 'SENT' } });
  const failed = await db.notificationLog.count({ where: { status: 'FAILED' } });

  return {
    stats: { activeSubs, pushOptIn, promoOptIn, sent, failed },
    recentLogs,
  };
}

/**
 * ارسال گروهی — ساخت لاگ‌ها به‌صورت همگام (پاسخ پس از صف‌شدن) و
 * تحویل واقعی Push در پس‌زمینه. برمی‌گرداند: تعداد هدف و صف‌شده.
 */
export async function broadcastNotification(input: BroadcastInput) {
  // فقط رضایت‌داران تبلیغاتی با دستگاه ثبت‌شده
  const audience = await db.notificationPreference.findMany({
    where: { pushEnabled: true, promotions: true },
    select: { userId: true },
  });
  const userIds = audience.map((a) => a.userId);

  // زنگولهٔ داخل‌اپ — اطلاعیه برای همهٔ کاربران فعال (بدون نیاز به رضایت؛
  // رضایت فقط برای Push است). هرگز ارسال برادکست را نمی‌شکند.
  try {
    const activeUsers = await db.user.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    if (activeUsers.length > 0) {
      await db.notification.createMany({
        data: activeUsers.map((u) => ({
          userId: u.id,
          type: 'BROADCAST',
          title: input.title,
          body: input.body,
          url: buildBroadcastUrl(input),
        })),
      });
    }
  } catch {
    // زنگوله هرگز جریان برادکست را نمی‌شکند
  }

  let queued = 0;
  if (userIds.length > 0) {
    const subs = await db.pushSubscription.findMany({
      where: { userId: { in: userIds }, isActive: true },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    });

    const url = buildBroadcastUrl(input);
    if (subs.length > 0) {
      const logs = await db.notificationLog.createMany({
        data: subs.map((s) => ({
          userId: s.userId,
          title: input.title,
          body: input.body,
          data: JSON.stringify({ url, tag: 'broadcast' }),
          status: 'QUEUED',
        })),
      });
      queued = logs.count;

      // شناسهٔ لاگ‌ها با یک findMany (به‌جای findFirst به‌ازای هر مشترک — N+1 قدیمی)
      const queuedLogs = await db.notificationLog.findMany({
        where: { userId: { in: userIds }, title: input.title, status: 'QUEUED' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, userId: true },
      });
      const logIdByUser = new Map<string, string>();
      for (const l of queuedLogs) {
        if (l.userId && !logIdByUser.has(l.userId)) logIdByUser.set(l.userId, l.id);
      }

      // تحویل پس‌زمینه — هرگز پاسخ را مسدود نمی‌کند
      void deliverBroadcast(subs, { title: input.title, body: input.body, url }, logIdByUser);
    }
  }

  return {
    audience: userIds.length,
    queued,
    vapidConfigured: ensureVapid(),
  };
}

function buildBroadcastUrl(input: BroadcastInput): string {
  const params = input.linkParams ?? {};
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  if (input.linkView && input.linkView !== 'none') {
    return qs ? `/?view=${input.linkView}&${qs}` : `/?view=${input.linkView}`;
  }
  return '/';
}

async function deliverBroadcast(
  subs: Array<{ id: string; userId: string | null; endpoint: string; p256dh: string; auth: string }>,
  payload: { title: string; body: string; url: string },
  logIdByUser: Map<string, string>
) {
  if (!ensureVapid()) {
    await db.notificationLog.updateMany({
      where: { status: 'QUEUED', title: payload.title },
      data: { status: 'FAILED', error: 'VAPID_NOT_CONFIGURED' },
    });
    return;
  }

  await Promise.allSettled(
    subs.map(async (s) => {
      // لاگ این کاربر برای این عنوان — از نقشهٔ شناسه‌های createMany بالا (بدون کوئری اضافه)
      const logId = s.userId ? logIdByUser.get(s.userId) : undefined;
      try {
        await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, tag: 'broadcast' })
        );
        if (logId) {
          await db.notificationLog.update({
            where: { id: logId },
            data: { status: 'SENT', sentAt: new Date() },
          });
        }
      } catch (e) {
        const status = (e as { statusCode?: number } | null)?.statusCode;
        if (status === 410 || status === 404) {
          await db.pushSubscription
            .update({ where: { id: s.id }, data: { isActive: false } })
            .catch(() => undefined);
        }
        if (logId) {
          await db.notificationLog
            .update({
              where: { id: logId },
              data: {
                status: 'FAILED',
                error: String((e as { message?: string }).message ?? 'SEND_FAILED').slice(0, 300),
              },
            })
            .catch(() => undefined);
        }
      }
    })
  );
}

