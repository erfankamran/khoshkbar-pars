import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/lib/rbac';
import { verifyPasskeyRegistration } from '@/server/services/passkey.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { passkeyRegisterVerifySchema } from '@/server/validators/passkey.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/passkeys/register/verify — تأیید ثبت کلید عمومی
 * تأیید امضا/Origin/RP ID در کتابخانه + challenge یک‌بارمصرف قفل به کاربر
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = passkeyRegisterVerifySchema.parse(await readJson(req));
    return ok(await verifyPasskeyRegistration(user.id, body, req));
  } catch (e) {
    return handleError(e);
  }
}
