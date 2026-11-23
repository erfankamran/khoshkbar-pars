import type { NextRequest } from 'next/server';
import { requireAdmin, logAdminAction } from '@/server/lib/rbac';
import { getAdminUserDetail, updateAdminUser } from '@/server/services/admin/users.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { userUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users/[id] — جزئیات کامل کاربر (درخواست کاربر)
 * پروفایل + آمار خرید (مجموع تومان سفارش‌های موفق) + ۱۰ سفارش اخیر + آدرس‌ها
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await getAdminUserDetail(id));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * PATCH /api/admin/users/[id] — تغییر نقش/وضعیت
 * گاردها: خود → 400 SELF_MODIFY؛ آخرین مدیر فعال → 409 LAST_ADMIN
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin(req);
    const { id } = await params;
    const body = userUpdateSchema.parse(await readJson(req));
    const result = await updateAdminUser(id, body, { id: admin.id });
    await logAdminAction(req, admin, 'USER_UPDATE', { userId: id, ...body });
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
