import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { getAdminStats } from '@/server/services/admin/stats.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/stats — آمار داشبورد مدیریت (فقط نقش ADMIN)
 * Expected queries: ۱۳ (مستند در stats.service — بدون N+1)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await getAdminStats());
  } catch (e) {
    return handleError(e);
  }
}
