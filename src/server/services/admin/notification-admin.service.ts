import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import type { NextRequest } from 'next/server';
import { logAdminAction, type AdminUser } from '@/server/lib/rbac';
import { deliverBroadcast } from '@/server/services/notification.service';
import type {
  AdminBroadcastInput,
  AdminBroadcastListQuery,
} from '@/server/validators/admin/notification-admin.schema';

/**
 * سرویس اعلان گروهی ادمین (فاز ۱۱.۶)
 *
 * جریان ارسال (احترام کامل به رضایت فاز ۱۰):
 *  ۱) هدف‌گیری بر اساس segment (همه | مشتریان | مدیران | مشترکان تبلیغات)
 *  ۲) خوراک داخل اپ برای «همه» اهداف ساخته می‌شود — NotificationLog QUEUED
 *     با data شامل broadcastId (برای گروه‌بندی تاریخچه)
 *  ۳) Push فقط برای کسانی که رضایت دارند: pushEnabled + پرچم متناظر نوع
 *     (PROMOTION → promotions ، ANNOUNCEMENT → orderUpdates)
 *  ۴) نتیجه هر کاربر در لاگ خودش (SENT/FAILED) — شفافیت کامل
 *
 * Expected queries:
 * - broadcast: هدف‌ها ۱ + createMany لاگ ۱ + ترجیحات ۱ + Push (تا ۴ در
 *   deliverBroadcast) + حسابرسی ۱ = حداکثر ۸
 * - listBroadcasts: ۱ (واکشی لاگ‌های گروهی با contains) + گروه‌بندی در حافظه
 */

// ------------------------------------------------------------
// DTOها
// ------------------------------------------------------------

export interface AdminBroadcastResultDTO {
  broadcastId: string;
  /** تعداد کل اهداف (خوراک داخل اپ) */
  recipients: number;
  /** تعداد دارای رضایت Push */
  pushTargets: number;
  sent: number;
  failed: number;
}

export interface AdminBroadcastListDTO {
  items: Array<{
    broadcastId: string;
    title: string;
    body: string;
    segment: string;
    kind: string;
    url: string | null;
    createdAt: string;
    counts: { total: number; sent: number; failed: number };
  }>;
  total: number;
  page: number;
  totalPages: number;
}

// ------------------------------------------------------------
// ارسال گروهی
// ------------------------------------------------------------

export async function broadcastToSegment(
  admin: AdminUser,
  req: NextRequest,
  input: AdminBroadcastInput
): Promise<AdminBroadcastResultDTO> {
  // ۱) هدف‌گیری — فقط کاربران فعال؛ OPTIN از پیش فیلتر رضایت دارد
  const prefWhere =
    input.segment === 'PROMO_OPTIN'
      ? { pushEnabled: true, promotions: true }
      : undefined;
  const targetWhere = {
    isActive: true,
    ...(input.segment === 'CUSTOMERS' ? { role: 'USER' as const } : {}),
    ...(input.segment === 'ADMINS' ? { role: 'ADMIN' as const } : {}),
    ...(prefWhere ? { notificationPref: prefWhere } : {}),
  };

  const targets = await db.user.findMany({
    where: targetWhere,
    select: { id: true },
  });
  if (targets.length === 0) {
    throw new ApiError(
      400,
      'NO_RECIPIENTS',
      'هیچ کاربری با این هدف‌گیری یافت نشد'
    );
  }

  // ۲) خوراک داخل اپ برای همه اهداف — یک createMany
  const broadcastId = randomUUID();
  const dataJson = JSON.stringify({
    broadcastId,
    segment: input.segment,
    kind: input.kind,
    url: input.url ?? '/',
    tag: `broadcast-${broadcastId.slice(0, 8)}`,
  });
  await db.notificationLog.createMany({
    data: targets.map((t) => ({
      userId: t.id,
      title: input.title,
      body: input.body,
      data: dataJson,
      status: 'QUEUED',
    })),
  });

  // ۳) Push فقط برای رضایت‌دارها — پرچم رضایت بر اساس نوع محتوا
  const consentKey =
    input.kind === 'PROMOTION' ? ('promotions' as const) : ('orderUpdates' as const);
  const [logs, consented] = await Promise.all([
    // شناسه لاگ‌های همین برادکست — برای به‌روزرسانی دقیق وضعیت هر کاربر
    db.notificationLog.findMany({
      where: { data: { contains: broadcastId } },
      select: { id: true, userId: true },
    }),
    db.notificationPreference.findMany({
      where: { userId: { in: targets.map((t) => t.id) }, pushEnabled: true, [consentKey]: true },
      select: { userId: true },
    }),
  ]);
  const logIdByUser = new Map(logs.map((l) => [l.userId, l.id]));
  const pushEntries = consented
    .map((c) => {
      const logId = logIdByUser.get(c.userId);
      return logId ? { logId, userId: c.userId } : null;
    })
    .filter((e): e is { logId: string; userId: string } => e !== null);

  let sent = 0;
  let failed = 0;
  if (pushEntries.length > 0) {
    const res = await deliverBroadcast(pushEntries, {
      title: input.title,
      body: input.body,
      url: input.url ?? '/',
      tag: `broadcast-${broadcastId.slice(0, 8)}`,
    });
    sent = res.sent;
    failed = res.failed;
  }

  await logAdminAction(req, admin, 'BROADCAST_SEND', {
    broadcastId,
    segment: input.segment,
    kind: input.kind,
    recipients: targets.length,
    pushTargets: consented.length,
  });

  return {
    broadcastId,
    recipients: targets.length,
    pushTargets: consented.length,
    sent,
    failed,
  };
}

