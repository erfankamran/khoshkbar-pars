import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminBanner, listAdminBanners } from '@/server/services/admin/banners.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { bannerCreateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/banners — همه بنرها به ترتیب نمایش */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listAdminBanners());
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/banners — ایجاد بنر صفحه اصلی */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = bannerCreateSchema.parse(await readJson(req));
    return ok(await createAdminBanner(body));
  } catch (e) {
    return handleError(e);
  }
}
