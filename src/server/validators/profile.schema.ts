import { z } from 'zod';
import { isAllowedAvatarUrl } from '@/lib/avatars';

/**
 * اعتبارسنجی ورودی پروفایل کاربر (فاز پروفایل)
 *
 * تفکیک هویت: نام شخصی کاربر هرگز با نام فروشگاه اشتباه نمی‌شود —
 * پیش‌فرض نمایش «کاربر جدید» است (نه «پارس») تا وقتی خودش ثبت کند
 */

/** نام فارسی/لاتین — بدون رقم و علائم فنی */
const nameSchema = z
  .string()
  .trim()
  .min(2, 'نام حداقل ۲ کاراکتر')
  .max(40, 'نام حداکثر ۴۰ کاراکتر')
  .regex(/^[\p{L}\p{M}\s\u200c]+$/u, 'نام فقط می‌تواند حروف باشد (بدون رقم و علامت)');

export const firstNameSchema = nameSchema;
export const lastNameSchema = nameSchema;

/** ایمیل اختیاری — رشتهٔ خالی یعنی حذف؛ فیلد غایب یعنی بدون تغییر */
const emailInput = z.union([
  z.string().trim().toLowerCase().max(120).email('ایمیل معتبر نیست'),
  z.literal(''),
]);

/** آواتار — فقط شخصیت‌های پارس (/avatars/) یا آپلود امن رسانه (/api/media/) */
const avatarUrlInput = z
  .string()
  .trim()
  .max(500)
  .refine(isAllowedAvatarUrl, 'آواتار انتخابی معتبر نیست');

/** PUT /api/user/profile — همهٔ فیلدها اختیاری؛ شماره موبایل اینجا نیست (تغییرش فقط با تأیید مجدد OTP) */
export const profileUpdateSchema = z
  .object({
    firstName: nameSchema.optional(),
    lastName: lastNameSchema.optional(),
    email: emailInput.optional(),
    avatarUrl: avatarUrlInput.optional(),
  })
  .refine(
    (v) =>
      v.firstName !== undefined ||
      v.lastName !== undefined ||
      v.email !== undefined ||
      v.avatarUrl !== undefined,
    {
      message: 'حداقل یکی از فیلدهای نام، نام خانوادگی، ایمیل یا آواتار ارسال شود',
    }
  );
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
