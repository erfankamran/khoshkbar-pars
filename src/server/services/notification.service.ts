import { sendNotification, setVapidDetails } from 'web-push';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import type { SessionUser } from '@/server/lib/auth';
import type { NotificationPreferencesInput } from '@/server/validators/notification.schema';
import type { PushSubscribeInput } from '@/server/validators/notification.schema';

/**
 * سرویس اعلان‌ها و Push (فاز ۱۰ — رضایت‌محور، بخش ۱۱ مشخصات)
 *
 * قواعد حیاتی:
 * - هیچ اعلانی بدون رضایت صریح کاربر (NotificationPreference.pushEnabled)
 *   ارسال نمی‌شود — پیش‌فرض همه پرچم‌های تبلیغاتی خاموش است
 * - NotificationLog هم «خوراک اعلان‌های داخل اپ» است و هم لاگ تحویل
 *   (QUEUED → SENT/FAILED) — شفافیت کامل در موفقیت و خطا
 * - ارسال با web-push و VAPID؛ خطای هر اشتراک مستقل ثبت می‌شود
 *   (اشتراک منقضی/نامعتبر → ۴۱۰/۴۰۴ → isActive=false برای پاک‌سازی)
 * - ارسال هرگز مسدودکننده پاسخ نیست (fire-and-forget با catch کامل)
 */

const FEED_LIMIT = 20;

// ------------------------------------------------------------
// تنظیمات VAPID — lazy تا بدون کلید هم اپ بالا بیاید
// ------------------------------------------------------------

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

/** کلید عمومی VAPID برای pushManager.subscribe کلاینت — public است */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

// ------------------------------------------------------------
// DTOها
// ------------------------------------------------------------

export interface NotificationPreferenceDTO {
  pushEnabled: boolean;
  orderUpdates: boolean;
  promotions: boolean;
  newProducts: boolean;
}

export interface NotificationLogDTO {
  id: string;
  title: string;
  body: string;
  /** وضعیت تحویل آخرین تلاش — QUEUED | SENT | FAILED | SKIPPED */
  status: string;
  createdAt: string;
  /** مقصد داخل اپ (نمای روتر) — از data JSON */
  url: string | null;
}

// ------------------------------------------------------------
// ترجیحات کاربر
// ------------------------------------------------------------

/**
 * GET /api/notifications/preferences
 * Expected queries: ۲ (نشست) + ۱ (خواندن/درج ترجیحات) = ۳
 */
export async function getPreferences(
  user: SessionUser
): Promise<NotificationPreferenceDTO> {
  const row = await db.notificationPreference.findUnique({
    where: { userId: user.id },
    select: {
      pushEnabled: true,
      orderUpdates: true,
      promotions: true,
      newProducts: true,
    },
  });
  // پیش‌فرض مدل — بدون درج؛ درج در اولین PUT انجام می‌شود
  return row ?? { pushEnabled: false, orderUpdates: true, promotions: false, newProducts: false };
}

/**
 * PUT /api/notifications/preferences
 * Expected queries: ۲ (نشست) + upsert ترجیحات ۱
 */
export async function updatePreferences(
  user: SessionUser,
  input: NotificationPreferencesInput
): Promise<NotificationPreferenceDTO> {
  const row = await db.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...input },
    update: { ...input },
    select: {
      pushEnabled: true,
      orderUpdates: true,
      promotions: true,
      newProducts: true,
    },
  });
  return row;
}

// ------------------------------------------------------------
// اشتراک Push
// ------------------------------------------------------------

/**
 * POST /api/push/subscribe — مهمان هم مجاز؛ اگر واردشده باشد به کاربر وصل می‌شود
 * Expected queries: ۲ (نشست در صورت ورود) + upsert اشتراک ۱
 */
export async function saveSubscription(
  user: SessionUser | null,
  input: PushSubscribeInput & { userAgent?: string }
): Promise<{ id: string }> {
  const row = await db.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userId: user?.id ?? null,
      userAgent: input.userAgent ?? null,
      isActive: true,
    },
    update: {
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      // اگر همان دستگاه وارد شده، اشتراک قدیمی به کاربر متصل می‌شود
      ...(user ? { userId: user.id } : {}),
      isActive: true,
    },
    select: { id: true },
  });
  return row;
}

/**
 * POST /api/push/unsubscribe — حذف کامل اشتراک (خروج تمیز)
 * Expected queries: ۲ (نشست) + ۱ (deleteMany)
 */
export async function removeSubscription(endpoint: string): Promise<{ removed: number }> {
  const res = await db.pushSubscription.deleteMany({ where: { endpoint } });
  return { removed: res.count };
}

// ------------------------------------------------------------
// خوراک اعلان‌های داخل اپ
// ------------------------------------------------------------

/**
 * GET /api/notifications — ۲۰ اعلان آخر کاربر
 * Expected queries: ۲ (نشست) + ۱ (لاگ‌ها) = ۳
 */
export async function listFeed(user: SessionUser): Promise<NotificationLogDTO[]> {
  const rows = await db.notificationLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: FEED_LIMIT,
    select: { id: true, title: true, body: true, status: true, createdAt: true, data: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    url: parseUrl(r.data),
  }));
}

function parseUrl(data: string | null): string | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as { url?: string };
    return typeof parsed.url === 'string' ? parsed.url : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// هسته ارسال — fire-and-forget
// ------------------------------------------------------------

