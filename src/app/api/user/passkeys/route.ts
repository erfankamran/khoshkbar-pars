import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/lib/rbac';
import { listMyPasskeys } from '@/server/services/passkey.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/** GET /api/user/passkeys — کلیدهای Passkey کاربر جاری */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return ok(await listMyPasskeys(user.id));
  } catch (e) {
    return handleError(e);
  }
}
