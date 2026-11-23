import { z } from 'zod';

/**
 * اعتبارسنجی ورودی مدیریت سفارش‌ها (فاز ۱۱.۳)
 * قانون: هیچ ورودی ادمین بدون zod به سرویس/دیتابیس نمی‌رسد (بخش ۱۵ مشخصات)
 *
 * اکشن‌ها صریح هستند نه «ست خام وضعیت» — هر گذار مجاز payload خاص خودش را
 * دارد (مثلاً SHIP کد رهگیری می‌خواهد)؛ گذارهای غیرمجاز در سرویس 409 می‌گیرند.
 */

/** شناسه‌های cuid دیتابیس */
export const orderIdParamSchema = z
  .string()
  .regex(/^[a-z0-9]{20,40}$/i, 'شناسه سفارش نامعتبر است');

/** GET /api/admin/orders?q=&status=&paymentStatus=&page=&limit= */
export const adminOrderListQuerySchema = z.object({
  q: z.string().trim().max(60).default(''),
  status: z
    .enum(['all', 'PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELED'])
    .default('all'),
  paymentStatus: z.enum(['all', 'UNPAID', 'PAID', 'FAILED', 'REFUNDED']).default('all'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;

/**
 * کد رهگیری پست — حروف لاتین، عدد و خط تیره (فرمت رایج مرسولات).
 * سخت‌گیری پایین نگه داشته شد تا کد رهگیری واقعی هر سرویس پستی رد نشود.
 */
const trackingCodeSchema = z
  .string()
  .trim()
  .min(4, 'کد رهگیری حداقل ۴ کاراکتر است')
  .max(40, 'کد رهگیری حداکثر ۴۰ کاراکتر است')
  .regex(/^[A-Za-z0-9-]+$/, 'کد رهگیری فقط حروف لاتین، عدد و خط تیره');

/**
 * PATCH /api/admin/orders/[id] — اکشن‌های صریح گذار وضعیت
 *
 * قواعد گذار (منبع حقیقت: orders-admin.service — همان‌جا 409 می‌گیرد):
 *   PENDING_PAYMENT → PAID | CANCELED
 *   PAID            → PROCESSING | CANCELED
 *   PROCESSING      → SHIPPED | CANCELED
 *   SHIPPED         → DELIVERED          (لغو پس از ارسال ممنوع — بند ۱۱.۳)
 *   DELIVERED/CANCELED → حالت نهایی
 */
export const adminOrderActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('MARK_PAID') }),
  z.object({ action: z.literal('START_PROCESSING') }),
  z.object({ action: z.literal('SHIP'), trackingCode: trackingCodeSchema }),
  z.object({ action: z.literal('DELIVER') }),
  /** لغو فقط پیش از SHIPPED — دلیل اختیاری برای یادداشت داخلی */
  z.object({
    action: z.literal('CANCEL'),
    reason: z.string().trim().max(300).optional(),
  }),
  /** ویرایش کد رهگیری — فقط روی سفارش ارسال‌شده */
  z.object({ action: z.literal('UPDATE_TRACKING'), trackingCode: trackingCodeSchema }),
  /** یادداشت داخلی مدیر — در هر وضعیت؛ رشته خالی = پاک کردن */
  z.object({
    action: z.literal('SET_ADMIN_NOTE'),
    adminNote: z.string().trim().max(1000).default(''),
  }),
]);
export type AdminOrderAction = z.infer<typeof adminOrderActionSchema>;
