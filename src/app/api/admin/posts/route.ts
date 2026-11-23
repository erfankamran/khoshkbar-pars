import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminPost, listAdminPosts } from '@/server/services/admin/blog.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { postCreateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/posts — فهرست همه نوشته‌های وبلاگ (شامل پیش‌نویس) */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listAdminPosts());
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/posts — ایجاد نوشته جدید */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = postCreateSchema.parse(await readJson(req));
    return ok(await createAdminPost(body));
  } catch (e) {
    return handleError(e);
  }
}
