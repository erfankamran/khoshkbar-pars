'use client';

import { motion } from 'framer-motion';
import { LogoMark } from '@/components/shared/Logo';
import { BRAND } from '@/lib/config';
import { useSettingsStore } from '@/stores/settings-store';

/** فقط HEX شش‌رقمی معتبر به‌صورت inline-style می‌نشیند */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Splash Screen اختصاصی پارس (بخش ۸ مشخصات) + تنظیمات پنل مدیریت
 * - لوگو، پس‌زمینه، عنوان و شعار از تنظیمات «اسکرین اسپلش» خوانده می‌شود
 *   (خالی/نامعتبر = رفتار پیش‌فرض پارس)
 * - المان گرافیکی خشکبار (دانه‌های شناور) همیشه حفظ می‌شود
 *
 * نکته شفاف: بررسی نشست کاربر (ورود خودکار با نشست معتبر) در فاز ۹
 * (احراز هویت) به همین کامپوننت اضافه می‌شود. خطای شبکه هرگز باعث
 * ماندگاری Splash نمی‌شود — تایمر حداکثر زمان را تضمین می‌کند.
 */
export function SplashScreen() {
  const splash = useSettingsStore((s) => s.splash);
  const brand = useSettingsStore((s) => s.brand);

  const bg = splash && HEX_RE.test(splash.backgroundColor) ? splash.backgroundColor : '';
  const logoUrl = splash?.logoUrl ?? '';
  const title = splash?.title?.trim() || brand?.name || BRAND.name;
  const slogan = splash?.slogan?.trim() || brand?.slogan || BRAND.slogan;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-brand-950"
      style={bg ? { backgroundColor: bg } : undefined}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
      role="status"
      aria-label="در حال بارگذاری فروشگاه پارس"
    >
      {/* هاله‌های نورانی پس‌زمینه */}
      <div
        className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl"
        aria-hidden
      />
      <div
        className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-gold-500/15 blur-3xl"
        aria-hidden
      />

      {/* دانه‌های شناور — المان گرافیکی خشکبار */}
      <motion.div
        className="absolute right-[16%] top-[24%] h-2.5 w-2.5 rounded-full bg-gold-400/70"
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
      <motion.div
        className="absolute left-[20%] top-[34%] h-2 w-2 rounded-full bg-brand-400/70"
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
      <motion.div
        className="absolute bottom-[26%] right-[26%] h-1.5 w-1.5 rounded-full bg-gold-300/60"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
      <motion.div
        className="absolute bottom-[34%] left-[14%] h-1.5 w-1.5 rounded-full bg-cream-300/50"
        animate={{ y: [0, 9, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />

      {/* لوگو — تنظیمات اسپلش: تصویر آپلودی یا نشان پیش‌فرض */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.1 }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="لوگوی فروشگاه"
            width={92}
            height={92}
            className="h-[92px] w-[92px] rounded-[1.4rem] object-cover drop-shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          />
        ) : (
          <LogoMark
            size={92}
            className="drop-shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          />
        )}
      </motion.div>

      {/* نام برند — متن اختصاصی اسپلش یا نام برند (p نه h1 — صفحهٔ اصلی فقط یک h1 در بلاک سئو دارد) */}
      <motion.p
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.5, ease: 'easeOut' }}
        className="mt-5 text-4xl font-black text-cream-50"
      >
        {title}
      </motion.p>

      {/* شعار — متن اختصاصی اسپلش یا شعار برند */}
      <motion.p
        initial={{ y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.55, duration: 0.5, ease: 'easeOut' }}
        className="mt-2 text-sm text-gold-300"
      >
        {slogan}
      </motion.p>

      {/* نوار پیشرفت ظریف */}
      <motion.div
        className="absolute bottom-16 h-1 w-28 overflow-hidden rounded-full bg-white/10"
        aria-hidden
      >
        <motion.div
          className="h-full w-full rounded-full bg-gold-400"
          initial={{ x: '100%' }}
          animate={{ x: '-100%' }}
          transition={{ duration: 1.7, ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.div>
  );
}
