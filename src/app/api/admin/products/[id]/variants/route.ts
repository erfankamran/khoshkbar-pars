import type { NextRequest } from 'next/server';
import { ApiError, handleError, ok, readJson } from '@/server/lib/api';
import { logAdminAction, requireAdmin } from '@/server/lib/rbac';
import { createVariant } from '@/server/services/admin/catalog-admin.service';
import { adminVariantCreateSchema, idParamSchema } from '@/server/validators/admin/catalog.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/products/[id]/variants — افزودن واریانت وزنی
 * تکراری بودن وزن → 409 WEIGHT_EXISTS
 * Expected queries: ۴ (محصول + تکراری + create + جزئیات)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin(req);
    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, 'VALIDATION', 'شناسه محصول نامعتبر است');
    }
    const input = adminVariantCreateSchema.parse(await readJson(req));
    const product = await createVariant(id, input);
    await logAdminAction(req, admin, 'VARIANT_CREATE', {
      productId: id,
      weightGrams: input.weightGrams,
    });
    return ok(product);
  } catch (e) {
    return handleError(e);
  }
}
