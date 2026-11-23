import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  mediaETag,
  mediaMimeForExtension,
  readMediaFile,
  resolveMediaPath,
} from '@/server/services/media.service';
import { handleError } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/media/[...path] — سرو تصاویر آپلودی (عمومی؛ فقط GET)
 *
 * امنیت:
 *  - Path Traversal مسدود است (کنترل سگمنت + startsWith ریشهٔ storage/media)
 *  - فقط پسوندهای تصویری whitelist پاسخ می‌گیرند (بدون HTML/SVG → بدون XSS)
 *  - Content-Type از پسوند امن می‌آید + X-Content-Type-Options: nosniff
 *
 * کش صحیح: نام فایل UUID است و محتوایش هرگز تغییر نمی‌کند →
 *   Cache-Control immutable یک‌ساله + ETag با پاسخ 304 برای If-None-Match
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await ctx.params;
    const absolutePath = resolveMediaPath(segments ?? []);
    const bytes = await readMediaFile(absolutePath);
    const etag = mediaETag(bytes);

    // If-None-Match → فایل تغییر نکرده؛ 304 بدون بدنه (صرفه‌جویی پهنای باند)
    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch.split(',').map((s) => s.trim()).includes(etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    return new NextResponse(bytes as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mediaMimeForExtension(absolutePath),
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
