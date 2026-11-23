import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/server/lib/auth';
import { ApiError, handleError, ok } from '@/server/lib/api';
import { listNotificationCenter } from '@/server/services/notification-center.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications — خوراک مرکز اعلان‌ها (زنگوله) + شمارش خوانده‌نشده
 * منبع واحد زنگولهٔ فروشگاه و پنل مدیریت (مدیر هم کاربر است)
 * Expected queries: ۲ (نشست) + ۲ (آیتم‌ها و count موازی) = ۴ — اندازه‌گیری‌شده
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user)
      throw new ApiError(401, 'UNAUTHENTICATED', 'برای مشاهده اعلان‌ها وارد حساب شوید');
    return ok(await listNotificationCenter(user));
  } catch (e) {
    return handleError(e);
  }
}
