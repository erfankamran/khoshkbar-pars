import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/lib/rbac';
import { getMyProfile, updateMyProfile } from '@/server/services/user.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { profileUpdateSchema } from '@/server/validators/profile.schema';

export const dynamic = 'force-dynamic';

/** GET /api/user/profile — پروفایل کاربر جاری (فاز پروفایل) */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return ok(await getMyProfile(user.id));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * PUT /api/user/profile — ویرایش نام/نام‌خانوادگی/ایمیل
 * شماره موبایل اینجا قابل تغییر نیست (تغییرش فقط با تأیید مجدد OTP)
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = profileUpdateSchema.parse(await readJson(req));
    return ok(await updateMyProfile(user.id, body, req));
  } catch (e) {
    return handleError(e);
  }
}
