import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminBanner, updateAdminBanner } from '@/server/services/admin/banners.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { bannerUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/banners/[id] — ویرایش بنر */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = bannerUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminBanner(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/banners/[id] — حذف بنر */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminBanner(id));
  } catch (e) {
    return handleError(e);
  }
}
