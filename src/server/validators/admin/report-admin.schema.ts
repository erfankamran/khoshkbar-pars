import { z } from 'zod';

/**
 * اعتبارسنجی گزارش‌های فروش (فاز ۱۱.۶)
 *
 * فقط یک ورودی: بازه روزی — از مجموعه بسته مجاز (۷/۱۴/۳۰) تا کوئری‌های
 * غیرمنتظره روی کل جدول ساخته نشود (قانون بودجه کوئری بخش ۱۵).
 */
export const adminReportQuerySchema = z.object({
  days: z.coerce.number().int().refine((v) => [7, 14, 30].includes(v), {
    message: 'بازه فقط ۷، ۱۴ یا ۳۰ روز است',
  }),
});
export type AdminReportQuery = z.infer<typeof adminReportQuerySchema>;
