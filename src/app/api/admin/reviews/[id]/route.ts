import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { deleteAdminReview, setReviewApproval } from '@/server/services/admin/reviews.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { reviewUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/reviews/[id] — تأیید یا رد نظر (با اصلاح آمار امتیاز) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = reviewUpdateSchema.parse(await readJson(req));
    return ok(await setReviewApproval(id, body.isApproved));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/reviews/[id] — حذف نظر */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminReview(id));
  } catch (e) {
    return handleError(e);
  }
}