export interface SendPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** به‌ازای هر اشتراک یک تلاش؛ نتیجه هرکدام جداگانه در لاگ نهایی می‌نشیند — true یعنی حداقل یک ارسال موفق */
async function deliver(
  logId: string,
  payload: SendPayload,
  subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>
): Promise<boolean> {
  if (!ensureVapid()) {
    await db.notificationLog.update({
      where: { id: logId },
      data: { status: 'FAILED', error: 'VAPID_NOT_CONFIGURED' },
    });
    return false;
  }

  const results = await Promise.allSettled(
    subs.map((s) =>
      sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      )
    )
  );

  // پاک‌سازی اشتراک‌های مرده (۴۱۰ Gone / ۴۰۴) — رفتار استاندارد Push
  await Promise.allSettled(
    results.map(async (r, i) => {
      if (r.status === 'fulfilled') return;
      const status = (r.reason as { statusCode?: number } | null)?.statusCode;
      if (status === 410 || status === 404) {
        await db.pushSubscription.update({
          where: { id: subs[i].id },
          data: { isActive: false },
        });
      }
    })
  );

  const anySent = results.some((r) => r.status === 'fulfilled');
  const firstError =
    results.find((r) => r.status === 'rejected')?.reason ?? null;
  await db.notificationLog.update({
    where: { id: logId },
    data: {
      status: anySent ? 'SENT' : 'FAILED',
      sentAt: anySent ? new Date() : null,
      error: anySent
        ? null
        : String(
            (firstError as { message?: string; body?: string } | null)?.body ??
              (firstError as { message?: string } | null)?.message ??
              'SEND_FAILED'
          ).slice(0, 300),
    },
  });
  return anySent;
}

/**
 * ارسال گروهی (برادکست پنل مدیریت) — برای هر ورودی، لاگِ ازقبل‌ساخته با
 * اشتراک فعالِ همان کاربر ارسال می‌شود. هرگز throw نمی‌کند.
 * Expected queries: اشتراک‌های گروهی ۱ + به‌روزرسانی وضعیت به‌ازای هر لاگ
 */
export async function deliverBroadcast(
  entries: Array<{ logId: string; userId: string }>,
  payload: SendPayload
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  if (entries.length === 0) return { sent, failed };

  try {
    const subs = await db.pushSubscription.findMany({
      where: { userId: { in: entries.map((e) => e.userId) }, isActive: true },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    });
    const subsByUser = new Map(subs.map((s) => [s.userId, s]));

    await Promise.allSettled(
      entries.map(async (e) => {
        const s = subsByUser.get(e.userId);
        if (!s) {
          await db.notificationLog.update({
            where: { id: e.logId },
            data: { status: 'FAILED', error: 'NO_ACTIVE_SUBSCRIPTION' },
          });
          failed++;
          return;
        }
        const ok = await deliver(e.logId, payload, [s]);
        if (ok) sent++;
        else failed++;
      })
    );
  } catch {
    // برادکست هرگز جریان اصلی را نمی‌شکند
  }
  return { sent, failed };
}

/**
 * ارسال اعلان به کاربر — هرگز throw نمی‌کند (فراخوانی با void امن است)
 *
 * جریان: رضایت؟ → لاگ QUEUED → ارسال به اشتراک‌های فعال → SENT/FAILED
 * Expected queries: ترجیح ۱ + لاگ ۱ + اشتراک‌ها ۱ + به‌روزرسانی وضعیت ۱
 */
export async function sendToUser(
  userId: string,
  payload: SendPayload,
  /** پرچم رضایت مرتبط — پیش‌فرض orderUpdates */
  consentKey: 'orderUpdates' | 'promotions' | 'newProducts' = 'orderUpdates'
): Promise<void> {
  try {
    const prefs = await db.notificationPreference.findUnique({
      where: { userId },
      select: {
        pushEnabled: true,
        orderUpdates: true,
        promotions: true,
        newProducts: true,
      },
    });
    // بدون رضایت کلی یا رضایت بخشی — فقط ثبت در خوراک داخل اپ
    const pushAllowed = prefs?.pushEnabled === true && prefs?.[consentKey] === true;

    const log = await db.notificationLog.create({
      data: {
        userId,
        title: payload.title,
        body: payload.body,
        data: JSON.stringify({ url: payload.url ?? '/', tag: payload.tag }),
        status: pushAllowed ? 'QUEUED' : 'SKIPPED',
      },
      select: { id: true },
    });
    if (!pushAllowed) return;

    const subs = await db.pushSubscription.findMany({
      where: { userId, isActive: true },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subs.length === 0) {
      // رضایت هست اما دستگاهی ثبت نشده — لاگ می‌ماند تا کاربر اپ را نصب/فعال کند
      await db.notificationLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', error: 'NO_ACTIVE_SUBSCRIPTION' },
      });
      return;
    }
    await deliver(log.id, payload, subs);
  } catch {
    // اعلان هرگز جریان اصلی (ثبت سفارش و...) را نمی‌شکند
  }
}

/** اعلان تأیید ثبت سفارش — تریگر از createOrderFromCart */
export function sendOrderConfirmation(
  userId: string,
  data: { code: string; totalToman: number; itemCount: number }
): void {
  void sendToUser(
    userId,
    {
      title: 'سفارش شما ثبت شد',
      body: `سفارش ${data.code} شامل ${data.itemCount.toLocaleString('fa-IR')} کالا به مبلغ ${data.totalToman.toLocaleString('fa-IR')} تومان ثبت شد`,
      // لینک عمیق داخل اپ — PwaBootstrap پارامتر ?o= را به نمای جزئیات سفارش می‌برد
      url: `/?o=${data.code}`,
      tag: `order-${data.code}`,
    },
    'orderUpdates'
  );
}
