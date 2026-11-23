'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  BellRing,
  Check,
  Download,
  Loader2,
  Share,
  Smartphone,
  SquarePlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { subscribeToPush } from '@/lib/push-client';
import { usePwaStore } from '@/stores/pwa-store';

/**
 * بنرهای پایدار PWA (درخواست کاربر)
 *
 * - بنر «نصب اپلیکیشن» پایین: همواره نمایش داده می‌شود تا وقتی اپ روی گوشی
 *   نصب نشده است (standalone). بدون دکمه بستن — مطابق درخواست.
 * - بنر «مجوز اعلان‌ها» بالا: همواره نمایش داده می‌شود تا وقتی کاربر مجوز را
 *   فعال نکرده است. اگر مرورگر مجوز را رد کرده باشد، امکان درخواست مجدد
 *   وجود ندارد و بنر پنهان می‌شود (محدودیت مرورگر، نه انتخاب ما).
 * - هر دو بنر بیرون ناحیه اسکرول رندر می‌شوند تا همیشه در دسترس باشند.
 */

// ————————————————————————————————————————————————
// بنر مجوز اعلان‌ها — بالا
// ————————————————————————————————————————————————
export function NotificationBanner() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setSupported('serviceWorker' in navigator && 'PushManager' in window);
    setPermission(Notification.permission);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      await subscribeToPush();
      setPermission(Notification.permission);
      toast.success('اعلان‌های پارس فعال شد — از تخفیف‌ها جا نمی‌مانید');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'PERMISSION_DENIED') {
        setPermission('denied');
        toast.error('مجوز اعلان‌ها رد شد — از تنظیمات مرورگر می‌توانید فعال کنید');
      } else if (msg === 'PUSH_NOT_CONFIGURED') {
        toast.error('سرویس اعلان‌ها هنوز پیکربندی نشده است');
      } else {
        toast.error('فعال‌سازی اعلان‌ها ناموفق بود — بعداً تلاش کنید');
      }
    } finally {
      setBusy(false);
    }
  };

  const show =
    supported && permission === 'default' && typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches === false;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="notif-banner"
          className="relative z-10 shrink-0 border-b border-gold-200 bg-gradient-to-l from-gold-50 via-cream-50 to-gold-50"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex items-center gap-2.5 px-4 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-brand-800">
              <Bell className="h-4 w-4" aria-hidden />
            </span>
            <p className="min-w-0 flex-1 text-[11px] leading-4 text-ink-700">
              <span className="font-black text-ink-900">اعلان‌ها را فعال کنید</span>
              {' '}— تا از وضعیت سفارش‌ها و تخفیف‌های ویژه باخبر شوید
            </p>
            <button
              type="button"
              onClick={() => void enable()}
              disabled={busy}
              className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-brand-600 px-3 text-[11px] font-black text-white transition-transform active:scale-95 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <BellRing className="h-3.5 w-3.5" aria-hidden />
              )}
              فعال‌سازی
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ————————————————————————————————————————————————
// بنر نصب اپلیکیشن — پایین (همواره تا نصب)
// ————————————————————————————————————————————————
export function InstallBanner() {
  const canInstall = usePwaStore((s) => s.canInstall);
  const isStandalone = usePwaStore((s) => s.isStandalone);
  const isIos = usePwaStore((s) => s.isIos);
  const install = usePwaStore((s) => s.install);

  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const handleInstall = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await install();
      if (outcome === 'accepted') {
        toast.success('نصب آغاز شد — پارس به صفحه اصلی شما اضافه می‌شود');
      } else if (outcome === 'dismissed') {
        toast.info('هر زمان آماده بودید، دکمه نصب اینجاست');
      } else {
        toast.error('نصب در این مرورگر ممکن نشد');
      }
    } finally {
      setBusy(false);
    }
  }, [install]);

  // نصب‌شده → بنر پنهان (تنها شرط پنهان‌سازی — مطابق درخواست «تا نصب»)
  if (isStandalone) return null;
  // نه قابلیت نصب خودکار دارد و نه iOS → بنری بی‌معناست (فایرفاکس دسکتاپ و …)
  const showGuide = !canInstall && isIos;
  if (!canInstall && !showGuide) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="install-banner"
          className="relative z-10 shrink-0 border-t border-brand-100 bg-gradient-to-l from-brand-700 to-brand-900"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        >
          <div className="flex items-center gap-2.5 px-4 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
              <Smartphone className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-black text-white">
                پارس را روی گوشی نصب کنید
              </p>
              <p className="mt-0.5 truncate text-[10px] text-white/70">
                دسترسی مستقیم از صفحه اصلی — بدون مرورگر
              </p>
            </div>
            {canInstall ? (
              <button
                type="button"
                onClick={() => void handleInstall()}
                disabled={busy}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-gold-400 px-3.5 text-[11px] font-black text-brand-950 transition-transform active:scale-95 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden />
                )}
                نصب
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-gold-400 px-3.5 text-[11px] font-black text-brand-950 transition-transform active:scale-95"
              >
                <SquarePlus className="h-3.5 w-3.5" aria-hidden />
                راهنمای نصب
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* راهنمای iOS — شیت سه‌مرحله‌ای */}
      <AnimatePresence>
        {guideOpen && (
          <motion.div
            key="install-guide"
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              aria-label="بستن راهنما"
              onClick={() => setGuideOpen(false)}
              className="absolute inset-0 bg-ink-900/45 backdrop-blur-[2px]"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="راهنمای نصب روی آیفون"
              className="relative w-full max-w-[480px] rounded-t-3xl bg-white p-5 pb-safe shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-cream-300" />
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[15px] font-black text-ink-900">
                  نصب پارس روی آیفون
                </h2>
                <button
                  type="button"
                  onClick={() => setGuideOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-100 text-ink-500"
                  aria-label="بستن"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <ol className="space-y-3">
                {[
                  {
                    icon: Share,
                    title: 'روی دکمه اشتراک‌گذاری بزنید',
                    desc: 'در نوار پایین Safari — آیکون مربع با فلش رو به بالا',
                  },
                  {
                    icon: SquarePlus,
                    title: '«افزودن به صفحه اصلی» را انتخاب کنید',
                    desc: 'گزینه Add to Home Screen در فهرست اشتراک‌گذاری',
                  },
                  {
                    icon: Check,
                    title: 'نام «پارس» را تأیید کنید',
                    desc: 'آیکون فروشگاه به صفحه اصلی گوشی شما اضافه می‌شود',
                  },
                ].map((step, i) => (
                  <li key={step.title} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                      <step.icon className="h-4.5 w-4.5" strokeWidth={1.8} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-extrabold text-ink-900">
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-ink-500">
                        {step.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <p className="mt-4 rounded-2xl bg-cream-100/70 px-3.5 py-2.5 text-[11px] leading-5 text-ink-600">
                پس از نصب، این پیغام به‌طور خودکار حذف می‌شود.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
