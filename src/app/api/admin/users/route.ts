import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { listAdminUsers } from '@/server/services/admin/users.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { userListQuerySchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/users — فهرست کاربران با جستجو و فیلتر */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const query = parseQuery(userListQuerySchema, req.nextUrl.searchParams);
    return ok(await listAdminUsers(query));
  } catch (e) {
    return handleError(e);
  }
}
