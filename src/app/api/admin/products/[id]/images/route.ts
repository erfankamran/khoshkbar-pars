import type { NextRequest } from 'next/server';
import { ApiError, handleError, ok, readJson } from '@/server/lib/api';
import { logAdminAction, requireAdmin } from '@/server/lib/rbac';
import { createImage } from '@/server/services/admin/catalog-admin.service';
import { adminImageCreateSchema, idParamSchema } from '@/server/validators/admin/catalog.schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/products/[id]/images — افزودن تصویر (مسیر نسبی از /public)
 * فایل فیزیکی باید موجود باشد → در غیر این صورت 400 IMAGE_NOT_FOUND
 * Expected queries: ۳ (محصول + existsSync محلی + create + جزئیات)
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
    const input = adminImageCreateSchema.parse(await readJson(req));
    const product = await createImage(id, input);
    await logAdminAction(req, admin, 'IMAGE_CREATE', {
      productId: id,
      url: input.url,
    });
    return ok(product);
  } catch (e) {
    return handleError(e);
  }
}
