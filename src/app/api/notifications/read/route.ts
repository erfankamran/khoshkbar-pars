import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/server/lib/auth';
import { ApiError, handleError, ok, readJson } from '@/server/lib/api';
import { markNotificationsRead } from '@/server/services/notification-center.service';

export const dynamic = 'force-dynamic';

/** POST /api/notifications/read — یکی (id) یا همه (all) */
const markReadSchema = z
  .object({
    id: z.string().min(1).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || typeof v.id === 'string', {
    message: 'باید «all» یا «id» ارسال شود',
  });

/**
 * POST /api/notifications/read — علامت‌گذاری خوانده‌شده زنگوله اعلان‌ها
 * گارد مالکیت (userId) در همان دستور updateMany — ضد IDOR
 * Expected queries: حداکثر ۳ (نشست ۲ + update/count)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user)
      throw new ApiError(401, 'UNAUTHENTICATED', 'برای مشاهده اعلان‌ها وارد حساب شوید');
    const input = markReadSchema.parse(await readJson(req));
    return ok(await markNotificationsRead(user, input));
  } catch (e) {
    return handleError(e);
  }
}
