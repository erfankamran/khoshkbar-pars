/**
 * ابزارهای URL سایت (فاز ۱۳ — سئو و فیدهای مقایسه قیمت)
 *
 * قانون: آدرس مطلق از هدرهای خود درخواست ساخته می‌شود تا در هر محیطی
 * (localhost / پیش‌نمایش / دامنه نهایی) بدون تنظیم اضافه درست کار کند؛
 * فید ترب و ایمالز و sitemap همیشه آدرس‌های مطلق صحیح می‌دهند.
 * NEXT_PUBLIC_SITE_URL فقط fallback گزینه‌ای برای metadataBase است.
 */

/**
 * ساخت آدرس پایه سایت از هدرها.
 * - x-forwarded-host / x-forwarded-proto در پراکسی‌ها (پیش‌نمایش، Nginx، Caddy)
 * - در localhost پروتکل http و غیر از آن https فرض می‌شود.
 */
export function baseUrlFromHeaders(h: Headers): string {
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const fwdProto = h.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto =
    fwdProto ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** ساخت آدرس مطلق از مسیر نسبی — path باید با «/» شروع شود */
export function absoluteUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * سریال‌سازی امن JSON-LD برای <script type="application/ld+json">.
 * JSON.stringify کاراکتر «<» را escape نمی‌کند؛ پس متنی که «</script>» دارد
 * (عنوان/توضیح محصول یا پست وبلاگ از پنل ادمین) تگ اسکریپت را می‌بندد و
 * تزریق ممکن می‌شود. استاندارد سخت‌سازی: تبدیل همهٔ «<» به «\u003c» —
 * خروجی از نظر JSON هم‌ارزش است و خواندن آن توسط کراولر تغییری نمی‌کند.
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * تبدیل تاریخ به ISO 8601 با آفست تهران (+03:30) — طبق مستند فید ترب که
 * «ISO 8601 با منطقه زمانی» می‌خواهد و +03:30 استاندارد ایران است.
 */
export function toTehranISO(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const shifted = new Date(date.getTime() + 3.5 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d+Z$/, '+03:30');
}
