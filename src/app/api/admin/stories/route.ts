import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminStory, listAdminStories } from '@/server/services/admin/stories.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { storyCreateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/stories — استوری‌ها گروه‌بندی‌شده */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listAdminStories());
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/stories — ایجاد آیتم استوری */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = storyCreateSchema.parse(await readJson(req));
    return ok(await createAdminStory(body));
  } catch (e) {
    return handleError(e);
  }
}
