import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';
import { discountCodeInputSchema } from './discount.schema';

/**
 * اعتبارسنجی ورودی ثبت سفارش (فاز ۹)
 * مبالغ هرگز از کلاینت پذیرفته نمی‌شود — سرور از سبد و قیمت دیتابیس محاسبه می‌کند
 * (Snapshot قیمت در OrderItem — بند ۱۳ و ۱۶ مشخصات)
 */

/**
 * عدد اختیاری مختصات پین نقشه — رشتهٔ خالی/undefined کلاینت → undefined؛
 * مقدار پرشده باید در بازهٔ مجاز جغرافیایی باشد (مختصات همیشه جفت ارسال می‌شود،
 * اما هر فیلد مستقل اعتبارسنجی می‌شود تا Snapshot هرگز مقدار خراب نداشته باشد)
 */
const optionalCoord = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? undefined : Number(v)),
    z
      .number()
      .refine((n) => Number.isFinite(n) && n >= min && n <= max, {
        message: 'مختصات پین نقشه نامعتبر است',
      })
      .optional()
  );

/** آدرس تحویل — Snapshot کامل در Order ذخیره می‌شود (JSON) */
export const addressInputSchema = z.object({
  receiverName: z.string().trim().min(3, 'نام گیرنده حداقل ۳ حرف است').max(60),
  receiverPhone: z
    .string()
    .min(4)
    .max(20)
    .transform((value, ctx) => {
      const normalized = normalizePhone(value);
      if (!normalized) {
        ctx.addIssue({ code: 'custom', message: 'شماره گیرنده معتبر نیست' });
        return z.NEVER;
      }
      return normalized;
    }),
  province: z.string().trim().min(2, 'استان را وارد کنید').max(30),
  city: z.string().trim().min(2, 'شهر را وارد کنید').max(30),
  /** کدپستی ۱۰ رقمی — اختیاری؛ ارقام فارسی هم پذیرفته می‌شود */
  postalCode: z
    .string()
    .trim()
    .max(10)
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const digits = v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      return /^\d{10}$/.test(digits) ? digits : undefined;
    }),
  fullAddress: z
    .string()
    .trim()
    .min(10, 'نشانی کامل حداقل ۱۰ حرف است')
    .max(300, 'نشانی حداکثر ۳۰۰ حرف است'),
  /** مختصات پین نقشه تحویل — اختیاری؛ از دفترچه آدرس/تسویه به Snapshot سفارش می‌آید */
  latitude: optionalCoord(-90, 90),
  longitude: optionalCoord(-180, 180),
});
export type AddressInput = z.infer<typeof addressInputSchema>;

/** POST /api/orders */
export const createOrderSchema = z.object({
  address: addressInputSchema,
  /** ONLINE_GATEWAY (شبیه‌سازی‌شده در sandbox) | COD */
  paymentMethod: z.enum(['ONLINE_GATEWAY', 'COD']),
  /** روش ارسال پستی انتخابی مشتری — نامعتبر/غیرفعال باشد سرور بی‌صدا هزینه پایه را می‌گذارد */
  shippingMethodId: z.string().trim().max(24).optional(),
  discountCode: discountCodeInputSchema.optional(),
  expectedDiscountToman: z.number().int().positive().optional(),
  customerNote: z.string().trim().max(300, 'یادداشت حداکثر ۳۰۰ حرف است').optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** GET /api/orders — صفحه‌بندی */
export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

/** POST /api/payments/verify — تأیید پرداخت درگاه پس از بازگشت (فاز ۱۶) */
export const paymentVerifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^PARS-\d{8}-[A-Z2-9]{4}$/, 'کد سفارش نامعتبر است'),
  /** trackId زیبال — باید با نشست پرداخت آغازشده برای همین سفارش یکی باشد */
  trackId: z
    .string()
    .trim()
    .min(1, 'شناسه تراکنش الزامی است')
    .max(20)
    .regex(/^\d+$/, 'شناسه تراکنش نامعتبر است'),
});
export type PaymentVerifyInput = z.infer<typeof paymentVerifySchema>;
