import { randomInt } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import {
  SESSION_TTL_DAYS,
  generateSessionToken,
  getSessionToken,
  getSessionUser,
  requestIp,
  sha256,
} from '@/server/lib/auth';
import { mergeGuestCart, resolveDeviceId } from '@/server/services/cart.service';
import { sendOtpSms, isSmsConfigured } from '@/server/services/sms.service';
import { randomNutAvatarUrl } from '@/lib/avatars';
import { BRAND } from '@/lib/config';
import type { OtpRequestInput, OtpVerifyInput } from '@/server/validators/auth.schema';

/**
 * سرویس احراز هویت OTP (فاز ۹ — ورود بدون رمز، بخش ۱۴ مشخصات)
 *
 * جریان: requestOtp (کد ۶ رقمی + هش sha256) → verifyOtp (اتصال خودکار کاربر
 * جدید/موجود + ادغام سبد مهمان + نشست HttpOnly)
 *
 * امنیت (بخش ۱۵.۲):
 * - دیتابیس فقط هش کد را نگه می‌دارد — کد خام هرگز ذخیره نمی‌شود
 * - انقضای کد ۵ دقیقه، حداکثر ۵ تلاش برای هر کد، سرد شدن ۶۰ ثانیه بین
 *   درخواست‌ها و سقف ۵ کد در ساعت برای هر شماره
 * - همه رویدادها در SecurityLog (OTP_REQUEST | OTP_VERIFY_FAIL | OTP_RATE_LIMIT
 *   | LOGIN)
 * - ارسال پیامک در sandbox شبیه‌سازی می‌شود: devCode فقط در محیط غیرproduction
 *   در پاسخ برمی‌گردد (در production جایگزین سرویس پیامک واقعی می‌شود)
 */

const OTP_TTL_SECONDS = 5 * 60;
const OTP_COOLDOWN_SECONDS = 60;
const OTP_HOURLY_LIMIT = 5;
const OTP_MAX_ATTEMPTS = 5;

/**
 * کد مادر محیطی برای ورود بدون پیامک (راه‌حل موقت تا اتصال سرویس پیامک واقعی)
 *
 * - dev/پیش‌نمایش: وقتی env تنظیم نشده باشد پیش‌فرض «۱۲۳۴۵۶» فعال است
 * - هر محیطی با NEXT_PUBLIC_DEV_MODE=true (فایل .env — وضعیت توسعه/دمو کاربر)
 * - production بدون فلگ: مسیر کد مادر به‌کلی غیرفعال
 */
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
const DEV_MASTER_OTP: string | null =
  DEV_MODE || process.env.NODE_ENV !== 'production'
    ? process.env.OTP_MASTER_CODE?.trim() || '123456'
    : null;

export interface OtpRequestResult {
  expiresInSeconds: number;
  resendAfterSeconds: number;
  /** فقط محیط توسعه/sandbox — برای تست بدون سرویس پیامک */
  devCode?: string;
  /** آیا کد واقعاً با پیامک ارسال شد؟ (ملی‌پیامک پیکربندی‌شده) */
  smsSent?: boolean;
}

export interface AuthUserDTO {
  id: string;
  phone: string;
  fullName: string | null;
  role: string;
  /** آواتار شخصیت پارس یا آپلود کاربر — فاز آواتار */
  avatarUrl: string | null;
}

export interface OtpVerifyResult {
  user: AuthUserDTO;
  /** توکن خام نشست — فقط در کوکی HttpOnly ست می‌شود، در بدنه پاسخ نمی‌آید */
  sessionToken: string;
  /** سبد پس از ادغام — کلاینت store سبد را با این جایگزین می‌کند */
  cartId: string;
  /** هویت دستگاه استفاده‌شده در ادغام — در پاسخ echo می‌شود تا خروج بعدی سبد را به همان دستگاه برگرداند */
  deviceId: string;
}

/** دیتوی کامل پروفایل — فاز پروفایل (نمایش/ویرایش حساب کاربری من) */
export interface UserProfileDTO {
  id: string;
  phone: string;
  phoneVerifiedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  memberSince: string;
}

function hashOtp(phone: string, code: string): string {
  const secret = process.env.AUTH_SECRET ?? 'pars-dev-secret';
  return sha256(`pars:otp:${phone}:${code}:${secret}`);
}

