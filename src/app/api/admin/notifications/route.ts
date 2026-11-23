import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { getNotificationOverview } from '@/server/services/admin/notifications.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/** GET /api/admin/notifications — آمار مخاطبان + آخرین لاگ‌های ارسال */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await getNotificationOverview());
  } catch (e) {
    return handleError(e);
  }
}