// ------------------------------------------------------------
// تاریخچه برادکست‌ها
// ------------------------------------------------------------

interface BroadcastData {
  broadcastId?: string;
  segment?: string;
  kind?: string;
  url?: string;
}

export async function listBroadcasts(
  query: AdminBroadcastListQuery
): Promise<AdminBroadcastListDTO> {
  // فقط لاگ‌های گروهی (دارای broadcastId در data) — رشته‌ستون، contains امن است
  const rows = await db.notificationLog.findMany({
    where: { data: { contains: 'broadcastId' } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: { title: true, body: true, status: true, createdAt: true, data: true },
  });

  // گروه‌بندی در حافظه بر اساس broadcastId
  interface Group {
    broadcastId: string;
    title: string;
    body: string;
    segment: string;
    kind: string;
    url: string | null;
    createdAt: Date;
    total: number;
    sent: number;
    failed: number;
  }
  const groups = new Map<string, Group>();
  for (const row of rows) {
    let parsed: BroadcastData;
    try {
      parsed = JSON.parse(row.data ?? '{}') as BroadcastData;
    } catch {
      continue;
    }
    const id = parsed.broadcastId;
    if (!id) continue;
    const g = groups.get(id);
    if (g) {
      g.total += 1;
      if (row.status === 'SENT') g.sent += 1;
      else if (row.status === 'FAILED') g.failed += 1;
    } else {
      groups.set(id, {
        broadcastId: id,
        title: row.title,
        body: row.body,
        segment: parsed.segment ?? 'ALL',
        kind: parsed.kind ?? 'ANNOUNCEMENT',
        url: typeof parsed.url === 'string' ? parsed.url : null,
        createdAt: row.createdAt,
        total: 1,
        sent: row.status === 'SENT' ? 1 : 0,
        failed: row.status === 'FAILED' ? 1 : 0,
      });
    }
  }

  const all = [...groups.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  const start = (query.page - 1) * query.limit;
  const pageItems = all.slice(start, start + query.limit);

  return {
    items: pageItems.map((g) => ({
      broadcastId: g.broadcastId,
      title: g.title,
      body: g.body,
      segment: g.segment,
      kind: g.kind,
      url: g.url,
      createdAt: g.createdAt.toISOString(),
      counts: { total: g.total, sent: g.sent, failed: g.failed },
    })),
    total: all.length,
    page: query.page,
    totalPages: Math.max(1, Math.ceil(all.length / query.limit)),
  };
}
