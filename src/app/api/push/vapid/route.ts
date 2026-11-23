import { getVapidPublicKey } from '@/server/services/notification.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/push/vapid — کلید عمومی VAPID برای pushManager.subscribe
 * بدون کوئری دیتابیس؛ کلید عمومی است و انتشارش مشکلی ندارد.
 * کلید تنظیم نشده → ۵۰۳ (UI اعلان‌ها را به‌صورت «فعلاً در دسترس نیست» نشان می‌دهد)
 */
export async function GET() {
  try {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return Response.json(
        {
          ok: false,
          error: { code: 'PUSH_NOT_CONFIGURED', message: 'اعلان‌ها فعلاً در دسترس نیست' },
        },
        { status: 503 }
      );
    }
    return ok({ publicKey });
  } catch (e) {
    return handleError(e);
  }
}
