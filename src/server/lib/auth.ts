import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';

/**
 * زیرساخت نشست ورود (فاز ۹) — lib مستقل تا سرویس‌ها بدون وابستگی چرخشی
 * (auth.service و cart.service هر دو از اینجا import کنند)
 *
 * امنیت (بخش ۱۵ مشخصات):
 * - کوکی HttpOnly + SameSite=Lax + Secure در production — JS هرگز توکن را نمی‌بیند
 * - دیتابیس فقط sha256(token) را نگه می‌دارد — نشت دیتابیس = نشت نشست نیست
 * - توکن ۳۲ بایت تصادفی (256-bit entropy)
 */

export const SESSION_COOKIE = 'pars_session';
export const SESSION_TTL_DAYS = 30;

/**
 * فال‌بک نشست با هدر (رفع 401 «برای ثبت سفارش وارد حساب شوید»):
 * در iframe بین‌سایتی کوکی نشست ممکن است هرگز ارسال نشود — Safari ITP همهٔ
 * کوکی‌های ثالث را بلاک می‌کند، Chrome در حالت 3PCD بدون ویژگی Partitioned
 * نمی‌پذیرد، و کوکی‌ای که پیش از رفع SameSite ست شده تا ورود مجدد Lax می‌ماند.
 * مثل هویت دستگاه (x-pars-device)، کلاینت توکن نشست را از بدنهٔ پاسخ verify/me
 * می‌گیرد، در localStorage نگه می‌دارد و در x-pars-session می‌فرستد — سرور
 * کوکی را ترجیح می‌دهد و هدر فقط فال‌بک است.
 */
export const SESSION_HEADER = 'x-pars-session';
const SESSION_TOKEN_RE = /^[a-f0-9]{64}$/i;

/** آیا درخواست از مبدأ HTTPS آمده؟ (پشت ریورس‌پروکسی — X-Forwarded-Proto) */
export function isHttpsRequest(req?: NextRequest): boolean {
  return req?.headers.get('x-forwarded-proto') === 'https';
}

/**
 * گزینه‌های کوکی نشست — تابع است نه ثابت (رفع خروج خودکار در iframe):
 * روی HTTPS با SameSite=None+Secure ست می‌شود تا مرورگر آن را در iframe
 * بین‌سایتی (پیش‌نمایش/PWA embedded) هم همراه fetch بفرستد؛ با SameSite=Lax
 * کوکی در آن محیط هرگز ارسال نمی‌شود → کاربر پس از رفرش مهمان به نظر می‌رسد.
 * روی HTTP محلی Lax می‌ماند (None بدون Secure از مرورگر پذیرفته نمی‌شود).
 */
export function sessionCookieOptions(req?: NextRequest) {
  const https = isHttpsRequest(req);
  return {
    httpOnly: true,
    sameSite: (https ? 'none' : 'lax') as 'none' | 'lax',
    secure: https || process.env.NODE_ENV === 'production',
    // CHIPS — کوکی پارتیشن‌شده به‌ازای سایت مبدأ؛ در Chrome با بلاک کوکی ثالث
    // (3PCD) هم در iframe همراه درخواست می‌آید. مرورگرهای قدیمی‌تر ویژگی ناشناخته
    // را نادیده می‌گیرند (کوکی همچنان None+Secure است).
    partitioned: https,
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  } as const;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** توکن خام نشست — فقط یک‌بار تولید و در کوکی می‌رود؛ دیتابیس هش آن را دارد */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export interface SessionUser {
  id: string;
  phone: string;
  fullName: string | null;
  role: string;
  /** آواتار شخصیت/آپلودی — فاز آواتار (نمایش در حساب و نظرات) */
  avatarUrl: string | null;
}

/**
 * توکن خام نشست از کوکی یا هدر فال‌بک — کوکی ترجیح دارد؛ هدر فقط وقتی
 * مرورگر کوکی را نفرستاده باشد نقش بازی می‌کند (iframe بین‌سایتی)
 */
export function getSessionToken(req: NextRequest): string | null {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && SESSION_TOKEN_RE.test(cookie)) return cookie;
  const header = req.headers.get(SESSION_HEADER);
  if (header && SESSION_TOKEN_RE.test(header)) return header;
  return null;
}

/**
 * خواندن کاربر از کوکی/هدر نشست — کاربر مهمان → null (بدون خطا)
 * Expected queries: 2 (نشست ۱ + user واکشی رابطه ۱) — اندازه‌گیری‌شده در auth/me
 * فاز پروفایل: lastUsedAt با throttle ۶۰ ثانیه به‌روز می‌شود (مدیریت نشست‌ها)
 */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const token = getSessionToken(req);
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: {
        select: {
          id: true,
          phone: true,
          fullName: true,
          role: true,
          isActive: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (!session.user.isActive) return null;

  // آخرین فعالیت — فقط وقتی بیش از ۶۰ ثانیه از آخرین ثبت گذشته (بدون کوئری اضافی)
  const now = Date.now();
  if (!session.lastUsedAt || now - session.lastUsedAt.getTime() > 60_000) {
    await db.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date(now) } })
      .catch(() => undefined);
  }

  return {
    id: session.user.id,
    phone: session.user.phone,
    fullName: session.user.fullName,
    role: session.user.role,
    avatarUrl: session.user.avatarUrl,
  };
}

/** IP واقعی پشت پروکسی/CDN — برای لاگ امنیتی و محدودیت نرخ */
export function requestIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  );
}
