import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminPage, updateAdminPage } from '@/server/services/admin/content.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { pageUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/pages/[id] — ویرایش صفحه */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = pageUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminPage(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/pages/[id] — حذف صفحه */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminPage(id));
  } catch (e) {
    return handleError(e);
  }
}
