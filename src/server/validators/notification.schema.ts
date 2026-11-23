import { z } from 'zod';

/**
 * اعتبارسنجی ورودی اعلان‌ها و Push (فاز ۱۰ — رضایت‌محور، بخش ۱۱ مشخصات)
 * قانون پروژه: هیچ ورودی کاربر بدون zod به سرویس/دیتابیس نمی‌رسد (بخش ۱۵)
 */

/** PUT /api/notifications/preferences — هر چهار پرچم همیشه ارسال می‌شوند (کلاینت مالک وضعیت کامل است) */
export const notificationPreferencesSchema = z.object({
  /** رضایت کلی دریافت Push — بدون آن هیچ اعلانی ارسال نمی‌شود */
  pushEnabled: z.boolean(),
  /** اعلان وضعیت سفارش‌ها */
  orderUpdates: z.boolean(),
  /** اعلان‌های تبلیغاتی و جشنواره — پیش‌فرض خاموش (رضایت‌محور) */
  promotions: z.boolean(),
  /** اعلان محصولات جدید */
  newProducts: z.boolean(),
});
export type NotificationPreferencesInput = z.infer<
  typeof notificationPreferencesSchema
>;

/** POST /api/push/subscribe — اشتراک Push از pushManager مرورگر */
export const pushSubscribeSchema = z.object({
  endpoint: z
    .string()
    .url('endpoint نامعتبر است')
    .max(500)
    .refine((v) => v.startsWith('https://') || v.startsWith('http://localhost'), {
      message: 'endpoint باید https باشد',
    }),
  keys: z.object({
    p256dh: z.string().min(40).max(120),
    auth: z.string().min(12).max(60),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

/** POST /api/push/unsubscribe */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url('endpoint نامعتبر است').max(500),
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
