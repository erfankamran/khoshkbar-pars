import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/lib/rbac';
import { createPasskeyRegisterOptions } from '@/server/services/passkey.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/passkeys/register/options — ساخت challenge ثبت Passkey
 * کاربر باید با OTP وارد شده باشد؛ challenge یک‌بارمصرف ۵ دقیقه‌ای قفل به کاربر
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return ok(await createPasskeyRegisterOptions(user.id, req));
  } catch (e) {
    return handleError(e);
  }
}
