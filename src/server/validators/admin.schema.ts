import { z } from 'zod';
import { pageBlocksSchema } from '@/lib/page-blocks';

/**
 * اعتبارسنجی ورودی همه بخش‌های پنل مدیریت (فاز ۱۴)
 *
 * - SQLite از enum پشتیبانی نمی‌کند → وضعیت‌ها String با zod enum سمت سرویس
 * - پول همیشه عدد صحیح تومان (بدون اعشار)
 * - همه ورودی‌ها strict — فیلد اضافه نادیده، نوع اشتباه → 400 VALIDATION
 */

// ——— ابزار مشترک ———

/** اسلاگ لاتین کوتاه برای URL و فید ترب */
export const slugSchema = z
  .string()
  .trim()
  .min(2, 'اسلاگ حداقل ۲ کاراکتر')
  .max(64, 'اسلاگ حداکثر ۶۴ کاراکتر')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'اسلاگ فقط حروف کوچک لاتین، عدد و خط تیره');

/** آدرس نسبی یا مطلق تصویر داخل فروشگاه */
const urlSchema = z
  .string()
  .trim()
  .min(1, 'آدرس تصویر الزامی است')
  .max(500)
  .refine((v) => v.startsWith('/') || v.startsWith('http'), 'آدرس تصویر نامعتبر');

const viewNameSchema = z.enum(['category', 'product', 'search', 'cart', 'favorites', 'orders', 'blog', 'blogPost', 'none']);

/** پارامترهای ناوبری — شیء دلخواه کوچک؛ به JSON رشته‌ای تبدیل می‌شود */
const linkParamsSchema = z.record(z.string(), z.string().max(200)).optional();

const paginationSchema = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ——— محصولات ———

const variantInputSchema = z.object({
  id: z.string().optional(),
  weightGrams: z.coerce.number().int().min(50, 'حداقل وزن ۵۰ گرم').max(50_000),
  priceToman: z.coerce.number().int().min(1000, 'قیمت حداقل ۱٬۰۰۰ تومان').max(2_000_000_000),
  compareAtPriceToman: z.coerce.number().int().min(0).max(2_000_000_000).nullable().optional(),
  sku: z.string().trim().max(40).optional().nullable(),
  stock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  isActive: z.boolean().default(true),
});

const imageInputSchema = z.object({
  url: urlSchema,
  alt: z.string().trim().max(200).optional().nullable(),
});

const wholesaleInputSchema = z.object({
  weightGrams: z.coerce.number().int().min(50, 'وزن پایه حداقل ۵۰ گرم است').max(1_000_000),
  pricePerKgToman: z.coerce.number().int().min(1000, 'قیمت هر کیلو حداقل ۱۰۰۰ تومان است').max(100_000_000),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  isActive: z.boolean().default(true),
});

export const productCreateSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(3, 'عنوان حداقل ۳ کاراکتر').max(120),
  categoryId: z.string().min(1, 'دسته‌بندی الزامی است'),
  shortDescription: z.string().trim().max(300).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  attributes: z
    .array(z.object({ key: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(120) }))
    .max(12)
    .optional()
    .default([]),
  isSuggested: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  images: z.array(imageInputSchema).max(8).optional().default([]),
  variants: z.array(variantInputSchema).min(1, 'حداقل یک واریانت وزنی الزامی است').max(10),
  wholesale: wholesaleInputSchema.nullable().optional(),
});

export const productUpdateSchema = productCreateSchema.partial().extend({
  // slug در ویرایش هم قابل تغییر است — یکتایی در سرویس چک می‌شود
});

export const productListQuerySchema = paginationSchema.extend({
  categoryId: z.string().optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
});

// ——— دسته‌بندی‌ها ———

export const categoryCreateSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(2, 'عنوان حداقل ۲ کاراکتر').max(60),
  description: z.string().trim().max(300).optional().nullable(),
  imageUrl: urlSchema.optional().nullable(),
  icon: z.string().trim().max(40).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

