'use client';

import { useEffect } from 'react';
import { Headset, Search, ShoppingCart } from 'lucide-react';
import { LogoMark } from '@/components/shared/Logo';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { BRAND } from '@/lib/config';
import { toFaDigits } from '@/lib/fa';
import { useCartStore, selectCartCount } from '@/stores/cart-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useRouterStore } from '@/stores/router-store';

/**
 * هدر اصلی پارس (بخش ۴.۱ مشخصات)
 * - ردیف ۱: لوگو + زنگوله اعلان‌ها + پیام برند + پشتیبانی + سبد خرید
 * - ردیف ۲: جستجو
 * - زنگوله اعلان‌ها (درخواست کاربر): بالا سمت راست کنار لوگو — رویدادهای
 *   سفارش/سبد/پرداخت برای مشتری و مدیر + دایرهٔ قرمز خوانده‌نشده
 * - انتخابگر آدرس تحویل حذف شد (درخواست کاربر) → چیپ شماره پشتیبانی
 *   از تنظیمات پنل (supportPhone) با تماس یک‌لمسی (tel:)
 * هدر خارج از ناحیه اسکرول قرار دارد و همیشه در دسترس است (Sticky واقعی).
 */

/** تبدیل شماره فارسی/فرمت‌دار به tel: استاندارد — ۰۲۱-۹۱۰۰۰۰۰۰ → tel:+9821910000000 */
function toTelHref(raw: string): string {
  const digits = raw.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return `tel:${digits}`;
  if (digits.startsWith('98')) return `tel:+${digits}`;
  if (digits.startsWith('0')) return `tel:+98${digits.slice(1)}`;
  return `tel:${digits}`;
}

export function Header() {
  const push = useRouterStore((s) => s.push);
  const cartCount = useCartStore(selectCartCount);
  // فاز ۲ — برند از تنظیمات پنل؛ تا رسیدن پاسخ، پیش‌فرض ثابت‌های BRAND
  const brand = useSettingsStore((s) => s.brand);
  const supportPhone = useSettingsStore((s) => s.supportPhone);
  const loadSettings = useSettingsStore((s) => s.load);
  const brandName = brand?.name || BRAND.name;
  const brandTagline = brand?.tagline || BRAND.tagline;
  const brandLogoUrl = brand?.logoUrl || '';

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <header className="relative z-20 shrink-0 bg-brand-900 pt-safe text-white">
      {/* نوار طلایی ظریف — امضای بصری برند */}
      <div
        className="h-0.5 w-full bg-gradient-to-l from-gold-500/0 via-gold-400/70 to-gold-500/0"
        aria-hidden
      />

      <div className="flex items-center gap-2.5 px-4 pb-2 pt-3">
        {brandLogoUrl ? (
          <img
            src={brandLogoUrl}
            alt={brandName}
            width={38}
            height={38}
            className="h-[38px] w-[38px] shrink-0 rounded-[17px] object-cover"
          />
        ) : (
          <LogoMark size={38} />
        )}
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-lg font-black tracking-tight">
            {brandName}
          </span>
          <span className="truncate text-[10px] text-brand-200">
            {brandTagline}
          </span>
        </div>

        {/* زنگوله اعلان‌ها — بالا سمت راست، کنار لوگو (درخواست کاربر) */}
        <NotificationBell variant="shop" />

        <div className="flex-1" />

        {/* شماره پشتیبانی — تماس یک‌لمسی از تنظیمات پنل (درخواست کاربر) */}
        {supportPhone && (
          <a
            href={toTelHref(supportPhone)}
            className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 transition-colors active:bg-white/20"
            aria-label={`تماس با پشتیبانی ${supportPhone}`}
            title="تماس با پشتیبانی"
          >
            <Headset className="h-3.5 w-3.5 shrink-0 text-gold-300" aria-hidden />
            <span className="text-[11px] font-bold tracking-wide text-brand-50" dir="ltr">
              {supportPhone}
            </span>
          </a>
        )}

        {/* سبد خرید با بج تعداد اقلام */}
        <button
          type="button"
          onClick={() => push({ view: 'cart' })}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors active:bg-white/20"
          aria-label={`سبد خرید${cartCount > 0 ? ` — ${toFaDigits(cartCount)} قلم` : ''}`}
        >
          <ShoppingCart className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          {cartCount > 0 && (
            <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-black leading-none text-brand-950">
              {toFaDigits(cartCount)}
            </span>
          )}
        </button>
      </div>

      {/* جستجو — صفحه جستجوی زنده با Debounce در فاز ۷ فعال می‌شود */}
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={() => push({ view: 'search' })}
          className="flex h-11 w-full items-center gap-2.5 rounded-2xl bg-white px-4 text-right shadow-card transition-transform active:scale-[0.99]"
          aria-label="جستجو در محصولات"
        >
          <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          <span className="text-[13px] text-ink-400">
            جستجو در محصولات {brandName}…
          </span>
        </button>
      </div>
    </header>
  );
}