export async function securityLog(
  event: string,
  data: { userId?: string; phone?: string; ip?: string; meta?: string }
): Promise<void> {
  await db.securityLog.create({
    data: {
      event,
      userId: data.userId,
      phone: data.phone,
      ip: data.ip,
      meta: data.meta,
    },
  });
}

// ------------------------------------------------------------
// درخواست کد یک‌بارمصرف
// ------------------------------------------------------------

/**
 * Expected queries: آخرین کد ۱ + شمارش ساعتی ۱ + درج کد ۱ + لاگ امنیتی ۱ = ۴
 */
export async function requestOtp(
  phone: string,
  req: NextRequest
): Promise<OtpRequestResult> {
  const now = new Date();
  const ip = requestIp(req);

  // سرد شدن — آخرین کد این شماره چه زمانی؟
  const last = await db.otpCode.findFirst({
    where: { phone },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (last) {
    const elapsed = Math.floor((now.getTime() - last.createdAt.getTime()) / 1000);
    if (elapsed < OTP_COOLDOWN_SECONDS) {
      const remaining = OTP_COOLDOWN_SECONDS - elapsed;
      throw new ApiError(
        429,
        'OTP_COOLDOWN',
        `${remaining} ثانیه دیگر می‌توانید کد جدید بخواهید`
      );
    }
  }

  // سقف ساعتی برای هر شماره
  const hourCount = await db.otpCode.count({
    where: { phone, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
  });
  if (hourCount >= OTP_HOURLY_LIMIT) {
    await securityLog('OTP_RATE_LIMIT', { phone, ip });
    throw new ApiError(
      429,
      'OTP_RATE_LIMIT',
      'تعداد درخواست کد بیش از حد مجاز است — یک ساعت دیگر تلاش کنید'
    );
  }

  // کد ۶ رقمی تصادفی — فقط هش ذخیره می‌شود
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.otpCode.create({
    data: {
      phone,
      codeHash: hashOtp(phone, code),
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      ip,
    },
  });
  await securityLog('OTP_REQUEST', { phone, ip });

  // ——— ارسال واقعی پیامک با ملی‌پیامک (درخواست کاربر) ———
  // وقتی پنل پیکربندی شده: کد پیامک می‌شود؛ شکست ارسال → خطای خوانا (مگر در
  // محیط تست با OTP_DEV_CODE_EXPOSE که مسیر sandbox حفظ می‌شود)
  let smsSent = false;
  const devExposed = DEV_MODE || process.env.OTP_DEV_CODE_EXPOSE === '1';
  const smsConfigured = await isSmsConfigured();
  if (smsConfigured) {
    const sent = await sendOtpSms(phone, code, BRAND.name);
    if (sent.ok) {
      smsSent = true;
    } else if (!devExposed) {
      // خطای ارسال پیامک — کد در دیتابیس مانده؛ تلاش مجدد بعد از سرد شدن
      await securityLog('OTP_SMS_FAIL', { phone, ip, meta: JSON.stringify({ error: sent.error?.slice(0, 200) }) });
      throw new ApiError(502, 'SMS_SEND_FAILED', sent.error ?? 'ارسال پیامک ناموفق بود — دوباره تلاش کنید');
    } else {
      // محیط تست — با وجود خطای پیامک، devCode به جریان رگرسیون نبند می‌شود
      await securityLog('OTP_SMS_FAIL', { phone, ip, meta: JSON.stringify({ error: sent.error?.slice(0, 200) }) });
    }
  }

  return {
    expiresInSeconds: OTP_TTL_SECONDS,
    resendAfterSeconds: OTP_COOLDOWN_SECONDS,
    // آیا کد واقعاً با پیامک ارسال شد؟ (ملی‌پیامک پیکربندی‌شده — درخواست کاربر)
    ...(smsSent ? { smsSent: true } : {}),
    // شبیه‌سازی پیامک در sandbox — در production با سرویس پیامک جایگزین می‌شود.
    // استثنا: وضعیت توسعه (.env) یا OTP_DEV_CODE_EXPOSE=1 برای رگرسیون روی
    // بیلد تولیدی — پیش‌فرض production هرگز devCode نمی‌دهد.
    ...(process.env.NODE_ENV !== 'production' ||
    DEV_MODE ||
    process.env.OTP_DEV_CODE_EXPOSE === '1'
      ? { devCode: code }
      : {}),
  };
}

// ------------------------------------------------------------
// تأیید کد + ورود + ادغام سبد
// ------------------------------------------------------------

/**
 * Expected queries: آخرین کد ۱ + (در صورت خطا: increment ۱ + لاگ ۱) +
 * مسیر موفق: upsert کاربر ۱ + مصرف کد ۱ + ادغام سبد ~۶-۸ + نشست ۱ + لاگ ۱
 */
export async function verifyOtp(
  input: OtpVerifyInput,
  req: NextRequest
): Promise<OtpVerifyResult> {
  const now = new Date();
  const ip = requestIp(req);
  const userAgent = req.headers.get('user-agent') ?? undefined;

  // مسیر کد مادر محیط تست — بدون نیاز به پیامک و بدون لیمیتِ کد (در production غیرفعال)
  if (DEV_MASTER_OTP && input.code === DEV_MASTER_OTP) {
    return loginWithPhone(input.phone, { now, ip, userAgent, req });
  }

  // فعال‌ترین کد (آخرین کد مصرف‌نشده و منقضی‌نشده)
  const otp = await db.otpCode.findFirst({
    where: {
      phone: input.phone,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    throw new ApiError(
      400,
      'OTP_NOT_FOUND',
      'کد فعالی برای این شماره نیست — کد جدید درخواست کنید'
    );
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await db.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: now },
    });
    throw new ApiError(
      429,
      'OTP_TOO_MANY_ATTEMPTS',
      'تعداد تلاش‌های بیش از حد — کد جدید درخواست کنید'
    );
  }

  if (hashOtp(input.phone, input.code) !== otp.codeHash) {
    await db.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    await securityLog('OTP_VERIFY_FAIL', {
      phone: input.phone,
      ip,
      meta: JSON.stringify({ attempt: otp.attempts + 1 }),
    });
    const remaining = OTP_MAX_ATTEMPTS - (otp.attempts + 1);
    throw new ApiError(
      400,
      'OTP_INVALID',
      remaining > 0
        ? `کد وارد شده درست نیست — ${remaining} تلاش باقی مانده`
        : 'کد وارد شده درست نیست — کد جدید درخواست کنید'
    );
  }

  // مرحلهٔ نهایی ورود — مشترک بین مسیر کد عادی و کد مادر محیط تست
  return loginWithPhone(input.phone, {
    now,
    ip,
    userAgent,
    req,
    consumeOtpId: otp.id,
  });
}

/**
 * مرحلهٔ نهایی ورود: ثبت/به‌روزرسانی کاربر + ادغام سبد مهمان + ساخت نشست
 *
 * - consumeOtpId: در مسیر عادی، کد مصرف‌شده مصرف می‌شود؛ مسیر کد مادر کدِ
 *   واقعی ندارد و این پارامتر را نمی‌فرستد
 */
async function loginWithPhone(
  phone: string,
  args: {
    now: Date;
    ip: string;
    userAgent?: string;
    req: NextRequest;
    consumeOtpId?: string;
  },
): Promise<OtpVerifyResult> {
  const { now, ip, userAgent, req } = args;

  // ورود/ثبت‌نام خودکار — شماره تنها شناسه (بدون رمز)
  // فاز آواتار: کاربر تازه‌وارد خودکار یکی از ۸ شخصیت مغز پارس را می‌گیرد
  const user = await db.user.upsert({
    where: { phone },
    create: {
      phone,
      lastLoginAt: now,
      phoneVerifiedAt: now,
      avatarUrl: randomNutAvatarUrl(),
    },
    update: { lastLoginAt: now },
    select: {
      id: true,
      phone: true,
      fullName: true,
      role: true,
      isActive: true,
      phoneVerifiedAt: true,
      avatarUrl: true,
    },
  });
  if (!user.isActive) {
    throw new ApiError(
      403,
      'ACCOUNT_DISABLED',
      'حساب شما غیرفعال است — با پشتیبانی تماس بگیرید'
    );
  }

  if (args.consumeOtpId) {
    await db.otpCode.update({
      where: { id: args.consumeOtpId },
      data: { consumedAt: now },
    });
  }

  return createUserSession(user, req, {
    now,
    ip,
    userAgent,
    // فاز OTP — زمان اولین تأیید موفق شماره ثبت می‌شود (هرگز تغییر نمی‌کند)
    stampPhoneVerified: user.phoneVerifiedAt === null,
  });
}

// ------------------------------------------------------------
// ساخت نشست — مشترک بین ورود OTP و ورود Passkey
// ------------------------------------------------------------

interface SessionUserRow {
  id: string;
  phone: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  avatarUrl: string | null;
}

/** خواندن کاربر فعال برای ورود — حساب غیرفعال → ۴۰۳ */
export async function getActiveUserForLogin(userId: string): Promise<SessionUserRow> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      fullName: true,
      role: true,
      isActive: true,
      avatarUrl: true,
    },
  });
  if (!user || !user.isActive) {
    throw new ApiError(
      403,
      'ACCOUNT_DISABLED',
      'حساب شما غیرفعال است — با پشتیبانی تماس بگیرید'
    );
  }
  return user;
}

