import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminBadge, listAdminBadges } from '@/server/services/admin/content.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { badgeCreateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/badges — همه نمادهای اعتماد به ترتیب نمایش */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listAdminBadges());
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/badges — ایجاد نماد اعتماد */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = badgeCreateSchema.parse(await readJson(req));
    return ok(await createAdminBadge(body));
  } catch (e) {
    return handleError(e);
  }
}
