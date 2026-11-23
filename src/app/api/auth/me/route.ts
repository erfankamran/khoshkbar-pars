import type { NextRequest } from 'next/server';
import { me } from '@/server/services/auth.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me — کاربر جاری یا null (مهمان) — همیشه 200
 * Expected queries: 2 (نشست ۱ + کاربر ۱) — اندازه‌گیری‌شده؛ مهمان صفر
 */
export async function GET(req: NextRequest) {
  try {
    return ok(await me(req));
  } catch (e) {
    return handleError(e);
  }
}