/**
 * مرحلهٔ مشترک پایان ورود (OTP یا Passkey):
 * ادغام سبد مهمان دستگاه + ساخت نشست جدید + لاگ امنیتی
 * Expected queries: ادغام سبد ~۶-۸ + نشست ۱ + لاگ ۱ (+ stamp تأیید شماره در صورت نیاز)
 */
export async function createUserSession(
  user: SessionUserRow,
  req: NextRequest,
  opts: {
    now: Date;
    ip: string;
    userAgent?: string;
    /** اولین ورود موفق شماره → زمان تأیید شماره ثبت شود */
    stampPhoneVerified?: boolean;
    /** روش ورود برای لاگ امنیتی */
    method?: 'otp' | 'passkey';
  }
): Promise<OtpVerifyResult> {
  const { now, ip, userAgent } = opts;

  if (opts.stampPhoneVerified) {
    await db.user.update({
      where: { id: user.id },
      data: { phoneVerifiedAt: now },
    }).catch(() => undefined);
  }

  // ادغام سبد مهمان دستگاه با سبد کاربر — هویت دستگاه: هدر → کوکی
  // (هدر تنها هویتی است که وقتی مرورگر کوکی را در iframe بلاک می‌کند هم می‌رسد)
  const { deviceId } = resolveDeviceId(req);
  const cartId = await mergeGuestCart(user.id, deviceId);
  // نشست جدید — دیتابیس فقط هش توکن را دارد
  const sessionToken = generateSessionToken();
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(sessionToken),
      userAgent,
      ip,
      expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
      lastUsedAt: now,
    },
  });
  await securityLog('LOGIN', {
    userId: user.id,
    phone: user.phone,
    ip,
    meta: opts.method ? JSON.stringify({ method: opts.method }) : undefined,
  });

  return {
    user: {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
    sessionToken,
    cartId,
    deviceId,
  };
}

