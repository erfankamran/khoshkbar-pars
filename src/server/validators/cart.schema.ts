import { z } from 'zod';

/**
 * اعتبارسنجی ورودی لایه سبد خرید (فاز ۸)
 * قانون پروژه: هیچ ورودی کاربر بدون zod به سرویس/دیتابیس نمی‌رسد (بخش ۱۵)
 */

const cuidRegex = /^c[a-z0-9]{20,}$/i;

/** شناسه ردیف سبد در مسیر PATCH/DELETE */
export const cartItemIdParamSchema = z.string().regex(cuidRegex, 'شناسه ردیف سبد نامعتبر است');

/** POST /api/cart/items — افزودن یا افزایش تعداد */
export const addCartItemSchema = z.object({
  productId: z.string().regex(cuidRegex, 'شناسه محصول نامعتبر است'),
  variantId: z.string().regex(cuidRegex, 'شناسه وزن نامعتبر است'),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  weightGrams: z.coerce.number().int().min(50).max(1_000_000).optional(),
  /**
   * قیمتی که کلاینت در لحظه نمایش دیده (فقط راهنما برای تشخیص تغییر قیمت).
   * منبع حقیقت همیشه قیمت واریانت در دیتابیس است — این فیلد هرگز برای محاسبه استفاده نمی‌شود.
   */
  expectedUnitPriceToman: z.coerce.number().int().min(0).optional(),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

/** PATCH /api/cart/items/[itemId] — تغییر تعداد */
export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(20).optional(),
  weightGrams: z.coerce.number().int().min(50).max(1_000_000).optional(),
}).refine((value) => value.quantity !== undefined || value.weightGrams !== undefined, { message: 'تعداد یا وزن را وارد کنید' });
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
