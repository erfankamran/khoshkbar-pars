import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from '@/server/lib/api';
import { db } from '@/lib/db';

/**
 * نگهداری رسانه (فاز ۲ — تصمیم معماری تأییدشده)
 *
 * - فایل‌های آپلودی در «Storage پایدار» خارج از Build Output ذخیره می‌شوند:
 *   <پروژه>/storage/media/<yyyy>/<mm>/<uuid>.<ext>
 *   (نه داخل public و نه .next — پس با هر Build از بین نمی‌رود)
 * - سرو‌شدن فقط از طریق GET /api/media/[...path] انجام می‌شود.
 *
 * امنیت:
 *  - جلوگیری از Path Traversal: هر سگمنت با الگوی سخت‌گیرانه کنترل و مسیر نهایی
 *    نهایی باید داخل ریشهٔ storage/media باشد (resolve + startsWith)
 *  - اعتبارسنجی MIME با «magic bytes» (نه به هدر ادعایی کاربر اعتماد نمی‌کنیم)
 *  - محدودیت حجم (MAX_UPLOAD_BYTES)
 *  - نام‌گذاری امن: UUID تصادفی — نام فایل اصلی کاربر هرگز استفاده نمی‌شود
 *  - پسوند از نوع تشخیص‌داده‌شده می‌آید، نه از نام فایل کاربر
 */

// ——— ریشهٔ ذخیره‌سازی — قابل تغییر با MEDIA_STORAGE_DIR برای استقرارهای خاص ———
export const MEDIA_ROOT =
  process.env.MEDIA_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'media');

/** سقف حجم هر فایل آپلودی: ۵ مگابایت */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** MIMEهای مجاز تصویر — SVG به‌دلیل ریسک XSS عمداً مجاز نیست */
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedMime = (typeof ALLOWED_MIME)[number];

const EXT_BY_MIME: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** MIME برای سرو‌کردن — فقط پسوندهای whitelist پاسخ می‌گیرند */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const EXTENSIONS = new Set(Object.keys(MIME_BY_EXT));

/** الگوی سگمنت امن: فقط حروف/عدد/نقطه/خط تیره/زیرخط — بدون .. و بدون اسلش */
const SAFE_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/**
 * تشخیص نوع واقعی فایل از روی magic bytes — خروجی فقط یکی از MIMEهای مجاز.
 * فایل‌های جعلی با پسوند تصویری که امضای تصویر ندارند → رد.
 */
function sniffImageMime(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // GIF: «GIF87a» یا «GIF89a»
  const head6 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  // WEBP: «RIFF»....«WEBP»
  const head4 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const mid4 = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (head4 === 'RIFF' && mid4 === 'WEBP') return 'image/webp';
  return null;
}

export interface SavedMedia {
  /** مسیر نسبی داخل storage/media — مثل products/2026/11/uuid.png */
  filePath: string;
  /** نشانی عمومی برای نمایش — /api/media/<filePath> */
  url: string;
  mime: AllowedMime;
  bytes: number;
}

// ——— پوشه‌بندی دسته‌محور (درخواست کاربر) ———
// هر نوع محتوا در پوشهٔ خودش ذخیره می‌شود: storage/media/<kind>/<yyyy>/<mm>/<uuid>.<ext>
// ریشهٔ ساختار همان storage/media است — سرو با /api/media/[...path] بدون تغییر کار می‌کند.
export const MEDIA_KINDS = [
  'general',
  'products',
  'banners',
  'categories',
  'stories',
  'brand',
  'content',
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** تبدیل امن ورودی کاربر به kind معتبر — مقدار ناشناخته → general */
export function mediaKindFrom(value: unknown): MediaKind {
  if (
    typeof value === 'string' &&
    (MEDIA_KINDS as readonly string[]).includes(value)
  ) {
    return value as MediaKind;
  }
  return 'general';
}

/**
 * ذخیرهٔ یک فایل تصویری آپلودشده — ورودی File از FormData.
 * هر نقض قانون → ApiError با کد VALIDATION (۴۰۰) یا PAYLOAD_TOO_LARGE (۴۱۳).
 * opts.maxBytes: سقف حجم سفارشی (پیش‌فرض MAX_UPLOAD_BYTES) — آواتار کاربر ۲MB
 */
export async function saveUploadedImage(
  file: File,
  opts?: { maxBytes?: number; kind?: MediaKind }
): Promise<SavedMedia> {
  const maxBytes = opts?.maxBytes ?? MAX_UPLOAD_BYTES;
  // ۱) سقف حجم — قبل از خواندن بایت‌ها
  if (file.size <= 0) {
    throw new ApiError(400, 'VALIDATION', 'فایل خالی است');
  }
  if (file.size > maxBytes) {
    throw new ApiError(
      413,
      'PAYLOAD_TOO_LARGE',
      `حجم فایل بیش از سقف ${Math.floor(maxBytes / (1024 * 1024))} مگابایت است`
    );
  }

  // ۲) خواندن بایت‌ها و تشخیص نوع واقعی (magic bytes — نه MIME ادعایی)
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) {
    throw new ApiError(
      400,
      'VALIDATION',
      'فقط تصاویر JPEG، PNG، WebP و GIF پذیرفته می‌شود'
    );
  }

  // ۳) نام‌گذاری امن: UUID تصادفی + پسوند از نوع واقعی؛ تاریخ برای پارتیشن‌بندی
  //    پوشهٔ دسته‌محور: <kind>/<yyyy>/<mm>/<uuid>.<ext>
  const kind = opts?.kind ?? 'general';
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const fileName = `${randomUUID()}.${EXT_BY_MIME[mime]}`;
  const relativePath = path.join(kind, yyyy, mm, fileName);
  const absolutePath = path.join(MEDIA_ROOT, relativePath);

  // ۴) نوشتن — mkdir recursive پس‌وند تاریخ را در صورت نیاز می‌سازد
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);

  return {
    filePath: relativePath.split(path.sep).join('/'),
    url: `/api/media/${relativePath.split(path.sep).join('/')}`,
    mime,
    bytes: bytes.byteLength,
  };
}

