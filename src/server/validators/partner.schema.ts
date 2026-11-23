import { z } from 'zod';

export const partnerRequestSchema = z.object({
  businessName: z.string().trim().min(2, 'نام کسب‌وکار را وارد کنید').max(120),
  message: z.string().trim().max(1000, 'توضیحات حداکثر ۱۰۰۰ نویسه است').optional(),
});
export const partnerReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reviewNote: z.string().trim().max(500).optional(),
}).refine((value) => value.decision !== 'REJECT' || !!value.reviewNote, {
  message: 'دلیل رد درخواست را برای مشتری بنویسید', path: ['reviewNote'],
});
export const partnerListSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'all']).default('PENDING'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  requestId: z.string().min(1).max(128).optional(),
});
