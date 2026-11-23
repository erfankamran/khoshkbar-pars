import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { clearReviewReply, setReviewReply } from '@/server/services/admin/reviews.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { reviewReplySchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** PUT /api/admin/reviews/[id]/reply — ثبت/ویرایش پاسخ فروشگاه به نظر */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = reviewReplySchema.parse(await readJson(req));
    return ok(await setReviewReply(id, body.adminReply));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/reviews/[id]/reply — حذف پاسخ فروشگاه */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await clearReviewReply(id));
  } catch (e) {
    return handleError(e);
  }
}
