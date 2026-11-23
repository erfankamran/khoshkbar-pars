import type { NextRequest } from 'next/server';
import { ApiError, handleError, ok, readJson } from '@/server/lib/api';
import { logAdminAction, requireAdmin } from '@/server/lib/rbac';
import { deleteImage, updateImage } from '@/server/services/admin/catalog-admin.service';
import { adminImageUpdateSchema, idParamSchema } from '@/server/validators/admin/catalog.schema';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/images/[id] — ویرایش alt/ترتیب/مسیر
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req);
    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, 'VALIDATION', 'شناسه تصویر نامعتبر است');
    }
    const input = adminImageUpdateSchema.parse(await readJson(req));
    const product = await updateImage(id, input);
    await logAdminAction(req, admin, 'IMAGE_UPDATE', { imageId: id });
    return ok(product);
  } catch (e) {
    return handleError(e);
  }
}

/**
 * DELETE /api/admin/images/[id] — حذف رکورد تصویر (فایل فیزیکی دست‌نخورده می‌ماند)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(req);
    const { id } = await params;
    if (!idParamSchema.safeParse(id).success) {
      throw new ApiError(400, 'VALIDATION', 'شناسه تصویر نامعتبر است');
    }
    await deleteImage(id);
    await logAdminAction(req, admin, 'IMAGE_DELETE', { imageId: id });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
