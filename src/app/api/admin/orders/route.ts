import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { getOrderStatusCounts, listAdminOrders } from '@/server/services/admin/orders.service';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { orderListQuerySchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/orders — فهرست سفارش‌ها + شمارش هر وضعیت برای تب‌ها */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const query = parseQuery(orderListQuerySchema, req.nextUrl.searchParams);
    const [list, counts] = await Promise.all([
      listAdminOrders(query),
      getOrderStatusCounts(),
    ]);
    return ok({ ...list, counts });
  } catch (e) {
    return handleError(e);
  }
}
