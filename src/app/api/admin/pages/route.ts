import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminPage, listAdminPages } from '@/server/services/admin/content.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { pageCreateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/pages — همه صفحات اختصاصی به ترتیب نمایش */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listAdminPages());
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/pages — ایجاد صفحه جدید (قوانین و شرایط و ...) */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = pageCreateSchema.parse(await readJson(req));
    return ok(await createAdminPage(body));
  } catch (e) {
    return handleError(e);
  }
}
