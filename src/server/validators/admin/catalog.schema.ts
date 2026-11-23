import { z } from 'zod';

/**
 * اعتبارسنجی ورودی لایه مدیریت کاتالوگ (فاز ۱۱.۲)
 * قانون: هیچ ورودی ادمین بدون zod به سرویس/دیتابیس نمی‌رسد (بخش ۱۵ مشخصات)
 *
 * نکته: ادمین هم «کاربر» است — ورودی‌اش می‌تواند اشتباه یا مخرب باشد؛
 * همان شدت اعتبارسنجی ورودی مشتری اینجا اعمال می‌شود.
 */

const slugRegex = /^[a-z0-9-]{2,60}$/;
/** شناسه‌های cuid دیتابیس */
export const idParamSchema = z.string().regex(/^[a-z0-9]{20,40}$/i, 'شناسه نامعتبر است');

/** ——— مشترک محصول ——— */

const attributesSchema = z
  .array(
    z.object({
      k: z.string().trim().min(1, 'عنوان ویژگی الزامی است').max(40),
      v: z.string().trim().min(1, 'مقدار ویژگی الزامی است').max(100),
    })
  )
  .max(12, 'حداکثر ۱۲ ویژگی مجاز است');

/** GET /api/admin/products?q=&categoryId=&status=&page=&limit= */
export const adminProductListQuerySchema = z.object({
  q: z.string().trim().max(60).default(''),
  categoryId: z.string().regex(/^[a-z0-9]{20,40}$/i).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;

/** POST /api/admin/products */
export const adminProductCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugRegex, 'اسلاگ فقط حروف لاتین کوچک، عدد و خط تیره (۲ تا ۶۰ کاراکتر)'),
  title: z.string().trim().min(2, 'عنوان الزامی است').max(120),
  categoryId: idParamSchema,
  shortDescription: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  attributes: attributesSchema.optional(),
  isSuggested: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type AdminProductCreate = z.infer<typeof adminProductCreateSchema>;

/** PATCH /api/admin/products/[id] — همه فیلدها اختیاری */
export const adminProductUpdateSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugRegex, 'اسلاگ فقط حروف لاتین کوچک، عدد و خط تیره (۲ تا ۶۰ کاراکتر)')
    .optional(),
  title: z.string().trim().min(2).max(120).optional(),
  categoryId: idParamSchema.optional(),
  shortDescription: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  attributes: attributesSchema.optional(),
  isSuggested: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type AdminProductUpdate = z.infer<typeof adminProductUpdateSchema>;

/** ——— واریانت وزنی ——— */

const variantBase = {
  weightGrams: z
    .number()
    .int()
    .min(10, 'وزن حداقل ۱۰ گرم')
    .max(5000, 'وزن حداکثر ۵۰۰۰ گرم'),
  priceToman: z
    .number()
    .int()
    .min(1_000, 'قیمت حداقل ۱٬۰۰۰ تومان')
    .max(100_000_000, 'قیمت نامعقول است'),
  // تخفیف فقط وقتی معنا دارد که از قیمت فعلی بیشتر باشد — بررسی تطبیقی در سرویس
  compareAtPriceToman: z.number().int().min(1_000).max(100_000_000).nullable().optional(),
  sku: z.string().trim().max(40).optional().nullable(),
  stock: z.number().int().min(0, 'موجودی نمی‌تواند منفی باشد').max(1_000_000),
  isActive: z.boolean().default(true),
};

/** POST /api/admin/products/[id]/variants */
export const adminVariantCreateSchema = z.object(variantBase).refine(
  (v) => !v.compareAtPriceToman || v.compareAtPriceToman > v.priceToman,
  { message: 'قیمت قبل از تخفیف باید بیشتر از قیمت فروش باشد', path: ['compareAtPriceToman'] }
);
export type AdminVariantCreate = z.infer<typeof adminVariantCreateSchema>;

/** PATCH /api/admin/variants/[id] — همه فیلدها اختیاری؛ تطبیق قیمت‌ها در سرویس */
export const adminVariantUpdateSchema = z
  .object({
    weightGrams: variantBase.weightGrams.optional(),
    priceToman: variantBase.priceToman.optional(),
    compareAtPriceToman: variantBase.compareAtPriceToman,
    sku: variantBase.sku,
    stock: variantBase.stock.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.compareAtPriceToman == null ||
      v.priceToman == null ||
      v.compareAtPriceToman > v.priceToman,
    { message: 'قیمت قبل از تخفیف باید بیشتر از قیمت فروش باشد', path: ['compareAtPriceToman'] }
  );
export type AdminVariantUpdate = z.infer<typeof adminVariantUpdateSchema>;

/** ——— تصویر محصول ——— */

/**
 * URL تصویر: مسیر نسبی عمومی (/images/…) یا فایل آپلودشده (/uploads/…)
 * — مسیرهای نسبی جلوی لینک خارجی/SSRF را می‌گیرند؛ فایل /uploads فقط از
 * POST /api/admin/upload می‌آید (ماجیک‌نمبر JPG/PNG/WebP + سقف ۲MB) و سرویس
 * هم وجود فیزیکی فایل در /public را بازبینی می‌کند (assertImageFileExists).
 */
const imageUrlSchema = z
  .string()
  .trim()
  .regex(/^\/[A-Za-z0-9._\-/]+\.(webp|png|jpg|jpeg)$/i, 'مسیر تصویر باید نسبی و با پسوند webp/png/jpg باشد')
  .max(200);

/** POST /api/admin/products/[id]/images */
export const adminImageCreateSchema = z.object({
  url: imageUrlSchema,
  alt: z.string().trim().max(120).optional(),
  sortOrder: z.number().int().min(0).max(100).default(0),
});
export type AdminImageCreate = z.infer<typeof adminImageCreateSchema>;

/** PATCH /api/admin/images/[id] */
export const adminImageUpdateSchema = z.object({
  url: imageUrlSchema.optional(),
  alt: z.string().trim().max(120).optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
});
export type AdminImageUpdate = z.infer<typeof adminImageUpdateSchema>;

/** ——— دسته‌بندی ——— */

/** POST /api/admin/categories */
export const adminCategoryCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugRegex, 'اسلاگ فقط حروف لاتین کوچک، عدد و خط تیره (۲ تا ۶۰ کاراکتر)'),
  title: z.string().trim().min(2, 'عنوان الزامی است').max(80),
  description: z.string().trim().max(500).optional(),
  imageUrl: z
    .string()
    .trim()
    .regex(/^\/[A-Za-z0-9._\-/]+\.(webp|png|jpg|jpeg)$/i, 'مسیر تصویر نامعتبر است')
    .max(200)
    .optional()
    .nullable(),
  icon: z.string().trim().max(40).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});
export type AdminCategoryCreate = z.infer<typeof adminCategoryCreateSchema>;

/** PATCH /api/admin/categories/[id] */
export const adminCategoryUpdateSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugRegex, 'اسلاگ فقط حروف لاتین کوچک، عدد و خط تیره (۲ تا ۶۰ کاراکتر)')
    .optional(),
  title: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  imageUrl: z
    .string()
    .trim()
    .regex(/^\/[A-Za-z0-9._\-/]+\.(webp|png|jpg|jpeg)$/i, 'مسیر تصویر نامعتبر است')
    .max(200)
    .optional()
    .nullable(),
  icon: z.string().trim().max(40).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});
export type AdminCategoryUpdate = z.infer<typeof adminCategoryUpdateSchema>;
