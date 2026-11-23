import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminPost, updateAdminPost } from '@/server/services/admin/blog.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { postUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/posts/[id] — ویرایش نوشته */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = postUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminPost(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/posts/[id] — حذف نوشته */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminPost(id));
  } catch (e) {
    return handleError(e);
  }
}
