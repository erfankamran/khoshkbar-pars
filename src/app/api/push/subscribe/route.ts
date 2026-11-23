import type { NextRequest } from 'next/server';
import { handleError, ok, readJson } from '@/server/lib/api';
import { getSessionUser } from '@/server/lib/auth';
import { saveSubscription } from '@/server/services/notification.service';
import { pushSubscribeSchema } from '@/server/validators/notification.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/push/subscribe — ثبت اشتراک Push (مهمان هم مجاز؛ با ورود به کاربر وصل می‌شود)
 * Expected queries: ۲ (نشست در صورت ورود) + upsert اشتراک ۱ — اندازه‌گیری‌شده
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = pushSubscribeSchema.parse(await readJson(req));
    const userAgent = req.headers.get('user-agent') ?? undefined;
    return ok(await saveSubscription(user, { ...body, userAgent }));
  } catch (e) {
    return handleError(e);
  }
}