/**
 * تبدیل امن مسیر درخواست (/api/media/<...>) به مسیر فیزیکی داخل MEDIA_ROOT.
 * هر تلاش خروج از ریشه (Path Traversal) → ApiError 400؛ نبودِ پسوند مجاز → 400.
 */
export function resolveMediaPath(segments: string[]): string {
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 8) {
    throw new ApiError(400, 'VALIDATION', 'مسیر رسانه نامعتبر است');
  }
  for (const seg of segments) {
    if (!SAFE_SEGMENT_RE.test(seg) || seg === '.' || seg === '..') {
      throw new ApiError(400, 'VALIDATION', 'مسیر رسانه نامعتبر است');
    }
  }
  const resolved = path.resolve(MEDIA_ROOT, ...segments);
  const rootWithSep = MEDIA_ROOT.endsWith(path.sep) ? MEDIA_ROOT : MEDIA_ROOT + path.sep;
  if (!resolved.startsWith(rootWithSep)) {
    throw new ApiError(400, 'VALIDATION', 'مسیر رسانه نامعتبر است');
  }
  const ext = path.extname(resolved).slice(1).toLowerCase();
  if (!EXTENSIONS.has(ext)) {
    throw new ApiError(400, 'VALIDATION', 'نوع فایل رسانه پشتیبانی نمی‌شود');
  }
  return resolved;
}

/** خواندن فایل رسانه برای سرو‌شدن — نبود فایل → 404 */
export async function readMediaFile(absolutePath: string): Promise<Uint8Array> {
  try {
    const buf = await readFile(absolutePath);
    return new Uint8Array(buf);
  } catch {
    throw new ApiError(404, 'NOT_FOUND', 'رسانه پیدا نشد');
  }
}

/** MIME پاسخ بر اساس پسوند امن (فقط پس از resolveMediaPath صدا زده می‌شود) */
export function mediaMimeForExtension(absolutePath: string): string {
  const ext = path.extname(absolutePath).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** ETag پایدار از محتوا — برای 304 و کش صحیح مرورگر */
export function mediaETag(bytes: Uint8Array): string {
  return `"${createHash('sha1').update(bytes).digest('hex')}"`;
}

// ————————————————————————————————————————————————————————————
// گالری رسانه (درخواست کاربر) — گردآوری و مدیریت تصاویر آپلودشده
// ————————————————————————————————————————————————————————————

/** یک فایل رسانه در گالری */
export interface MediaFile {
  /** نشانی عمومی — /api/media/<kind>/<yyyy>/<mm>/<file> */
  url: string;
  /** مسیر نسبی داخل MEDIA_ROOT */
  filePath: string;
  kind: string;
  mime: string;
  bytes: number;
  /** آخرین تغییر فایل — ISO برای مرتب‌سازی و نمایش */
  mtime: string;
}

/**
 * فهرست همه فایل‌های رسانه از روی دیسک — مرتب بر اساس جدیدترین.
 * ساختار پوشه‌ها: <kind>/<yyyy>/<mm>/<uuid>.<ext> — اسکن بازگشتی با سقف امن.
 */
export async function listMediaFiles(max = 600): Promise<MediaFile[]> {
  const out: MediaFile[] = [];

  async function walk(dir: string, rel: string, depth: number): Promise<void> {
    if (out.length >= max || depth > 5) return;
    // readdir با withFileTypes — خواندن نشده/نبود پوشه → خروجی خالی (گالری خالی)
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
    if (!entries) return;
    for (const e of entries) {
      if (out.length >= max) return;
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(abs, relPath, depth + 1);
      } else {
        const ext = path.extname(e.name).slice(1).toLowerCase();
        if (!EXTENSIONS.has(ext)) continue;
        let st: Awaited<ReturnType<typeof stat>>;
        try {
          st = await stat(abs);
        } catch {
          continue;
        }
        out.push({
          url: `/api/media/${relPath}`,
          filePath: relPath,
          kind: relPath.split('/')[0] ?? 'general',
          mime: MIME_BY_EXT[ext] ?? 'application/octet-stream',
          bytes: st.size,
          mtime: st.mtime.toISOString(),
        });
      }
    }
  }

  await walk(MEDIA_ROOT, '', 0);
  out.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return out.slice(0, max);
}

