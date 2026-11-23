import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { saveUploadedImage } from '@/server/services/media.service';
import { securityLog } from '@/server/services/auth.service';
import { requestIp } from '@/server/lib/auth';
import type { NextRequest } from 'next/server';
import type { ProfileUpdateInput } from '@/server/validators/profile.schema';

/**
 * پروفایل کاربر (فاز پروفایل — «حساب کاربری من»)
 *
 * تفکیک سه هویت مستقل:
 *  - Store Identity: جدول Setting (کلیدهای brand.*) — نام فروشگاه هرگز جای نام مشتری نمی‌نشیند
 *  - User Profile: همین سرویس — نام، ایمیل، آواتار شخصی
 *  - Order Recipient: مدل Address (receiverName/receiverPhone) + snapshot سفارش —
 *    کاربر می‌تواند برای دیگران سفارش ثبت کند و تغییر نام پروفایل سفارش‌های
 *    قبلی را تغییر نمی‌دهد (Snapshot در Order.addressSnapshot حفظ است)
 *
 * امنیت:
 *  - شماره موبایل فقط با تأیید مجدد OTP تغییر می‌کند → در ویرایش پروفایل نیست
 *  - همهٔ تغییرات حساس در SecurityLog ثبت می‌شود
 *  - آواتار از همان زیرساخت رسانهٔ امن آپلود می‌شود (magic bytes، سقف حجم، UUID)
 */

/** سقف آواتار: ۲ مگابایت — کوچک‌تر از سقف عمومی رسانه */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** دیتوی پروفایل — از سرویس احراز هویت وارد می‌شود تا یک تعریف واحد بماند */
export type UserProfile = import('@/server/services/auth.service').UserProfileDTO;

/** GET /api/user/profile — پروفایل کامل کاربر جاری — Expected queries: ۱ */
export async function getMyProfile(userId: string): Promise<UserProfile> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      phoneVerifiedAt: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      createdAt: true,
    },
  });
  if (!user) throw ApiError.notFound('کاربر یافت نشد');

  return {
    id: user.id,
    phone: user.phone,
    phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    memberSince: user.createdAt.toISOString(),
  };
}

/**
 * PUT /api/user/profile — ویرایش نام/نام‌خانوادگی/ایمیل
 * fullName برای همهٔ خواننده‌های فعلی پروژه هم‌زمان sync می‌شود
 */
export async function updateMyProfile(
  userId: string,
  input: ProfileUpdateInput,
  req: NextRequest
): Promise<UserProfile> {
  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
  });
  if (!existing) throw ApiError.notFound('کاربر یافت نشد');

  const firstName = input.firstName ?? existing.firstName;
  const lastName = input.lastName ?? existing.lastName;
  // تغییر ایمیل — رویداد حساس؛ در لاگ امنیتی ثبت می‌شود
  // رشتهٔ خالی = حذف ایمیل؛ فیلد غایب = بدون تغییر
  const email =
    input.email !== undefined ? (input.email === '' ? null : input.email) : existing.email;
  if (input.email !== undefined && (input.email ?? '') !== (existing.email ?? '')) {
    await securityLog('PROFILE_EMAIL_CHANGED', {
      userId,
      ip: requestIp(req),
      meta: JSON.stringify({ from: existing.email ?? '', to: email ?? '' }),
    });
  }

  // فاز آواتار — انتخاب شخصیت پارس: آواتار قبلی در لاگ امنیتی ثبت می‌شود
  // (آپلود آواتار مسیر خودش را دارد: uploadMyAvatar — اینجا فقط انتخاب/تغییر)
  const avatarChanged =
    input.avatarUrl !== undefined && input.avatarUrl !== existing.avatarUrl;

  // fullName = «نام نام‌خانوادگی» — هیچ‌وقت نام فروشگاه نیست
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;

  if (avatarChanged) {
    await securityLog('PROFILE_AVATAR_CHANGED', {
      userId,
      ip: requestIp(req),
      meta: JSON.stringify({
        from: existing.avatarUrl ?? '',
        to: input.avatarUrl ?? '',
        method: 'preset',
      }),
    });
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      email,
      fullName,
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    },
    select: {
      id: true,
      phone: true,
      phoneVerifiedAt: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      createdAt: true,
    },
  });

  return {
    id: updated.id,
    phone: updated.phone,
    phoneVerifiedAt: updated.phoneVerifiedAt?.toISOString() ?? null,
    firstName: updated.firstName,
    lastName: updated.lastName,
    fullName: updated.fullName,
    email: updated.email,
    avatarUrl: updated.avatarUrl,
    memberSince: updated.createdAt.toISOString(),
  };
}

/** POST /api/user/profile/avatar — آپلود تصویر پروفایل (همان زیرساخت رسانهٔ امن) */
export async function uploadMyAvatar(userId: string, file: File, req: NextRequest) {
  if (file.size > AVATAR_MAX_BYTES) {
    throw new ApiError(
      413,
      'PAYLOAD_TOO_LARGE',
      'حجم تصویر پروفایل حداکثر ۲ مگابایت است'
    );
  }
  // saveUploadedImage: تشخیص magic bytes + نام UUID امن + ذخیره در storage/media
  const media = await saveUploadedImage(file, { maxBytes: AVATAR_MAX_BYTES });

  const updated = await db.user.update({
    where: { id: userId },
    data: { avatarUrl: media.url },
    select: { avatarUrl: true },
  });

  await securityLog('PROFILE_AVATAR_CHANGED', {
    userId,
    ip: requestIp(req),
    meta: JSON.stringify({ url: media.url }),
  });

  return { avatarUrl: updated.avatarUrl ?? '' };
}
