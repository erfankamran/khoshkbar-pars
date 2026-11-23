import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { getAdminOrdersGeo } from '@/server/services/admin/orders.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/** GET /api/admin/orders/geo — پراکندگی فاکتورهای فروش به تفکیک استان (نقشهٔ ایران پنل) */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await getAdminOrdersGeo());
  } catch (e) {
    return handleError(e);
  }
}