// ——— بنرها ———

export const bannerCreateSchema = z.object({
  title: z.string().trim().min(2, 'عنوان حداقل ۲ کاراکتر').max(80),
  subtitle: z.string().trim().max(160).optional().nullable(),
  imageUrl: urlSchema,
  linkView: viewNameSchema.optional().nullable(),
  linkParams: linkParamsSchema,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const bannerUpdateSchema = bannerCreateSchema.partial();

// ——— استوری‌ها ———

export const storyCreateSchema = z.object({
  groupKey: slugSchema,
  groupTitle: z.string().trim().min(2, 'عنوان گروه حداقل ۲ کاراکتر').max(60),
  thumbUrl: urlSchema,
  mediaType: z.enum(['image', 'video']).default('image'),
  mediaUrl: urlSchema,
  caption: z.string().trim().max(200).optional().nullable(),
  linkView: viewNameSchema.optional().nullable(),
  linkParams: linkParamsSchema,
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const storyUpdateSchema = storyCreateSchema.partial();

// ——— کدهای تخفیف ———

/** پایه بدون refine — برای مشتق partial در ویرایش */
const discountBaseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'کد حداقل ۳ کاراکتر')
    .max(24)
    .regex(/^[A-Za-z0-9-]+$/, 'کد فقط حروف لاتین، عدد و خط تیره')
    .transform((v) => v.toUpperCase()),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.coerce.number().int().min(1, 'مقدار حداقل ۱').max(100_000_000),
  minSubtotalToman: z.coerce.number().int().min(0).max(2_000_000_000).optional().nullable(),
  maxDiscountToman: z.coerce.number().int().min(0).max(2_000_000_000).optional().nullable(),
  usageLimit: z.coerce.number().int().min(1).max(100_000).optional().nullable(),
  startsAt: z.string().datetime({ offset: true }).optional().nullable(),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const discountCreateSchema = discountBaseSchema
  .refine((d) => d.type !== 'PERCENT' || (d.value >= 1 && d.value <= 100), {
    message: 'درصد تخفیف باید بین ۱ تا ۱۰۰ باشد',
    path: ['value'],
  })
  .refine((d) => !d.expiresAt || !d.startsAt || d.expiresAt > d.startsAt, {
    message: 'تاریخ پایان باید بعد از تاریخ شروع باشد',
    path: ['expiresAt'],
  });

export const discountUpdateSchema = discountBaseSchema.partial().omit({ code: true });

// ——— سفارش‌ها ———

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELED',
] as const;

export const orderListQuerySchema = paginationSchema.extend({
  status: z.enum([...ORDER_STATUSES, 'all']).default('all'),
});

export const orderUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  trackingCode: z.string().trim().max(40).optional().nullable(),
  adminNote: z.string().trim().max(500).optional().nullable(),
});

// ——— نظرات ———

export const reviewListQuerySchema = paginationSchema.extend({
  filter: z.enum(['pending', 'approved', 'all']).default('pending'),
  reviewId: z.string().min(1).max(128).optional(),
});

export const reviewUpdateSchema = z.object({
  isApproved: z.boolean(),
});

/** پاسخ فروشگاه به یک نظر — متن رسمی مدیر (حداکثر ۱۰۰۰ نویسه) */
export const reviewReplySchema = z.object({
  adminReply: z
    .string()
    .trim()
    .min(1, 'متن پاسخ الزامی است')
    .max(1000, 'متن پاسخ حداکثر ۱۰۰۰ نویسه است'),
});

// ——— کاربران ———

export const userListQuerySchema = paginationSchema.extend({
  filter: z.enum(['all', 'active', 'blocked', 'admins', 'partners']).default('all'),
  // فیلتر جغرافیایی (درخواست کاربر) — مقادیر دقیق از dropdown داده‌های واقعی می‌آید
  province: z.string().trim().min(1).max(80).optional(),
  city: z.string().trim().min(1).max(80).optional(),
});

