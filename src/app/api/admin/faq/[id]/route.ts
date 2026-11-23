import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminFaq, updateAdminFaq } from '@/server/services/admin/content.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { faqUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/faq/[id] — ویرایش پرسش متداول */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = faqUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminFaq(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/faq/[id] — حذف پرسش متداول */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminFaq(id));
  } catch (e) {
    return handleError(e);
  }
}
