import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminDiscount, listAdminDiscounts } from '@/server/services/admin/discounts.service';
import { handleError, ok, parseQuery, readJson } from '@/server/lib/api';
import { discountCreateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** GET /api/admin/discounts — فهرست کدهای تخفیف با آمار مصرف */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const query = parseQuery(querySchema, req.nextUrl.searchParams);
    return ok(await listAdminDiscounts(query));
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/discounts — ایجاد کد تخفیف */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = discountCreateSchema.parse(await readJson(req));
    return ok(await createAdminDiscount(body));
  } catch (e) {
    return handleError(e);
  }
}