export const userUpdateSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(['USER', 'PARTNER', 'ADMIN']).optional(),
  })
  .refine((u) => u.isActive !== undefined || u.role !== undefined, {
    message: 'حداقل یکی از فیلدهای وضعیت یا نقش الزامی است',
  });

// ——— اطلاع‌رسانی (ارسال گروهی) ———

export const broadcastSchema = z.object({
  title: z.string().trim().min(3, 'عنوان حداقل ۳ کاراکتر').max(60),
  body: z.string().trim().min(3, 'متن حداقل ۳ کاراکتر').max(200),
  linkView: viewNameSchema.optional().nullable(),
  linkParams: linkParamsSchema,
});

// ——— تنظیمات ———

/** کلیدهای قابل ویرایش از پنل — هم‌راستا با whitelist عمومی content.service */
export const SETTING_KEYS = [
  'freeShippingThresholdToman',
  'deliveryFeeToman',
  'minOrderToman',
  'storeOpen',
  'supportPhone',
  // فاز ۱۵ — ارسال پستی
  'shippingMethods',
  'shippingNote',
  // فاز ۱۵ — درگاه پرداخت
  'onlineGatewayEnabled',
  'codEnabled',
  'gatewayProvider',
  'gatewayMerchantId',
  // فاز ۲ (برند و تم) — namespace با پیشوند کلید؛ جدول Setting کلید/مقدار می‌ماند
  'brand.name',
  'brand.fullName',
  'brand.tagline',
  'brand.slogan',
  'brand.description',
  'brand.logoUrl',
  'theme.primary',
  'theme.accent',
  // نقشه موقعیت فروشگاه — در «درباره فروشگاه» نمایش داده می‌شود
  'store.mapLat',
  'store.mapLng',
  // نشانی پستی فروشگاه — سربرگ فاکتور چاپی A5 (درخواست کاربر)
  'store.address',
  'store.postalCode',
  // سرویس پیامک (ملی‌پیامک) — کد تایید OTP واقعی (درخواست کاربر)
  'sms.provider',
  'sms.melipayamak.username',
  'sms.melipayamak.password',
  'sms.melipayamak.sender',
  // اسکرین اسپلش (صفحه آغازین) — درخواست کاربر؛ همه عمومی و بی‌خطرند
  'splash.enabled',
  'splash.logoUrl',
  'splash.backgroundColor',
  'splash.title',
  'splash.slogan',
  'splash.durationMs',
] as const;

export const settingsUpdateSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

/** درگاه‌های پشتیبانی‌شده — SANDBOX یعنی پرداخت شبیه‌سازی‌شده (بدون پول واقعی) */
export const GATEWAY_PROVIDERS = ['SANDBOX', 'ZARINPAL', 'IDPAY', 'ZIBAL'] as const;

// ——— محتوای مستقل فروشگاه (فاز ۳) — FAQ، تماس، نمادها، لینک‌های فوتر ———

