import { z } from 'zod';

/**
 * اعتبارسنجی ورودی مدیریت محتوا (فاز ۱۱.۵) — بنر، استوری، تنظیمات فروشگاه
 * قانون: هیچ ورودی ادمین بدون zod به سرویس/دیتابیس نمی‌رسد (بخش ۱۵ مشخصات)
 */

/** شناسه‌های cuid دیتابیس — مشترک بنر و استوری */
export const contentIdParamSchema = z
  .string()
  .regex(/^[a-z0-9]{20,40}$/i, 'شناسه نامعتبر است');

/**
 * مسیر تصویر آپلودشده — همان قاعده تصاویر محصول (فاز ۱۱.۲):
 * فقط مسیر نسبی با پسوند webp/png/jpg — URL خارجی و path traversal رد می‌شود
 */
const imageUrlSchema = z
  .string()
  .trim()
  .regex(/^\/[A-Za-z0-9._\-/]+\.(webp|png|jpg|jpeg)$/i, 'مسیر تصویر باید نسبی و با پسوند webp/png/jpg باشد')
  .max(200);

/**
 * رسانهٔ استوری — مثل تصویر، به‌علاوهٔ پسوندهای ویدیو mp4/webm
 * (آپلود ویدیو در فاز ۱۱.۲ نیست؛ فایل دستی در /uploads — آدرس خارجی رد می‌شود)
 */
const mediaUrlSchema = z
  .string()
  .trim()
  .regex(
    /^\/[A-Za-z0-9._\-/]+\.(webp|png|jpg|jpeg|mp4|webm)$/i,
    'مسیر رسانه باید نسبی و با پسوند تصویر یا mp4/webm باشد'
  )
  .max(200);

/**
 * مقصد کلیک — زیرمجموعه امن ViewName روتر فروشگاه:
 * none (بدون لینک) | category (slug) | product (slug) | search (q)
 * بقیه viewها (account/checkout/…) برای بنر معنا ندارند و پذیرفته نمی‌شوند
 */
export const linkViewSchema = z.enum(['none', 'category', 'product', 'search']);

/** پارامترهای مقصد — فقط جفت‌های رشته‌ای تک‌سطحی (JSON ذخیره می‌شود) */
export const linkParamsSchema = z
  .record(z.string(), z.string().trim().max(120))
  .refine((obj) => Object.keys(obj).length <= 3, 'حداکثر ۳ پارامتر مجاز است')
  .optional()
  .nullable();

// ——————————————————————————————————————————————————————————————
// بنرها
// ——————————————————————————————————————————————————————————————

const bannerBaseFields = {
  title: z.string().trim().min(1, 'عنوان الزامی است').max(60, 'عنوان حداکثر ۶۰ کاراکتر'),
  subtitle: z.string().trim().max(120, 'زیرعنوان حداکثر ۱۲۰ کاراکتر').optional().nullable(),
  imageUrl: imageUrlSchema,
  linkView: linkViewSchema.default('none'),
  linkParams: linkParamsSchema,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
};

/** POST /api/admin/banners */
export const adminBannerCreateSchema = z.object(bannerBaseFields);
export type AdminBannerCreate = z.infer<typeof adminBannerCreateSchema>;

/** PATCH /api/admin/banners/[id] — همه فیلدها اختیاری (به‌روزرسانی جزئی) */
export const adminBannerUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(60).optional(),
    subtitle: z.string().trim().max(120).optional().nullable(),
    imageUrl: imageUrlSchema.optional(),
    linkView: linkViewSchema.optional(),
    linkParams: linkParamsSchema,
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'حداقل یک فیلد برای به‌روزرسانی لازم است');
export type AdminBannerUpdate = z.infer<typeof adminBannerUpdateSchema>;

// ——————————————————————————————————————————————————————————————
// استوری‌ها
// ——————————————————————————————————————————————————————————————

const storyBaseFields = {
  /** کلید گروه — لاتین/عدد/خط تیره؛ استوری‌های هم‌کلید در یک دایره می‌نشینند */
  groupKey: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'کلید گروه حداقل ۲ کاراکتر')
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'کلید گروه فقط حروف لاتین کوچک، عدد و خط تیره'),
  groupTitle: z.string().trim().min(1, 'عنوان گروه الزامی است').max(60),
  thumbUrl: imageUrlSchema,
  mediaType: z.enum(['image', 'video']),
  mediaUrl: mediaUrlSchema,
  caption: z.string().trim().max(200, 'کپشن حداکثر ۲۰۰ کاراکتر').optional().nullable(),
  linkView: linkViewSchema.optional().default('none'),
  linkParams: linkParamsSchema,
  /** انقضای اختیاری (تبلیغ فصلی) — null یعنی بدون انقضا */
  expiresAt: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
};

/** POST /api/admin/stories */
export const adminStoryCreateSchema = z.object(storyBaseFields);
export type AdminStoryCreate = z.infer<typeof adminStoryCreateSchema>;

/** PATCH /api/admin/stories/[id] */
export const adminStoryUpdateSchema = z
  .object({
    groupKey: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9-]+$/, 'کلید گروه فقط حروف لاتین کوچک، عدد و خط تیره')
      .optional(),
    groupTitle: z.string().trim().min(1).max(60).optional(),
    thumbUrl: imageUrlSchema.optional(),
    mediaType: z.enum(['image', 'video']).optional(),
    mediaUrl: mediaUrlSchema.optional(),
    caption: z.string().trim().max(200).optional().nullable(),
    linkView: linkViewSchema.optional(),
    linkParams: linkParamsSchema,
    expiresAt: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => {
        if (!v) return null;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
      }),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'حداقل یک فیلد برای به‌روزرسانی لازم است');
export type AdminStoryUpdate = z.infer<typeof adminStoryUpdateSchema>;

// ——————————————————————————————————————————————————————————————
// تنظیمات فروشگاه — فقط کلیدهای whitelist (بقیه کلیدها دست‌نخورده)
// ——————————————————————————————————————————————————————————————

/** شماره تلفن ایران — ثابت یا موبایل، با خط تیره اختیاری */
const phoneSchema = z
  .string()
  .trim()
  .regex(/^0[1-9][0-9-]{7,12}$/, 'شماره تلفن معتبر نیست (مثل ۰۲۱-۹۱۰۰۰۰۰۰)');

export const SETTING_KEYS = [
  'freeShippingThresholdToman',
  'deliveryFeeToman',
  'minOrderToman',
  'storeOpen',
  'supportPhone',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** PUT /api/admin/settings — فقط فیلدهای ارسال‌شده به‌روزرسانی می‌شوند */
export const adminSettingsUpdateSchema = z
  .object({
    freeShippingThresholdToman: z.coerce.number().int().min(0).max(100_000_000).optional(),
    deliveryFeeToman: z.coerce.number().int().min(0).max(10_000_000).optional(),
    minOrderToman: z.coerce.number().int().min(0).max(100_000_000).optional(),
    storeOpen: z.boolean().optional(),
    supportPhone: phoneSchema.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'حداقل یک تنظیم برای ذخیره لازم است');
export type AdminSettingsUpdate = z.infer<typeof adminSettingsUpdateSchema>;
