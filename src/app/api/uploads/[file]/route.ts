import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * GET /uploads/[file] — سرو تصویرهای آپلودشده در محیط تولید (فاز ۱۲)
 *
 * چرا؟ در build استاندارد Next، محتوای public/ هنگام build کپی می‌شود؛
 * فایل‌هایی که «بعد از استقرار» آپلود می‌شوند در خروجی standalone نیستند
 * و ۴۰۴ می‌خورند (در dev چون public/ زنده سرو می‌شود مشکلی نیست).
 * این هندلر پشتیبان، فایل را مستقیم از uploads/ (خارج از public) می‌خواند.
 *
 * امنیت:
 * - نام فایل باید دقیقاً الگوی تولیدی upload route باشد
 *   (<base36>-<16hex>.png|jpg|webp) → مسیر تراaversal و فایل دلخواه ممکن نیست
 * - Content-Type فقط از پسوند whitelist داخل الگو — هرگز از ورودی کلاینت
 * - کش پایدار (نام‌ها یکتا هستند)
 */

const NAME_RE = /^[a-z0-9]+-[a-f0-9]{16}\.(png|jpg|webp)$/;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;

// حتماً در زمان درخواست اجرا شود — بدون این، هندلر استاتیک فرض شده و
// برای مسیرهای بدون prerender صفحهٔ ۴۰۴ از پیش رندرشده برمی‌گردد
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (!NAME_RE.test(file)) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const buf = await readFile(path.join(process.cwd(), 'uploads', file));
    const ext = file.split('.').pop() as keyof typeof TYPES;
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': TYPES[ext],
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-pars-uploads': 'route',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
