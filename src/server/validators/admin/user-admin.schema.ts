import { z } from 'zod';

/**
 * اعتبارسنجی ورودی مدیریت کاربران (فاز ۱۱.۶)
 * قانون: هیچ ورودی ادمین بدون zod به سرویس/دیتابیس نمی‌رسد (بخش ۱۵ مشخصات)
 *
 * اقدامات صریح هستند نه «ست خام فیلد» — تغییر نقش و فعال/غیرفعال‌سازی هرکدام
 * اکشن جدا دارند تا حفاظت‌های سرویس (خود-محافظتی، آخرین مدیر) قابل اجرا باشد.
 */

/** شناسه‌های cuid دیتابیس */
export const userIdParamSchema = z
  .string()
  .regex(/^[a-z0-9]{20,40}$/i, 'شناسه کاربر نامعتبر است');

/** GET /api/admin/users?q=&role=&status=&page=&limit= */
export const adminUserListQuerySchema = z.object({
  q: z.string().trim().max(60).default(''),
  role: z.enum(['all', 'USER', 'ADMIN']).default('all'),
  status: z.enum(['all', 'ACTIVE', 'INACTIVE']).default('all'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

/**
 * PATCH /api/admin/users/[id] — اقدامات مدیریتی روی کاربر
 *
 * حفاظت‌ها (اجرا در سرویس):
 * - هیچ مدیری نمی‌تواند نقش خودش را عوض کند یا خودش را غیرفعال کند
 * - نقش آخرین مدیر فعال قابل سلب نیست (قفل‌شدن پنل ممکن نشود)
 * - غیرفعال‌سازی، همه نشست‌های فعال کاربر را هم باطل می‌کند
 */
export const adminUserActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SET_ROLE'), role: z.enum(['USER', 'ADMIN']) }),
  z.object({ action: z.literal('ACTIVATE') }),
  z.object({ action: z.literal('DEACTIVATE') }),
]);
export type AdminUserAction = z.infer<typeof adminUserActionSchema>;
