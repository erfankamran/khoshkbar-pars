import type { NextRequest } from 'next/server';
import { handleError, ok, readJson } from '@/server/lib/api';
import { removeSubscription } from '@/server/services/notification.service';
import { pushUnsubscribeSchema } from '@/server/validators/notification.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/push/unsubscribe — حذف اشتراک Push این دستگاه
 * Expected queries: ۱ (deleteMany) — مهمان هم مجاز (کوکی لازم نیست)
 */
export async function POST(req: NextRequest) {
  try {
    const body = pushUnsubscribeSchema.parse(await readJson(req));
    return ok(await removeSubscription(body.endpoint));
  } catch (e) {
    return handleError(e);
  }
}
