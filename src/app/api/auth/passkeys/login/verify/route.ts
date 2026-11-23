import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyPasskeyLogin } from '@/server/services/passkey.service';
import { applyDeviceIdentity, getCartData } from '@/server/services/cart.service';
import { handleError, readJson } from '@/server/lib/api';
import { SESSION_COOKIE, sessionCookieOptions } from '@/server/lib/auth';
import { passkeyLoginVerifySchema } from '@/server/validators/passkey.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/passkeys/login/verify — ورود با Passkey و ساخت نشست
 * پاسخ هم‌شکل /api/auth/otp/verify (user + cart + sessionToken) تا کلاینت
 * همان جریان ورود را اجرا کند؛ کوکی pars_session HttpOnly ست می‌شود
 */
export async function POST(req: NextRequest) {
  try {
    const body = passkeyLoginVerifySchema.parse(await readJson(req));
    const result = await verifyPasskeyLogin(body, req);
    const cart = await getCartData(result.cartId);

    const res = NextResponse.json({
      ok: true,
      data: { user: result.user, cart, sessionToken: result.sessionToken },
    });
    res.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions(req));
    applyDeviceIdentity(res, result.deviceId, req);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
