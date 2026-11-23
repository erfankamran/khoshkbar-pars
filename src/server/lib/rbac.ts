import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { getSessionUser, requestIp, type SessionUser } from '@/server/lib/auth';

/**
 * گارد RBAC پنل مدیریت (فاز ۱۱ — بخش ۱۶ و ۱۵ مشخصات)
 *
 * - احراز هویت: همان نشست OTP فروشگاه (کوکی pars_session یا فال‌بک هدر)
 * - مجوزدهی: نقش کاربر باید ADMIN باشد — بررسی در «هر» endpoint ادمین،
 *   نه فقط در UI (قانون: مجوزها همیشه در Backend بررسی می‌شوند)
 * - حسابرسی: هر تلاش دسترسی غیرمجاز در SecurityLog با رویداد FORBIDDEN
 *   ثبت می‌شود (مسیر + کاربر + IP) — ردپای کامل برای بررسی امنیتی
 */

export type AdminUser = SessionUser & { role: 'ADMIN' };

/**
 * برگرداندن کاربر واردشدهٔ جاری یا پرتاب خطا:
 * بدون نشست معتبر → 401 UNAUTHENTICATED (اندپوینت‌های پروفایل کاربر)
 */
export async function requireUser(req: NextRequest): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'برای این عملیات باید وارد حساب خود شوید'
    );
  }
  return user;
}

/**
 * برگرداندن کاربر مدیر جاری یا پرتاب خطا:
 * - بدون نشست معتبر → 401 UNAUTHENTICATED
 * - نشست معتبر بدون نقش ADMIN → 403 FORBIDDEN + ثبت SecurityLog
 */
export async function requireAdmin(req: NextRequest): Promise<AdminUser> {
  const user = await getSessionUser(req);
  if (!user) {
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'برای دسترسی به پنل مدیریت وارد حساب شوید'
    );
  }
  if (user.role !== 'ADMIN') {
    // لاگ امنیتی نباید هرگز مسیر 403 را بشکند — خطاها بی‌صدا نادیده
    await db.securityLog
      .create({
        data: {
          event: 'FORBIDDEN',
          userId: user.id,
          phone: user.phone,
          ip: requestIp(req),
          meta: JSON.stringify({ path: req.nextUrl.pathname, method: req.method }),
        },
      })
      .catch(() => undefined);
    throw new ApiError(
      403,
      'FORBIDDEN',
      'دسترسی به بخش مدیریت فقط برای مدیران مجاز است'
    );
  }
  return user as AdminUser;
}

/**
 * حسابرسی عملیات ادمین — هر نوشتنِ پنل مدیریت با این تابع در SecurityLog
 * با رویداد ADMIN_ACTION ثبت می‌شود (مسیر + مدیر + IP + جزئیات JSON).
 * لاگ هرگز جریان اصلی را نمی‌شکند — خطاها بی‌صدا نادیده گرفته می‌شوند.
 */
export async function logAdminAction(
  req: NextRequest,
  admin: AdminUser,
  event: string,
  meta?: Record<string, unknown>
): Promise<void> {
  await db.securityLog
    .create({
      data: {
        event,
        userId: admin.id,
        phone: admin.phone,
        ip: requestIp(req),
        meta: JSON.stringify({ path: req.nextUrl.pathname, ...meta }),
      },
    })
    .catch(() => undefined);
}
