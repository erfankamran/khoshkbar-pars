import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';
import { addressInputSchema } from '@/server/validators/order.schema';

/**
 * اعتبارسنجی دفترچه آدرس (فاز ۱۰)
 * قانون پروژه: هیچ ورودی کاربر بدون zod به سرویس/دیتابیس نمی‌رسد (بخش ۱۵)
 *
 * فیلدهای گیرنده از addressInputSchema سفارش استفاده می‌شوند (منبع واحد حقیقت
 * برای قواعد نام/شماره/کدپستی) تا آدرس ذخیره‌شده همیشه قابل Snapshot در سفارش است.
 */

/** POST /api/addresses و PUT /api/addresses/[id] */
export const saveAddressSchema = addressInputSchema.extend({
  /** برچسب آدرس — «خانه»، «محل کار» و... */
  title: z
    .string()
    .trim()
    .min(2, 'برچسب آدرس حداقل ۲ حرف است')
    .max(30, 'برچسب آدرس حداکثر ۳۰ حرف است'),
  /** تنظیم به‌عنوان آدرس پیش‌فرض — پیش‌فرض false؛ اولین آدرس همیشه پیش‌فرض می‌شود */
  isDefault: z.boolean().optional().default(false),
});
export type SaveAddressInput = z.infer<typeof saveAddressSchema>;

/** پارامتر [id] مسیر — همان الگوی cuid سبد خرید */
const cuidRegex = /^c[a-z0-9]{20,}$/i;
export const addressIdSchema = z.string().regex(cuidRegex, 'شناسه آدرس نامعتبر است');
export type AddressId = z.infer<typeof addressIdSchema>;
