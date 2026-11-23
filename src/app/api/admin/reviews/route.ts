import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { listAdminReviews } from '@/server/services/admin/reviews.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { reviewListQuerySchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/reviews — صف تأیید/فهرست نظرات با شمارش‌ها */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const query = parseQuery(reviewListQuerySchema, req.nextUrl.searchParams);
    return ok(await listAdminReviews(query));
  } catch (e) {
    return handleError(e);
  }
}
