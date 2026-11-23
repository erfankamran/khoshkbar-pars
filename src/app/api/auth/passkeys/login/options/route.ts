import type { NextRequest } from 'next/server';
import { createPasskeyLoginOptions } from '@/server/services/passkey.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { normalizePhone } from '@/lib/phone';
import { passkeyLoginOptionsSchema } from '@/server/validators/passkey.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/passkeys/login/options — challenge ورود با Passkey
 * phone اختیاری: با شماره فقط کلیدهای همان کاربر مجاز می‌شوند؛
 * بدون شماره: کلیدهای discoverable (Google Password Manager / iCloud Keychain).
 * وجود یا نبودِ حساب هرگز افشا نمی‌شود — پاسخ هر دو حالت هم‌شکل است
 */
export async function POST(req: NextRequest) {
  try {
    const body = passkeyLoginOptionsSchema.parse(await readJson(req));
    const normalized = body.phone ? normalizePhone(body.phone) : undefined;
    return ok(await createPasskeyLoginOptions(normalized ?? undefined, req));
  } catch (e) {
    return handleError(e);
  }
}