/**
 * بررسی ارجاع یک نشانی رسانه در جاهایی که URL تصویر ذخیره می‌شود.
 * خروجی: برچسب فارسی بخش‌هایی که این تصویر در آن‌ها در حال استفاده است.
 * (تصاویر صفحات بلوکی هم با LIKE در JSON بلوک‌ها جستجو می‌شوند)
 */
export async function findMediaReferences(url: string): Promise<string[]> {
  const usedIn: string[] = [];

  const [productImages, categories, banners, stories, badges, posts, pages] = await Promise.all([
    db.productImage.count({ where: { url } }),
    db.category.count({ where: { imageUrl: url } }),
    db.banner.count({ where: { imageUrl: url } }),
    db.story.count({ where: { OR: [{ thumbUrl: url }, { mediaUrl: url }] } }),
    db.trustBadge.count({ where: { imageUrl: url } }),
    db.post.count({ where: { coverUrl: url } }),
    db.contentPage.count({ where: { blocks: { contains: url } } }),
  ]);

  if (productImages > 0) usedIn.push(`تصاویر محصولات (${productImages})`);
  if (categories > 0) usedIn.push(`دسته‌بندی‌ها (${categories})`);
  if (banners > 0) usedIn.push(`بنرها (${banners})`);
  if (stories > 0) usedIn.push(`استوری‌ها (${stories})`);
  if (badges > 0) usedIn.push(`نمادهای اعتماد (${badges})`);
  if (posts > 0) usedIn.push(`تصویر شاخص وبلاگ (${posts})`);
  if (pages > 0) usedIn.push(`صفحات بلوکی (${pages})`);

  return usedIn;
}

/**
 * حذف امن فایل رسانه از دیسک — فقط URLهای داخل /api/media/ با سگمنت‌های
 * امن و پسوند whitelist (همان قانون resolveMediaPath) پذیرفته می‌شوند.
 * اگر تصویر جایی در حال استفاده باشد → ApiError 409 با فهرست بخش‌ها.
 */
export async function deleteMediaFile(url: string): Promise<{ deleted: string }> {
  const PREFIX = '/api/media/';
  if (!url.startsWith(PREFIX)) {
    throw new ApiError(400, 'VALIDATION', 'نشانی رسانه نامعتبر است');
  }
  const segments = url.slice(PREFIX.length).split('/').filter(Boolean);
  // resolveMediaPath همان گاردهای path-traversal و پسوند را اجرا می‌کند
  const absolutePath = resolveMediaPath(segments);

  // مسیر resolved باید دقیقاً همان مسیر ساخته‌شده از سگمنت‌ها باشد
  if (path.resolve(absolutePath) !== path.resolve(MEDIA_ROOT, ...segments)) {
    throw new ApiError(400, 'VALIDATION', 'نشانی رسانه نامعتبر است');
  }

  const refs = await findMediaReferences(url);
  if (refs.length > 0) {
    throw new ApiError(
      409,
      'MEDIA_IN_USE',
      `این تصویر در حال استفاده است: ${refs.join('، ')} — ابتدا آن را از این بخش‌ها حذف کنید`
    );
  }

  try {
    await unlink(absolutePath);
  } catch {
    throw new ApiError(404, 'NOT_FOUND', 'فایل روی دیسک پیدا نشد');
  }
  return { deleted: url };
}
