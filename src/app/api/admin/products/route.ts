import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { createAdminProduct, listAdminProducts } from '@/server/services/admin/products.service';
import { handleError, ok, parseQuery, readJson } from '@/server/lib/api';
import { productCreateSchema, productListQuerySchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/products — فهرست محصولات پنل (جستجو + فیلتر + صفحه‌بندی) */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const query = parseQuery(productListQuerySchema, req.nextUrl.searchParams);
    return ok(await listAdminProducts(query));
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/products — ایجاد محصول با واریانت‌ها و تصاویر */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = productCreateSchema.parse(await readJson(req));
    return ok(await createAdminProduct(body));
  } catch (e) {
    return handleError(e);
  }
}
