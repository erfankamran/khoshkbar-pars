import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyOtp } from '@/server/services/auth.service';
import { applyDeviceIdentity, getCartData } from '@/server/services/cart.service';
import { handleError, readJson } from '@/server/lib/api';
import { SESSION_COOKIE, sessionCookieOptions } from '@/server/lib/auth';
import { otpVerifySchema } from '@/server/validators/auth.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/otp/verify — تأیید کد، ورود/ثبت‌نام خودکار، ادغام سبد مهمان
 * Expected queries: ~۱۵-۱۷ (کد ۱ + کاربر ۱ + مصرف کد ۱ + ادغام سبد ~۸ + نشست ۱ + لاگ ۱ + خواندن سبد ۵)
 * پاسخ: user + cart (پس از ادغام) — کوکی pars_session HttpOnly ست می‌شود
 */
export async function POST(req: NextRequest) {
  try {
    const body = otpVerifySchema.parse(await readJson(req));
    const result = await verifyOtp(body, req);

    const cart = await getCartData(result.cartId);

    const res = NextResponse.json({
      ok: true,
      // sessionToken عمداً در بدنه می‌آید — کلاینت آن را در localStorage نگه
      // می‌دارد و در هدر x-pars-session می‌فرستد؛ در iframe بین‌سایتی که کوکی
      // نشست ارسال نمی‌شود (Safari ITP / Chrome 3PCD)، این تنها راه حفظ ورود است
      data: { user: result.user, cart, sessionToken: result.sessionToken },
    });
    res.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions(req));
    // هویت دستگاه در پاسخ echo می‌شود (کوکی + هدر) تا خروج بعدی بتواند
    // سبد کاربر را به همین دستگاه برگرداند — حتی اگر مرورگر کوکی را بلاک کند
    applyDeviceIdentity(res, result.deviceId, req);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
