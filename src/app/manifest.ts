import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** مانیفست PWA — نصب فروشگاه روی صفحه اصلی موبایل (بخش ۱۰.۴ مشخصات)
 *
 * اسکرین اسپلش اندروید (صفحه اجرای اپ نصب‌شده) از background_color و نام
 * همین مانیفست ساخته می‌شود — پس رنگ‌ها از تنظیمات پنل خوانده می‌شوند
 * (splash.backgroundColor + theme.primary) تا با اسپلش داخل اپلیکیشن یکدست بماند.
 * خطای دیتابیس هرگز نصب را نشکند — پیش‌فرض پالت پارس برمی‌گردد.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let backgroundColor = '#06241a';
  let themeColor = '#0d3a27';

  try {
    const rows = await db.setting.findMany({
      where: { key: { in: ['splash.backgroundColor', 'theme.primary'] } },
      select: { key: true, value: true },
    });
    for (const row of rows) {
      const value = row.value.trim().toLowerCase();
      if (!HEX_RE.test(value)) continue;
      if (row.key === 'splash.backgroundColor') backgroundColor = value;
      if (row.key === 'theme.primary') themeColor = value;
    }
  } catch {
    // بدون تنظیمات → پیش‌فرض پالت پارس
  }

  return {
    name: 'فروشگاه پارس | خشکبار و آجیل',
    short_name: 'پارس',
    description:
      'خرید آنلاین خشکبار، آجیل، مغزها و محصولات طبیعی — تازه از مزرعه تا سفره شما',
    id: '/',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    dir: 'rtl',
    lang: 'fa',
    background_color: backgroundColor,
    theme_color: themeColor,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
