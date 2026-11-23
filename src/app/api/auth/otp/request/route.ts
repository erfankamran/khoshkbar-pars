import type { NextRequest } from 'next/server';
import { requestOtp } from '@/server/services/auth.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { otpRequestSchema } from '@/server/validators/auth.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/otp/request — درخواست کد یک‌بارمصرف
 * Expected queries: 4 (آخرین کد ۱ + شمارش ساعتی ۱ + درج ۱ + لاگ امنیتی ۱)
 * محدودیت نرخ: سرد شدن ۶۰ ثانیه، سقف ۵ کد در ساعت — پاسخ 429 با پیام فارسی
 */
export async function POST(req: NextRequest) {
  try {
    const body = otpRequestSchema.parse(await readJson(req));
    const data = await requestOtp(body.phone, req);
    return ok(data);
  } catch (e) {
    return handleError(e);
  }
}
