import type { NextRequest } from 'next/server';
import { ApiError, handleError, ok, readJson } from '@/server/lib/api';
import { logAdminAction, requireAdmin } from '@/server/lib/rbac';
import { deleteVariant, updateVariant } from '@/server/services/admin/catalog-admin.service';
import { adminVariantUpdateSchema, idParamSchema } from '@/server/validators/admin/catalog.schema';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/variants/[id] — ویرایش واریانت (قیمت/موجودی/وزن/فعالیت)
 * Expected queries: حداکثر ۵ (خود + تکراری وزن + update + جزئیات)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req);
    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, 'VALIDATION', 'شناسه واریانت نامعتبر است');
    }
    const input = adminVariantUpdateSchema.parse(await readJson(req));
    const product = await updateVariant(id, input);
    await logAdminAction(req, admin, 'VARIANT_UPDATE', {
      variantId: id,
      fields: Object.keys(input),
    });
    return ok(product);
  } catch (e) {
    return handleError(e);
  }
}

/**
 * DELETE /api/admin/variants/[id] — حذف؛ سفارش‌خورده → 409 HAS_REFERENCES
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req);
    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, 'VALIDATION', 'شناسه واریانت نامعتبر است');
    }
    await deleteVariant(id);
    await logAdminAction(req, admin, 'VARIANT_DELETE', { variantId: id });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
