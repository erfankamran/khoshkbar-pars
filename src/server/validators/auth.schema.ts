import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';
import { toEnDigits } from '@/lib/fa';

/**
 * اعتبارسنجی ورودی احراز هویت OTP (فاز ۹)
 * قانون پروژه: هیچ ورودی کاربر بدون zod به سرویس/دیتابیس نمی‌رسد (بخش ۱۵)
 */

/** شماره موبایل — نرمال‌شده به 09xxxxxxxxx؛ ارقام فارسی و +98 پذیرفته می‌شود */
export const phoneSchema = z
  .string()
  .min(4)
  .max(20)
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'شماره موبایل معتبر نیست' });
      return z.NEVER;
    }
    return normalized;
  });

/** کد یک‌بارمصرف ۶ رقمی — ارقام فارسی هم پذیرفته می‌شود */
export const otpCodeSchema = z
  .string()
  .min(4)
  .max(10)
  .transform((value, ctx) => {
    const code = toEnDigits(value).replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) {
      ctx.addIssue({ code: 'custom', message: 'کد باید ۶ رقم باشد' });
      return z.NEVER;
    }
    return code;
  });

/** POST /api/auth/otp/request */
export const otpRequestSchema = z.object({
  phone: phoneSchema,
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

/** POST /api/auth/otp/verify */
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
