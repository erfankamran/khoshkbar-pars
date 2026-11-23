import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminDiscount, updateAdminDiscount } from '@/server/services/admin/discounts.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { discountUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/discounts/[id] — ویرایش کد تخفیف (کد خودش تغییر نمی‌کند) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = discountUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminDiscount(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/discounts/[id] — حذف کد تخفیف */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminDiscount(id));
  } catch (e) {
    return handleError(e);
  }
}
