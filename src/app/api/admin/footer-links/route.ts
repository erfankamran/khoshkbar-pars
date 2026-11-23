import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminFooterLink, listAdminFooterLinks } from '@/server/services/admin/content.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { footerLinkCreateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/footer-links — همه لینک‌های فوتر به ترتیب نمایش */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listAdminFooterLinks());
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/footer-links — ایجاد لینک فوتر */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = footerLinkCreateSchema.parse(await readJson(req));
    return ok(await createAdminFooterLink(body));
  } catch (e) {
    return handleError(e);
  }
}
