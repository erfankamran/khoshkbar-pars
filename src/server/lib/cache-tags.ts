import { revalidateTag } from 'next/cache';
// Separate local/test databases and the new pricing DTO from earlier cache contents.
export const STORE_CACHE_SCOPE = `partners-per-kg-v1:${process.env.DATABASE_URL ?? 'default'}`;

/**
 * برچسب‌های کش لایه خواندن (بازبینی پرفورمنس)
 *
 * خواننده‌های عمومی (/api/home، /api/content، برند لِی‌اوت، فیدها) با
 * unstable_cache کش می‌شوند و هر mutation ادمین همین‌جا برچسب را باطل می‌کند؛
 * بنابراین پنل ادمین بدون تأخیر در فروشگاه منعکس می‌شود و بین تغییرها
 * هیچ کوئری اضافه‌ای اجرا نمی‌شود. revalidate کوتاه فقط تور ایمنی است.
 */
export const CACHE_TAGS = {
  /** بخش‌های صفحه اصلی: بنر، استوری، دسته‌ها، ۴ بخش محصول (salesCount واریانت‌ها) */
  HOME: 'home',
  /** محتوای مستقل: FAQ، تماس، نمادها، لینک‌های فوتر */
  CONTENT: 'content',
  /** فیدهای ترب/ایمالز (قیمت، موجودی، عنوان‌ها) */
  FEED: 'feed',
  /** نام/لوگو/رنگ برند — مصرف در generateMetadata و JSON-LD ریشه */
  BRAND: 'brand-theme',
  /** پست‌های بلاگ (درخواست کاربر) — فهرست و جزئیات عمومی */
  BLOG: 'blog',
} as const;

/**
 * ابطال برچسب‌ها — در mutation سرویس‌ها صدا زده می‌شود (همیشه داخل context
 * یک Route Handler اجرا می‌شود). برای ابطالِ پیش از نوشتن هم بی‌خطر است:
 * فقط یک بازسازی کش اضافه اگر نوشته شکست بخورد.
 */
export function revalidateStoreCache(...tags: Array<(typeof CACHE_TAGS)[keyof typeof CACHE_TAGS]>): void {
  for (const tag of tags) {
    try {
      // expire: 0 → نسخهٔ کهنه بلافاصله باطل می‌شود (خواندن پس از نوشتن، بدون تأخیر)
      revalidateTag(tag, { expire: 0 });
    } catch {
      // خارج از context درخواست (مثلاً اسکریپت seed) — کشی برای ابطال نیست
    }
  }
}
