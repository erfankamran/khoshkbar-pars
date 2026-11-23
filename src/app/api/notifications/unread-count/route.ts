import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/server/lib/auth';
import { handleError, ok } from '@/server/lib/api';
import { unreadCount } from '@/server/services/notification-center.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications/unread-count — شمارش سبک خوانده‌نشده‌ها (Polling زنگوله)
 * مهمان → { unread: 0 } بدون خطا تا زنگوله بدون دردسر کار کند
 * Expected queries: ۲ (نشست) + ۱ (count) = ۳
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) return ok({ unread: 0 });
    return ok(await unreadCount(user));
  } catch (e) {
    return handleError(e);
  }
}
