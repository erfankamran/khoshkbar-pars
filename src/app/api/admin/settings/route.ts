import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { listAdminSettings, updateAdminSettings } from '@/server/services/admin/settings.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { settingsUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/settings — همه کلیدهای قابل ویرایش با مقدار فعلی */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listAdminSettings());
  } catch (e) {
    return handleError(e);
  }
}

/** PUT /api/admin/settings — ذخیره دسته‌ای (فقط whitelist) */
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = settingsUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminSettings(body));
  } catch (e) {
    return handleError(e);
  }
}
