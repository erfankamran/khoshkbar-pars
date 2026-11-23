import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/server/lib/auth';
import { ApiError, handleError, ok } from '@/server/lib/api';
import {
  getPreferences,
  updatePreferences,
} from '@/server/services/notification.service';
import { notificationPreferencesSchema } from '@/server/validators/notification.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications/preferences — ترجیحات اعلان کاربر جاری
 * Expected queries: ۲ (نشست) + ۱ (ترجیحات) = ۳ — اندازه‌گیری‌شده
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user)
      throw new ApiError(401, 'UNAUTHENTICATED', 'برای تنظیم اعلان‌ها وارد حساب شوید');
    return ok(await getPreferences(user));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * PUT /api/notifications/preferences — ذخیره رضایت‌ها (upsert)
 * Expected queries: ۲ (نشست) + upsert ۱ (INSERT ON CONFLICT — اندازه‌گیری‌شده) = ۳
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user)
      throw new ApiError(401, 'UNAUTHENTICATED', 'برای تنظیم اعلان‌ها وارد حساب شوید');
    const body = notificationPreferencesSchema.parse(await req.json());
    return ok(await updatePreferences(user, body));
  } catch (e) {
    return handleError(e);
  }
}
