import { z } from 'zod';

/**
 * اعتبارسنجی اعلان‌های مدیریتی (فاز ۱۱.۶ — اعلان گروهی)
 *
 * قانون رضایت (فاز ۱۰) همچنان برقرار است:
 * - خوراک داخل اپ برای همه اهداف ساخته می‌شود (NotificationLog)
 * - Push فقط برای کسانی فرستاده می‌شود که رضایت فعال دارند؛ نوع اعلان
 *   مشخص می‌کند کدام پرچم رضایت ملاک است:
 *   PROMOTION → promotions ، ANNOUNCEMENT → orderUpdates
 * - هدف PROMO_OPTIN فقط کاربرانِ دارای رضایت تبلیغات را هدف می‌گیرد
 */

/** شناسه cuid — در داده گروهی ذخیره می‌شود تا تاریخچه گروه‌بندی شود */
const cuidLike = z.string().regex(/^[a-z0-9]{20,40}$/i);

/** GET /api/admin/notifications?page=&limit= */
export const adminBroadcastListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type AdminBroadcastListQuery = z.infer<typeof adminBroadcastListQuerySchema>;

/** POST /api/admin/notifications — ارسال گروهی */
export const adminBroadcastSchema = z.object({
  title: z.string().trim().min(2, 'عنوان حداقل ۲ کاراکتر است').max(60, 'عنوان حداکثر ۶۰ کاراکتر است'),
  body: z
    .string()
    .trim()
    .min(2, 'متن حداقل ۲ کاراکتر است')
    .max(300, 'متن حداکثر ۳۰۰ کاراکتر است'),
  /** هدف‌گیری: همه | مشتریان | مدیران | مشترکان رضایت‌دار تبلیغات */
  segment: z.enum(['ALL', 'CUSTOMERS', 'ADMINS', 'PROMO_OPTIN']),
  /** نوع محتوا — ملاک پرچم رضایت Push */
  kind: z.enum(['ANNOUNCEMENT', 'PROMOTION']).default('ANNOUNCEMENT'),
  /** مسیر مقصد داخل اپ — فقط مسیر نسبی مجاز (بدون دامنه خارجی) */
  url: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/[^\s]*$/, 'مقصد باید مسیر نسبی داخل اپ باشد (مثلاً /?view=catalog)')
    .optional(),
});
export type AdminBroadcastInput = z.infer<typeof adminBroadcastSchema>;

/** فقط برای تایپ خروجی — broadcastId در JSON ستون data */
export const broadcastIdSchema = cuidLike;
