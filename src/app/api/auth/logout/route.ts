import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { logout } from '@/server/services/auth.service';
import {
  exportUserCartToDevice,
  resolveDeviceId,
} from '@/server/services/cart.service';
import { handleError } from '@/server/lib/api';
import { SESSION_COOKIE, sessionCookieOptions } from '@/server/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout — باطل کردن نشست + انتقال سبد کاربر به دستگاه + حذف کوکی
 *
 * چرا انتقال سبد؟ پس از ورود، سبدِ دستگاه در ادغام حذف شده و مالکیت سبد
 * فقط با کاربر است — بدون این انتقال، خروج (یا انقضای نشست) سبد کاربر را
 * «خود به خود» خالی می‌کرد.
 * Expected queries: نشست ۲ + انتقال سبد ~۴-۸
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await logout(req);
    // هویت دستگاه از هدر/کوکی — حتی وقتی کوکی در iframe بلاک است هدر می‌رسد
    const { deviceId } = resolveDeviceId(req);
    if (userId && deviceId) {
      await exportUserCartToDevice(userId, deviceId);
    }
    const res = NextResponse.json({ ok: true, data: { loggedOut: true } });
    // حذف کوکی با maxAge صفر
    res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(req), maxAge: 0 });
    return res;
  } catch (e) {
    return handleError(e);
  }
}
