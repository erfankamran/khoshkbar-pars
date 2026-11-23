import { z } from 'zod';

/**
 * بلوک‌های صفحه‌ساز پارس (درخواست کاربر) — تمپلیت‌های آمادهٔ کامپوننتی
 *
 * هر صفحهٔ اختصاصی (ContentPage) می‌تواند دو حالت داشته باشد:
 *  - markdown: متن مارک‌داون ساده (رفتار قبلی)
 *  - blocks:   آرایهٔ بلوک‌ها از تمپلیت‌های آماده:
 *      نوشته (text) / کارت‌ها (cards) / آیکون‌ها (icons) /
 *      اسلایدر (slider) / گالری تصاویر (gallery)
 *
 * امنیت:
 *  - ورودی ادمین با zod سمت سرور اعتبارسنجی می‌شود (whitelist کامل)
 *  - آیکون‌ها فقط از فهرست سفید نام‌های lucide انتخاب می‌شوند
 *  - لینک‌ها فقط مسیر داخلی (/...) یا http(s) — مثل قانون لینک مارک‌داون
 *  - رندر با المان‌های React و بدون dangerouslySetInnerHTML انجام می‌شود
 */

/** الگوی لینک مجاز — هم‌راستا با whitelist مارک‌داون (lib/markdown.ts) */
const hrefSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//i.test(v), 'لینک نامعتبر است')
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** تصویر بلوکی — url الزامی (آپلودی /api/media/... یا مسیر public) */
const blockImageSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'آدرس تصویر الزامی است')
    .max(500)
    .refine((v) => v.startsWith('/') || v.startsWith('http'), 'آدرس تصویر نامعتبر است'),
  alt: z.string().trim().max(200).optional().nullable(),
});

// ——— فهرست سفید آیکون‌ها (lucide) — با رندرکننده هم‌نام است ———
export const BLOCK_ICONS = [
  'Truck',
  'ShieldCheck',
  'Headset',
  'Leaf',
  'Sprout',
  'Star',
  'Award',
  'Clock',
  'Phone',
  'MapPin',
  'Sparkles',
  'Heart',
  'Package',
  'BadgeCheck',
  'Recycle',
  'Percent',
  'Gift',
  'Users',
  'Store',
  'CheckCircle2',
  'Timer',
  'Wheat',
  'Cherry',
  'Gem',
  'Flame',
  'Snowflake',
  'Sun',
  'Moon',
  'ThumbsUp',
  'Info',
] as const;
export type BlockIconName = (typeof BLOCK_ICONS)[number];
export const blockIconSchema = z.enum(BLOCK_ICONS);

/** ستون‌های مجاز گرید — ۲ تا ۴ */
const columnsSchema = z.coerce.number().int().min(2).max(4).default(3);

// ——— پنج تمپلیت آماده ———

/** تمپلیت «نوشته» — متن مارک‌داون داخل کارت */
export const textBlockSchema = z.object({
  type: z.literal('text'),
  markdown: z.string().trim().min(1, 'متن بلوک الزامی است').max(20000),
});

/** تمپلیت «کارت‌ها» — گرید کارت با تصویر/نشان/لینک اختیاری */
export const cardsBlockSchema = z.object({
  type: z.literal('cards'),
  columns: columnsSchema,
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'عنوان کارت الزامی است').max(80),
        description: z.string().trim().max(300).optional().nullable(),
        imageUrl: z
          .string()
          .trim()
          .max(500)
          .refine((v) => v.startsWith('/') || v.startsWith('http'), 'آدرس تصویر نامعتبر است')
          .optional()
          .nullable()
          .transform((v) => (v ? v : null)),
        href: hrefSchema,
        badge: z.string().trim().max(30).optional().nullable(),
      })
    )
    .min(1, 'حداقل یک کارت لازم است')
    .max(12),
});

/** تمپلیت «آیکون‌ها» — ردیف ویژگی‌ها با آیکون */
export const iconsBlockSchema = z.object({
  type: z.literal('icons'),
  columns: columnsSchema.default(4),
  items: z
    .array(
      z.object({
        icon: blockIconSchema,
        title: z.string().trim().min(1, 'عنوان الزامی است').max(60),
        description: z.string().trim().max(200).optional().nullable(),
      })
    )
    .min(1, 'حداقل یک آیکون لازم است')
    .max(10),
});

/** تمپلیت «اسلایدر» — اسلایدر تصویری با عنوان/زیرعنوان/لینک اختیاری */
export const sliderBlockSchema = z.object({
  type: z.literal('slider'),
  autoplay: z.boolean().default(true),
  slides: z
    .array(
      z.object({
        imageUrl: blockImageSchema.shape.url,
        title: z.string().trim().max(80).optional().nullable(),
        subtitle: z.string().trim().max(160).optional().nullable(),
        href: hrefSchema,
      })
    )
    .min(1, 'حداقل یک اسلاید لازم است')
    .max(8),
});

/** تمپلیت «گالری» — گرید تصاویر آپلودشده */
export const galleryBlockSchema = z.object({
  type: z.literal('gallery'),
  columns: columnsSchema.default(3),
  images: z.array(blockImageSchema).min(1, 'حداقل یک تصویر لازم است').max(24),
});

/** اتحادیهٔ بلوک‌ها — discriminated union روی type */
export const pageBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  cardsBlockSchema,
  iconsBlockSchema,
  sliderBlockSchema,
  galleryBlockSchema,
]);

export type PageBlock = z.infer<typeof pageBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type CardsBlock = z.infer<typeof cardsBlockSchema>;
export type IconsBlock = z.infer<typeof iconsBlockSchema>;
export type SliderBlock = z.infer<typeof sliderBlockSchema>;
export type GalleryBlock = z.infer<typeof galleryBlockSchema>;

/** آرایهٔ بلوک‌ها — سقف کل: ۳۰ بلوک برای هر صفحه */
export const pageBlocksSchema = z.array(pageBlockSchema).max(30);

/** پارس امن JSON بلوک‌ها — خرابی/نوع اشتباه → null (رندر fallback مارک‌داون) */
export function parsePageBlocks(json: string | null | undefined): PageBlock[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    const result = pageBlocksSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * متن سادهٔ_blocks برای خلاصهٔ سئو — متن بلوک‌های نوشته + عنوان‌های کارت‌ها
 * (fallback توضیحات متا وقتی metaDescription خالی است)
 */
export function blocksToPlain(blocks: PageBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'text':
        parts.push(b.markdown.replace(/[#>*`~\[\]()!|-]/g, ' ').replace(/\s+/g, ' '));
        break;
      case 'cards':
        for (const it of b.items) {
          parts.push(it.title);
          if (it.description) parts.push(it.description);
        }
        break;
      case 'icons':
        for (const it of b.items) {
          parts.push(it.title);
          if (it.description) parts.push(it.description);
        }
        break;
      case 'slider':
        for (const s of b.slides) {
          if (s.title) parts.push(s.title);
          if (s.subtitle) parts.push(s.subtitle);
        }
        break;
      case 'gallery':
        for (const img of b.images) if (img.alt) parts.push(img.alt);
        break;
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
