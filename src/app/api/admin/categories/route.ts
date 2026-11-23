import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminCategory, listAdminCategories } from '@/server/services/admin/categories.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { categoryCreateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/categories — همه دسته‌ها با شمارش محصولات */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listAdminCategories());
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/categories — ایجاد دسته‌بندی */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = categoryCreateSchema.parse(await readJson(req));
    return ok(await createAdminCategory(body));
  } catch (e) {
    return handleError(e);
  }
}
