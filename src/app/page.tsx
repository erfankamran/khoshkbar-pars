import { AppShell } from '@/components/layout/AppShell';

/**
 * نقطه ورود فروشگاه پارس
 * - قاب اپلیکیشنی SPA (نمای کلاینت داخل اسکرول داخلی)
 * - بلاک SSR انتهای صفحه (HomeCrawlSection) با درخواست کاربر حذف شد —
 *   صفحه بعد از منوی پایین موبایل دیگر ادامه و اسکرول ندارد.
 *   سئو همچنان از صفحات مستقل SSR (/c/[slug]، /p/[slug]، /blog، /faq) پوشش داده می‌شود.
 */
export default function Page() {
  return <AppShell />;
}
