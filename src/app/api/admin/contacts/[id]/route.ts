import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminContact, updateAdminContact } from '@/server/services/admin/content.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { contactUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/contacts/[id] — ویرایش شماره تماس */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = contactUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminContact(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/contacts/[id] — حذف شماره تماس */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminContact(id));
  } catch (e) {
    return handleError(e);
  }
}