/** پرسش متداول */
export const faqCreateSchema = z.object({
  question: z.string().trim().min(4, 'پرسش حداقل ۴ کاراکتر').max(160),
  answer: z.string().trim().min(4, 'پاسخ حداقل ۴ کاراکتر').max(1500),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const faqUpdateSchema = faqCreateSchema.partial();

/** شماره تماس — شماره ایران با نرمال‌سازی (۰۹، ۰۲۱، ...) */
const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .refine(
    (v) => /^(?:\+98|0098|0)?[1-9]\d{9,10}$|^0\d{2,3}-?\d{8}$/.test(v.replace(/[\s-]/g, '')),
    'شماره تماس معتبر نیست'
  );

export const contactCreateSchema = z.object({
  label: z.string().trim().min(2, 'عنوان حداقل ۲ کاراکتر').max(40),
  phone: phoneSchema,
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const contactUpdateSchema = contactCreateSchema.partial();

/** نماد اعتماد — تصویر آپلودی یا داخل public؛ لینک اختیاری به site‌های رسمی */
export const badgeCreateSchema = z.object({
  title: z.string().trim().min(2, 'عنوان حداقل ۲ کاراکتر').max(60),
  imageUrl: urlSchema,
  linkUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v.startsWith('/') || v.startsWith('http'), 'لینک نامعتبر')
    .optional()
    .nullable(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const badgeUpdateSchema = badgeCreateSchema.partial();

/** لینک فوتر — مسیر داخلی (/...) یا نشانی خارجی http(s) */
export const footerLinkCreateSchema = z.object({
  title: z.string().trim().min(2, 'عنوان حداقل ۲ کاراکتر').max(60),
  url: z
    .string()
    .trim()
    .min(1, 'آدرس لینک الزامی است')
    .max(300)
    .refine((v) => v.startsWith('/') || v.startsWith('http'), 'آدرس لینک نامعتبر است'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const footerLinkUpdateSchema = footerLinkCreateSchema.partial();

/** صفحه اختصاصی (درخواست کاربر) — قوانین و شرایط و ... — slug فقط انگلیسی کوچک/عدد/خط تیره */
const pageSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'شناسه صفحه حداقل ۲ کاراکتر')
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{2}$/, 'شناسه فقط حروف انگلیسی کوچک، عدد و خط تیره است');

/**
 * صفحه‌ساز با تمپلیت‌های آماده (درخواست کاربر):
 * editorMode = markdown → متن مارک‌داون | blocks → آرایهٔ بلوک‌ها
 * بلوک‌ها به‌صورت آرایهٔ JSON می‌آیند و سرویس به رشتهٔ JSON تبدیل می‌کند.
 * (تعریف امن بلوک‌ها: lib/page-blocks.ts — whitelist آیکون و لینک)
 */
const pageBaseSchema = z.object({
  slug: pageSlugSchema,
  title: z.string().trim().min(2, 'عنوان حداقل ۲ کاراکتر').max(80),
  body: z.string().trim().max(50000).default(''),
  editorMode: z.enum(['markdown', 'blocks']).default('markdown'),
  blocks: pageBlocksSchema.optional().nullable(),
  isActive: z.boolean().default(true),
  showInFooter: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const pageCreateSchema = pageBaseSchema
  .refine((d) => d.editorMode !== 'markdown' || d.body.trim().length >= 10, {
    message: 'متن صفحه حداقل ۱۰ کاراکتر است',
    path: ['body'],
  })
  .refine((d) => d.editorMode !== 'blocks' || (d.blocks?.length ?? 0) >= 1, {
    message: 'در حالت بلوک‌ها حداقل یک بلوک لازم است',
    path: ['blocks'],
  });

export const pageUpdateSchema = pageBaseSchema.partial();

// ——— وبلاگ (درخواست کاربر) — ورودی سئو فروشگاه ———

/** برچسب‌های پست — رشته با ویرگول؛ ویرگول فارسی هم نرمال می‌شود */
const postTagsSchema = z
  .string()
  .trim()
  .max(160)
  .optional()
  .nullable()
  .transform((v) => (v ? v.replace(/،/g, ',').replace(/\s*,\s*/g, ',').replace(/,+$/, '') || null : null));

export const postCreateSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(3, 'عنوان حداقل ۳ کاراکتر').max(120),
  excerpt: z.string().trim().max(300).optional().nullable(),
  content: z.string().trim().min(10, 'متن نوشته حداقل ۱۰ کاراکتر').max(50000),
  coverUrl: urlSchema.optional().nullable(),
  // سئو — خالی → fallback از title/excerpt در متادیتا
  metaTitle: z.string().trim().max(70).optional().nullable(),
  metaDescription: z.string().trim().max(170).optional().nullable(),
  tags: postTagsSchema,
  // انتشار — publishedAt اولین‌بار در سرویس هنگام گذار به منتشرشده ثبت می‌شود
  isPublished: z.boolean().default(false),
});

export const postUpdateSchema = postCreateSchema.partial();
