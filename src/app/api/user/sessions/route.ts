import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/lib/rbac';
import { listMySessions } from '@/server/services/session.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/** GET /api/user/sessions — نشست‌های فعال کاربر (نشست جاری نشانه‌گذاری می‌شود) */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return ok(await listMySessions(user.id, req));
  } catch (e) {
    return handleError(e);
  }
}
