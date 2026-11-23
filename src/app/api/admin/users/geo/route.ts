import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { getAdminUsersGeo } from '@/server/services/admin/users.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/** GET /api/admin/users/geo — استان‌ها/شهرهای یکتا برای فیلتر جغرافیایی کاربران */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await getAdminUsersGeo());
  } catch (e) {
    return handleError(e);
  }
}
