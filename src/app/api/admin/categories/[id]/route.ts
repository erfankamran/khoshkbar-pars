import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminCategory, updateAdminCategory } from '@/server/services/admin/categories.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { categoryUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/categories/[id] — ویرایش دسته‌بندی */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = categoryUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminCategory(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/categories/[id] — حذف (دارای محصول → 409) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminCategory(id));
  } catch (e) {
    return handleError(e);
  }
}
