'use client';

import { PartnerRequestCard } from '@/components/account/PartnerRequestCard';

import {
  Bell,
  ChevronLeft,
  CircleHelp,
  Heart,
  Info,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { InstallAppCard } from '@/components/pwa/InstallAppCard';
import { formatPhoneFa } from '@/lib/phone';
import { useAuthStore } from '@/stores/auth-store';
import { useRouterStore, type ViewName } from '@/stores/router-store';

/**
 * حساب کاربری (فاز ۹ و ۱۰) — دو حالت مهمان / واردشده
 *
 * - واردشده: نام و شماره موبایل، سفارش‌های من (فعال)، خروج
 * - آدرس‌های من: فاز ۱۰ — دفترچه کامل AddressesView
 * - تنظیمات اعلان‌ها: فاز ۱۰ — نمای کامل NotificationSettingsView
 */

const ACCOUNT_ROWS: Array<{
  icon: typeof Package;
  label: string;
  view?: ViewName;
  phaseNote?: string;
}> = [
  { icon: Package, label: 'سفارش‌های من', view: 'orders' },
  { icon: MapPin, label: 'آدرس‌های من', view: 'addresses' },
  { icon: Heart, label: 'علاقه‌مندی‌ها', view: 'favorites' },
  // فاز پروفایل — حساب کاربری من + امنیت حساب
  { icon: UserRound, label: 'حساب کاربری من', view: 'profile' },
  { icon: ShieldCheck, label: 'امنیت حساب', view: 'security' },
  { icon: Bell, label: 'تنظیمات اعلان‌ها', view: 'notificationSettings' },
  // فاز ۳ — محتوای مستقل فروشگاه
  { icon: CircleHelp, label: 'پرسش‌های متداول', view: 'faq' },
  { icon: Info, label: 'دربارهٔ پارس', view: 'about' },
];

export function AccountView() {
  const push = useRouterStore((s) => s.push);
  // ناوبری App Router به مسیر مستقل /admin (پنل مدیریت خارج از MobileFrame است)
  const nextRouter = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('از حساب خود خارج شدید');
    } catch {
      toast.error('خروج ناموفق بود — دوباره تلاش کنید');
    }
  };

  return (
    <div className="min-h-full px-4 pb-8 pt-5">
      <h1 className="pb-4 text-lg font-black text-ink-900">حساب کاربری</h1>

      {/* ——— کارت کاربر ——— */}
      {user ? (
        <div className="flex items-center gap-3.5 rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
          {/* فاز آواتار — شخصیت پارس یا حرف اول نام */}
          {user.avatarUrl ? (
             
            <img
              src={user.avatarUrl}
              alt="آواتار من"
              className="h-14 w-14 shrink-0 rounded-full border border-cream-200 bg-cream-50 object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-500 text-lg font-black text-white">
              {(user.fullName ?? user.phone).trim().charAt(0)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold text-ink-900">
              {/* فاز پروفایل — نام شخصی کاربر؛ بدون نام → «کاربر جدید» (هرگز نام فروشگاه) */}
              {user.fullName ?? 'کاربر جدید'}
            </p>
            <p className="mt-0.5 text-xs font-bold text-ink-500" dir="ltr">
              {formatPhoneFa(user.phone)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex h-9 items-center gap-1.5 rounded-2xl bg-red-50 px-3.5 text-xs font-black text-red-600 transition-transform active:scale-95"
            aria-label="خروج از حساب کاربری"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            خروج
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3.5 rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <UserRound className="h-7 w-7" strokeWidth={1.6} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold text-ink-900">
              {hydrated ? 'کاربر مهمان' : 'در حال بارگذاری…'}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              برای تجربه کامل خرید، وارد حساب خود شوید
            </p>
          </div>
          <button
            type="button"
            onClick={() => push({ view: 'login', key: 'login' })}
            className="flex h-9 items-center gap-1.5 rounded-2xl bg-brand-500 px-4 text-xs font-black text-white transition-transform active:scale-95"
          >
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            ورود | ثبت‌نام
          </button>
        </div>
      )}

      {/* ——— ورود به داشبورد مدیریت — فقط کاربر با نقش ADMIN (درخواست کاربر) ——— */}
      {user?.role === 'ADMIN' && (
        <button
          type="button"
          onClick={() => nextRouter.push('/admin')}
          aria-label="ورود به داشبورد مدیریت"
          className="mt-3 flex w-full items-center gap-3 rounded-3xl bg-brand-900 p-4 text-white shadow-card transition-transform active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <LayoutDashboard className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-start">
            <span className="block text-[13.5px] font-black">ورود به داشبورد</span>
            <span className="mt-0.5 block text-[10.5px] leading-4 text-brand-100">
              مدیریت سفارش‌ها، محصولات و تنظیمات فروشگاه
            </span>
          </span>
          <ChevronLeft className="h-4 w-4 shrink-0 text-brand-100" aria-hidden />
        </button>
      )}

      {user && <PartnerRequestCard />}
      {/* ——— ردیف‌های حساب ——— */}
      <ul className="mt-4 overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-card">
        {ACCOUNT_ROWS.map((row) => (
          <li key={row.label}>
            <button
              type="button"
              onClick={() => {
                if (row.view) {
                  push({ view: row.view, key: row.view });
                } else {
                  toast.info(`«${row.label}» — ${row.phaseNote}`);
                }
              }}
              className="flex w-full items-center gap-3 border-b border-cream-100 px-4 py-3.5 text-right last:border-b-0 transition-colors active:bg-cream-50"
            >
              <row.icon
                className="h-5 w-5 shrink-0 text-brand-600"
                strokeWidth={1.7}
                aria-hidden
              />
              <span className="flex-1 text-[13px] font-bold text-ink-800">
                {row.label}
              </span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-ink-300" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      {/* ——— نصب اپلیکیشن (PWA — فاز ۹) ——— */}
      <InstallAppCard />

      <p className="mt-6 text-center text-[11px] leading-5 text-ink-400">
        فروشگاه پارس — ورود امن با شماره موبایل (کد یک‌بارمصرف)
        <br />
        نشست شما در کوکی رمزنگاری‌شده HttpOnly نگه‌داری می‌شود
      </p>
    </div>
  );
}
