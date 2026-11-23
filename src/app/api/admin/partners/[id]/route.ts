import type { NextRequest } from 'next/server';
import { requireAdmin, logAdminAction } from '@/server/lib/rbac';
import { handleError, ok, readJson } from '@/server/lib/api';
import { reviewPartnerRequest } from '@/server/services/partner.service';
import { partnerReviewSchema } from '@/server/validators/partner.schema';

export const dynamic = 'force-dynamic';
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req);
    const { id } = await params;
    const input = partnerReviewSchema.parse(await readJson(req));
    const result = await reviewPartnerRequest(admin, id, input);
    await logAdminAction(req, admin, `PARTNER_${input.decision}`, { requestId: id, userId: result.request.userId });
    return ok(result);
  } catch (error) { return handleError(error); }
}
