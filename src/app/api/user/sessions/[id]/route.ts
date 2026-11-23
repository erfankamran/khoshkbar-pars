import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/lib/rbac';
import { revokeMySession } from '@/server/services/session.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/user/sessions/[id] — خروج از یک دستگاه دیگر
 * نشست جاری از این مسیر باطل نمی‌شود (خروج فعلی: /api/auth/logout)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    return ok(await revokeMySession(user.id, id, req));
  } catch (e) {
    return handleError(e);
  }
}
