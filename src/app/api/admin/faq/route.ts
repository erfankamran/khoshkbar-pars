import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminFaq, listAdminFaq } from '@/server/services/admin/content.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { faqCreateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/faq — همه پرسش‌های متداول به ترتیب نمایش */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listAdminFaq());
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/faq — ایجاد پرسش متداول */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = faqCreateSchema.parse(await readJson(req));
    return ok(await createAdminFaq(body));
  } catch (e) {
    return handleError(e);
  }
}
