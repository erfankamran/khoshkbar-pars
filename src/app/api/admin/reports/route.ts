import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { getSalesReport } from '@/server/services/admin/report-admin.service';
import { adminReportQuerySchema } from '@/server/validators/admin/report-admin.schema';
import { handleError, ok, parseQuery } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/reports?days=7|14|30 — گزارش فروش
 * Expected queries: ۶ — مستند در سرویس
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const query = parseQuery(adminReportQuerySchema, req.nextUrl.searchParams);
    return ok(await getSalesReport(query.days as 7 | 14 | 30));
  } catch (e) {
    return handleError(e);
  }
}
