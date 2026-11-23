import type { Metadata } from 'next';
import '../globals.css';

/**
 * پنل مدیریت پارس (فاز ۱۱) — سطح جداگانه از فروشگاه
 *
 * - احراز هویت: همان نشست OTP (کوکی pars_session یا فال‌بک هدر x-pars-session)
 * - مجوز: هر endpoint ادمین سمت سرور با requireAdmin بررسی می‌شود —
 *   این layout فقط پوسته UI است و مرز امنیتی نیست (قانون بخش ۱۵)
 * - مسیر /admin خارج از AppShell موبایلی فروشگاه سرو می‌شود؛
 *   طراحی دسکتاپ‌محور با Sidebar، ولی کاملاً ریسپانسیو
 */
export const metadata: Metadata = {
  title: 'پنل مدیریت',
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-screen bg-cream-50">{children}</div>;
}
