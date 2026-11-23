import { z } from 'zod';

/**
 * اعتبارسنجی ورودی مدیریت کدهای تخفیف (فاز ۱۱.۴)
 * قانون: هیچ ورودی ادمین بدون zod به سرویس/دیتابیس نمی‌رسد (بخش ۱۵ مشخصات)
 */

/** شناسه‌های cuid دیتابیس */
export const discountIdParamSchema = z
  .string()
  .regex(/^[a-z0-9]{20,40}$/i, 'شناسه کد تخفیف نامعتبر است');

/** GET /api/admin/discounts?q=&status=&page=&limit= */
export const adminDiscountListQuerySchema = z.object({
  q: z.string().trim().max(30).default(''),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminDiscountListQuery = z.infer<typeof adminDiscountListQuerySchema>;

/**
 * کد تخفیف — حروف لاتین بزرگ، عدد و خط تیره (سرویس به خودکار uppercase می‌برد)
 * تا کاربر با هر حالت تایپی (پارسی/کوچک) بتواند همان کد را وارد کند
 */
const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, 'کد حداقل ۳ کاراکتر است')
  .max(24, 'کد حداکثر ۲۴ کاراکتر است')
  .regex(/^[A-Z0-9-]+$/, 'کد فقط حروف لاتین، عدد و خط تیره');

/** تاریخ ISO از <input type="date"> — رشته خالی/نامعتبر → undefined */
const dateField = z
  .string()
  .trim()
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  });

const baseDiscountFields = {
  code: codeSchema,
  // PERCENT | FIXED
  type: z.enum(['PERCENT', 'FIXED']),
  // PERCENT: 1..100 — FIXED: مبلغ تومان (سرویس سقف منطقی می‌گذارد)
  value: z.coerce.number().int().min(1, 'مقدار حداقل ۱ است').max(100_000_000),
  minSubtotalToman: z.coerce.number().int().min(0).max(100_000_000).optional(),
  maxDiscountToman: z.coerce.number().int().min(1).max(100_000_000).optional(),
  usageLimit: z.coerce.number().int().min(1).max(100_000).optional(),
  startsAt: dateField,
  expiresAt: dateField,
};

/** POST /api/admin/discounts */
export const adminDiscountCreateSchema = z
  .object({
    ...baseDiscountFields,
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'PERCENT' && (data.value < 1 || data.value > 100)) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'درصد تخفیف باید بین ۱ تا ۱۰۰ باشد',
      });
    }
    if (data.type === 'FIXED' && data.value < 1000) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'مبلغ تخفیف ثابت حداقل ۱۰۰۰ تومان است',
      });
    }
    if (data.startsAt && data.expiresAt && data.expiresAt <= data.startsAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'تاریخ پایان باید بعد از تاریخ شروع باشد',
      });
    }
    // سقف تخفیف فقط برای درصد معنا دارد — برای مبلغ ثابت بی‌معناست
    if (data.type === 'FIXED' && data.maxDiscountToman) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxDiscountToman'],
        message: 'سقف تخفیف فقط برای کد درصدی کاربرد دارد',
      });
    }
  });
export type AdminDiscountCreate = z.infer<typeof adminDiscountCreateSchema>;

/** PATCH /api/admin/discounts/[id] — همه فیلدها اختیاری (کد هم قابل تغییر) */
export const adminDiscountUpdateSchema = z
  .object({
    code: codeSchema.optional(),
    type: z.enum(['PERCENT', 'FIXED']).optional(),
    value: z.coerce.number().int().min(1).max(100_000_000).optional(),
    minSubtotalToman: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
    maxDiscountToman: z.coerce.number().int().min(1).max(100_000_000).nullable().optional(),
    usageLimit: z.coerce.number().int().min(1).max(100_000).nullable().optional(),
    startsAt: dateField.nullable(),
    expiresAt: dateField.nullable(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // ترکیب نهایی type/value پس از merge در سرویس بررسی می‌شود؛ اینجا چک‌های
    // فیلدی محلی: درصدِ رد شده در همان payload
    if (data.type === 'PERCENT' && data.value !== undefined && (data.value < 1 || data.value > 100)) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'درصد تخفیف باید بین ۱ تا ۱۰۰ باشد',
      });
    }
    if (data.type === 'FIXED' && data.value !== undefined && data.value < 1000) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'مبلغ تخفیف ثابت حداقل ۱۰۰۰ تومان است',
      });
    }
  });
export type AdminDiscountUpdate = z.infer<typeof adminDiscountUpdateSchema>;
