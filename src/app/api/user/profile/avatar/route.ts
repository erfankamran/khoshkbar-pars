import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/lib/rbac';
import { uploadMyAvatar } from '@/server/services/user.service';
import { ApiError, handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/user/profile/avatar — آپلود تصویر پروفایل (multipart/form-data, فیلد file)
 * همان زیرساخت رسانهٔ امن: magic bytes + UUID + سقف ۲ مگابایت + ذخیره در storage/media
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, 'VALIDATION', 'بدنه درخواست باید multipart/form-data باشد');
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new ApiError(400, 'VALIDATION', 'فیلد «file» با تصویر ارسال نشده است');
    }

    return ok(await uploadMyAvatar(user.id, file, req));
  } catch (e) {
    return handleError(e);
  }
}
