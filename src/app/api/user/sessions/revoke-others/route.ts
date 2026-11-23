import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/lib/rbac';
import { revokeMyOtherSessions } from '@/server/services/session.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/** POST /api/user/sessions/revoke-others — ابطال همهٔ نشست‌های دیگر دستگاه‌ها */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return ok(await revokeMyOtherSessions(user.id, req));
  } catch (e) {
    return handleError(e);
  }
}
