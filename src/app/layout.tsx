import type { Metadata, Viewport } from 'next';
import { Vazirmatn } from 'next/font/google';
import { PwaBootstrap } from '@/components/pwa/PwaBootstrap';
import { ThemeBoot } from '@/components/layout/ThemeBoot';
import { Toaster } from '@/components/ui/sonner';
import { safeJsonLd } from '@/lib/site';
import { getBrandTheme } from '@/server/services/content.service';
import './globals.css';

// فونت فارسی وزیرمتن — متغیر (Variable) با پشتیبانی کامل فارسی
const vazirmatn = Vazirmatn({
  subsets: ['arabic', 'latin'],
  variable: '--font-vazirmatn',
  display: 'swap',
});

// fallback فقط وقتی .env مقدار نداشته باشد (مثلاً بازنویسی بوت پلتفرم) —
// دامنهٔ رسمی تولید https://souffle.space-z.ai تا canonical/OG همیشه درست بمانند
const FALLBACK_URL = 'https://souffle.space-z.ai';

/**
 * متادیتای پویا (فاز ۲) — نام و توضیح برند از تنظیمات پنل (جدول Setting،
 * namespace برند) خوانده می‌شود؛ پیش‌فرض‌ها همان ثابت‌های قبلی هستند تا
 * اگر پنل هنوز چیزی ذخیره نکرده باشد، سئو دست‌نخورده می‌ماند.
 */
export async function generateMetadata(): Promise<Metadata> {
  let brandName = 'پارس';
  let brandFullName = 'فروشگاه پارس';
  let brandDescription =
    'خرید آنلاین خشکبار، آجیل، مغزها و محصولات طبیعی — تازه از مزرعه تا سفره شما';
  let logoUrl = '/icons/icon-512.png';
  try {
    const brand = await getBrandTheme();
    brandName = brand.name || brandName;
    brandFullName = brand.fullName || brandFullName;
    brandDescription = brand.description || brandDescription;
    logoUrl = brand.logoUrl || logoUrl;
  } catch {
    // دیتابیس در دسترس نیست → پیش‌فرض‌ها (ساخت و prerender نباید بشکند)
  }

  // دامنهٔ رسمی تولید: https://souffle.space-z.ai — مقدار در زمان کامپایل داخل
  // باندل قفل می‌شود؛ تغییر آن = ویرایش .env + کامیت + کامپایل مجدد (کامیت a0c7f08).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_URL;
  const logoAbsolute = logoUrl.startsWith('http') ? logoUrl : `${siteUrl}${logoUrl}`;
  const fullTitle = `${brandName} | فروشگاه خشکبار و آجیل`;

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: fullTitle,
      template: `%s | ${brandName}`,
    },
    description: brandDescription,
    keywords: ['خشکبار', 'آجیل', 'پسته', 'بادام', 'گردو', 'فروشگاه آنلاین خشکبار'],
    applicationName: brandName,
    alternates: { canonical: '/' },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'fa_IR',
      siteName: brandFullName,
      title: fullTitle,
      description: brandDescription,
      images: [
        {
          url: logoAbsolute,
          width: 512,
          height: 512,
          alt: `${brandFullName} — خشکبار و مغزهای تازه`,
        },
      ],
    },
    twitter: {
      card: 'summary',
      title: fullTitle,
      description: brandDescription,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: brandName,
    },
    formatDetection: { telephone: false },
    icons: {
      icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d3a27',
};

/** داده ساختاریافته سازمان — صفحه اصلی و همه صفحات (سئو) — فاز ۲: برند پویا */
async function organizationJsonLd() {
  const brand = await getBrandTheme();
  // همان دامنهٔ رسمی تولید — JSON-LD هم باید آدرس مطلق درست بدهد
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_URL;
  const logoAbsolute = brand.logoUrl
    ? brand.logoUrl.startsWith('http')
      ? brand.logoUrl
      : `${siteUrl}${brand.logoUrl}`
    : `${siteUrl}/icons/icon-512.png`;
  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: brand.fullName,
    alternateName: brand.name,
    description: brand.description,
    slogan: brand.slogan,
    url: siteUrl,
    logo: logoAbsolute,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // خطای دیتابیس نباید کل فروشگاه را بخواباند — پیش‌فرض ثابت می‌ماند
  let jsonLd: Record<string, unknown> | null = null;
  try {
    jsonLd = await organizationJsonLd();
  } catch {
    jsonLd = null;
  }

  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="antialiased">
        {jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
          />
        )}
        {children}
        {/* فاز ۲ — اعمال برند/تم پنل روی متغیرهای CSS (بدون رفرش) */}
        <ThemeBoot />
        <PwaBootstrap />
        <Toaster position="top-center" dir="rtl" />
      </body>
    </html>
  );
}
