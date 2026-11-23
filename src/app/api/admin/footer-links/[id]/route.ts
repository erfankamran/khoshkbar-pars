import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminFooterLink, updateAdminFooterLink } from '@/server/services/admin/content.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { footerLinkUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/footer-links/[id] — ویرایش لینک فوتر */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = footerLinkUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminFooterLink(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/footer-links/[id] — حذف لینک فوتر */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminFooterLink(id));
  } catch (e) {
    return handleError(e);
  }
}
