import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import {
  deleteAdminProduct,
  getAdminProduct,
  updateAdminProduct,
} from '@/server/services/admin/products.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { productUpdateSchema } from '@/server/validators/admin.schema';

export const dynamic = 'force-dynamic';

/** GET /api/admin/products/[id] — جزئیات کامل برای ویرایش */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await getAdminProduct(id));
  } catch (e) {
    return handleError(e);
  }
}

/** PATCH /api/admin/products/[id] — ویرایش فیلدها + واریانت‌ها + تصاویر */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = productUpdateSchema.parse(await readJson(req));
    return ok(await updateAdminProduct(id, body));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE /api/admin/products/[id] — حذف (دارای سفارش → 409) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await deleteAdminProduct(id));
  } catch (e) {
    return handleError(e);
  }
}
