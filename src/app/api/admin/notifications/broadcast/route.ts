import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { broadcastNotification } from '@/server/services/admin/notifications.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { broadcastSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/notifications/broadcast — ارسال گروهی اعلان تبلیغاتی
 * فقط رضایت‌داران (pushEnabled + promotions) با دستگاه فعال — صف‌شدن همگام، تحویل پس‌زمینه
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = broadcastSchema.parse(await readJson(req));
    return ok(await broadcastNotification(body));
  } catch (e) {
    return handleError(e);
  }
}
