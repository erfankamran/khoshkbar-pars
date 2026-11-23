import { sha256, SESSION_HEADER, getSessionToken, requestIp } from '@/server/lib/auth';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { securityLog } from '@/server/services/auth.service';
import type { NextRequest } from 'next/server';

/**
 * مدیریت نشست‌ها (فاز امنیت حساب — بخش ۶ مگاپروژه)
 *
 * از همان جدول Session فعلی استفاده می‌شود (بدون جدول تکراری) —
 * tokenHash نشست جاری از کوکی/هدر استخراج و به‌عنوان «این دستگاه» نشانه‌گذاری می‌شود
 */

export interface SessionDTO {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  /** نشست جاری دستگاه فعلی */
  isCurrent: boolean;
}

/** GET /api/user/sessions — نشست‌های فعال کاربر — Expected queries: ۱ */
export async function listMySessions(
  userId: string,
  req: NextRequest
): Promise<{ sessions: SessionDTO[] }> {
  const currentHash = currentSessionHash(req);
  const now = new Date();

  const sessions = await db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      tokenHash: true,
      userAgent: true,
      ip: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt?.toISOString() ?? s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrent: currentHash !== null && s.tokenHash === currentHash,
    })),
  };
}

/** hash نشست جاری از کوکی/هدر — برای نشانه‌گذاری «این دستگاه» */
function currentSessionHash(req: NextRequest): string | null {
  const token = getSessionToken(req);
  return token ? sha256(token) : null;
}

/**
 * DELETE /api/user/sessions/[id] — باطل کردن یک نشست مشخص
 * نشست جاری با این مسیر باطل نمی‌شود (برای خروج از دستگاه فعلی: /api/auth/logout)
 */
export async function revokeMySession(
  userId: string,
  id: string,
  req: NextRequest
): Promise<{ revoked: boolean }> {
  const session = await db.session.findFirst({
    where: { id, userId, revokedAt: null },
    select: { id: true, tokenHash: true },
  });
  if (!session) throw ApiError.notFound('نشست یافت نشد یا قبلاً باطل شده است');

  const currentHash = currentSessionHash(req);
  if (currentHash && session.tokenHash === currentHash) {
    throw new ApiError(
      400,
      'VALIDATION',
      'نشست جاری از همین‌جا قابل باطل شدن نیست — از دکمه خروج استفاده کنید'
    );
  }

  await db.session.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  await securityLog('SESSION_REVOKED', { userId, ip: requestIp(req), meta: JSON.stringify({ sessionId: id }) });
  return { revoked: true };
}

/**
 * POST /api/user/sessions/revoke-others — باطل کردن همهٔ نشست‌های دیگر
 * Expected queries: باطل‌سازی ۱ + لاگ ۱
 */
export async function revokeMyOtherSessions(
  userId: string,
  req: NextRequest
): Promise<{ revokedCount: number }> {
  const currentHash = currentSessionHash(req);

  // بدون hash جاری (بدون توکن در کوکی/هدر) → همهٔ نشست‌ها باطل می‌شوند؛
  // این وضعیت عملاً رخ نمی‌دهد چون خود اندپوینت auth می‌خواهد
  const result = await db.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(currentHash ? { tokenHash: { not: currentHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  await securityLog('SESSIONS_REVOKED_OTHERS', {
    userId,
    ip: requestIp(req),
    meta: JSON.stringify({ count: result.count }),
  });
  return { revokedCount: result.count };
}
