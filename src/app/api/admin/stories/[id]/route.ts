import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminStory, updateAdminStory } from '@/server/services/admin/stories.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { storyUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/stories/[id] — ویرایش آیتم استوری */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = storyUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminStory(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/stories/[id] — حذف آیتم استوری */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminStory(id));
  } catch (e) {
    return handleError(e);
  }
}
