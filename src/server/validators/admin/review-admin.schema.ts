import { z } from 'zod';

/**
 * اعتبارسنجی ورودی مدیریت نظرات (فاز ۱۱.۴)
 */

/** شناسه‌های cuid دیتابیس */
export const reviewIdParamSchema = z
  .string()
  .regex(/^[a-z0-9]{20,40}$/i, 'شناسه نظر نامعتبر است');

/** GET /api/admin/reviews?status=&q=&page=&limit= */
export const adminReviewListQuerySchema = z.object({
  // پیش‌فرض pending — صف کاری اصلی ادمین
  status: z.enum(['all', 'pending', 'approved']).default('pending'),
  q: z.string().trim().max(60).default(''),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;

/**
 * PATCH /api/admin/reviews/[id]
 * APPROVE → نمایش عمومی + افزودن به آمار امتیاز محصول
 * REJECT  → پنهان + کسر از آمار (اگر قبلاً تأیید شده بود)
 */
export const adminReviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('APPROVE') }),
  z.object({ action: z.literal('REJECT') }),
]);
export type AdminReviewAction = z.infer<typeof adminReviewActionSchema>;
