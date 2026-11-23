import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import {
  deleteMediaFile,
  listMediaFiles,
  mediaKindFrom,
  saveUploadedImage,
} from '@/server/services/media.service';
import { ApiError, handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/media — گالری رسانه (درخواست کاربر): فهرست همه تصاویر آپلودشده
 * اسکن پوشهٔ storage/media — مرتب بر اساس جدیدترین — فقط مدیر
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok({ files: await listMediaFiles() });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * POST /api/admin/media — آپلود تصویر (فقط مدیر)
 *
 * ورودی: multipart/form-data
 *  - file: تصویر (اجباری)
 *  - kind: پوشهٔ دسته‌محور اختیاری — products | banners | categories |
 *          stories | brand | content (پیش‌فرض general)
 * خروجی: { media: { filePath, url, mime, bytes } } — url برای نمایش:
 *   /api/media/<kind>/<yyyy>/<mm>/<uuid>.<ext>
 *
 * امنیت: requireAdmin + سقف حجم + تشخیص MIME از magic bytes + نام UUID امن.
 * فایل‌های آپلودی در Storage پایدار (خارج از Build Output) با پوشه‌بندی مرتب
 * ذخیره می‌شوند: storage/media/<kind>/<سال>/<ماه>/
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

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

    // پوشهٔ دسته‌محور — مقدار ناشناخته امن به general برمی‌گردد
    const kind = mediaKindFrom(form.get('kind'));
    const media = await saveUploadedImage(file, { kind });
    return ok({ media });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * DELETE /api/admin/media?url=/api/media/... — حذف فایل از گالری (فقط مدیر)
 * اگر تصویر در محصولات/بنرها/دسته‌ها/استوری/وبلاگ/صفحات بلوکی در حال
 * استفاده باشد → 409 با فهرست بخش‌ها (حذف ناامن مسدود است)
 */
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url).searchParams.get('url');
    if (!url) {
      throw new ApiError(400, 'VALIDATION', 'پارامتر «url» الزامی است');
    }
    return ok(await deleteMediaFile(url));
  } catch (e) {
    return handleError(e);
  }
}
