import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminContact, listAdminContacts } from '@/server/services/admin/content.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { contactCreateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/contacts — همه شماره‌های تماس به ترتیب نمایش */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listAdminContacts());
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/contacts — ایجاد شماره تماس */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = contactCreateSchema.parse(await readJson(req));
    return ok(await createAdminContact(body));
  } catch (e) {
    return handleError(e);
  }
}
