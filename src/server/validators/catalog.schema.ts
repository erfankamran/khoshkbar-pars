import { z } from 'zod';

/**
 * اعتبارسنجی ورودی لایه کاتالوگ (فاز ۵)
 * قانون: هیچ ورودیِ کاربر بدون zod به سرویس/دیتابیس نمی‌رسد (بخش ۱۵ مشخصات)
 */

const slugRegex = /^[a-z0-9-]{2,60}$/;

/** GET /api/products */
export const productQuerySchema = z.object({
  category: z.string().regex(slugRegex, 'اسلاگ دسته نامعتبر است').optional(),
  section: z
    .enum(['all', 'bestseller', 'new', 'discounted', 'suggested'])
    .default('all'),
  sort: z.enum(['popular', 'newest', 'cheap', 'expensive']).default('popular'),
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

/** GET /api/search */
export const searchQuerySchema = z.object({
  q: z.string().trim().max(60).default(''),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** GET /api/products/[slug] */
export const slugParamSchema = z
  .string()
  .regex(slugRegex, 'اسلاگ محصول نامعتبر است');

/** GET /api/products/[slug]/reviews */
export const reviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  reviewId: z.string().min(1).max(128).optional(),
});

/** GET /api/stories — بدون پارامتر | GET /api/banners — بدون پارامتر */
export const emptyQuerySchema = z.object({}).loose();

/** POST /api/products/[slug]/reviews — ثبت نظر (صف بازبینی) */
export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'امتیاز بین ۱ تا ۵').max(5, 'امتیاز بین ۱ تا ۵'),
  comment: z.string().trim().max(1000, 'متن نظر حداکثر ۱۰۰۰ کاراکتر').optional().nullable(),
});