// ------------------------------------------------------------
// وضعیت کاربر و خروج
// ------------------------------------------------------------

/**
 * GET /api/auth/me — کاربر مهمان: { user: null } با کد ۲۰۰
 * sessionToken echo — توکنی که درخواست با آن احراز شده (کوکی یا هدر) تا کلاینت
 * در localStorage ذخیره کند و فال‌بک هدر x-pars-session همیشه به‌روز بماند
 */
export async function me(
  req: NextRequest
): Promise<{ user: AuthUserDTO | null; sessionToken?: string }> {
  const user = await getSessionUser(req);
  if (!user) return { user: null };
  return { user, sessionToken: getSessionToken(req) ?? undefined };
}

/**
 * POST /api/auth/logout — باطل کردن نشست فعلی (revokedAt)
 * توکن از کوکی یا هدر فال‌بک — خروج باید حتی در محیط بی‌کوکی (iframe) هم کار کند
 * return: شناسه کاربر برای انتقال سبد او به دستگاه (خروج ≠ خالی‌شدن سبد)
 * Expected queries: 2 (نشست ۱ + updateMany ۱ — توکن نامعتبر → بدون خطا)
 */
export async function logout(req: NextRequest): Promise<string | null> {
  const token = getSessionToken(req);
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = await db.session.findFirst({
    where: { tokenHash, revokedAt: null },
    select: { userId: true },
  });
  if (!session) return null;
  await db.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return session.userId;
}
