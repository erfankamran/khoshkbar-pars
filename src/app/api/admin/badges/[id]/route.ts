import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminBadge, updateAdminBadge } from '@/server/services/admin/content.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { badgeUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/badges/[id] — ویرایش نماد اعتماد */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = badgeUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminBadge(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/badges/[id] — حذف نماد اعتماد */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminBadge(id));
  } catch (e) {
    return handleError(e);
  }
}
