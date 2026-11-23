'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Download,
  Smartphone,
  Share,
  SquarePlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { toFaDigits } from '@/lib/fa';
import { cn } from '@/lib/utils';
import { usePwaStore } from '@/stores/pwa-store';

/**
 * کارت نصب اپلیکیشن (فاز ۹ — قابلیت نصب PWA، بخش ۱۰.۴ مشخصات)
 *
 * سه حالت:
 * ۱) نصب‌شده (standalone) → کارت تأیید کوچک
 * ۲) beforeinstallprompt در دسترس (کروم/اندروید/دسکتاپ) → دکمه نصب خودکار
 * ۳) iOS/Safari → راهنمای سه‌مرحله‌ای «افزودن به صفحه اصلی» (شیت پایین)
 * مرورگر بدون هیچ‌کدام (مثلاً فایرفاکس دسکتاپ) → هیچ‌چیز رندر نمی‌شود
 */
export function InstallAppCard() {
  const canInstall = usePwaStore((s) => s.canInstall);
  const isStandalone = usePwaStore((s) => s.isStandalone);
  const isIos = usePwaStore((s) => s.isIos);
  const install = usePwaStore((s) => s.install);

  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // ——— حالت ۱: همین حالا در اپ نصب‌شده هستیم ———
  if (isStandalone) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-3xl border border-brand-100 bg-brand-50/50 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          <Check className="h-5 w-5" strokeWidth={2.2} aria-hidden />
        </span>
        <div>
          <p className="text-[13px] font-extrabold text-ink-900">
            اپلیکیشن پارس نصب است
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            از صفحه اصلی دستگاه، مستقیم وارد فروشگاه شوید
          </p>
        </div>
      </div>
    );
  }

  const showInstall = canInstall;
  const showGuide = !canInstall && isIos;
  if (!showInstall && !showGuide) return null;

  const handleInstall = async () => {
    setBusy(true);
    try {
      const outcome = await install();
      if (outcome === 'accepted') {
        toast.success('نصب آغاز شد — پارس به صفحه اصلی شما اضافه می‌شود');
      } else if (outcome === 'dismissed') {
        toast.info('هر زمان خواستید، از همین بخش می‌توانید نصب کنید');
      } else {
        toast.error('نصب در این مرورگر ممکن نشد');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          'mt-4 overflow-hidden rounded-3xl border shadow-card',
          showInstall
            ? 'border-brand-200 bg-gradient-to-l from-brand-600 to-brand-800'
            : 'border-cream-200 bg-white'
        )}
      >
        <div
          className={cn(
            'flex items-center gap-3.5 p-4',
            showInstall && 'text-white'
          )}
        >
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
              showInstall ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-600'
            )}
          >
            <Smartphone className="h-6 w-6" strokeWidth={1.6} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'text-[14px] font-extrabold',
                showInstall ? 'text-white' : 'text-ink-900'
              )}
            >
              نصب اپلیکیشن پارس
            </p>
            <p
              className={cn(
                'mt-0.5 text-[11px] leading-4',
                showInstall ? 'text-white/80' : 'text-ink-500'
              )}
            >
              دسترسی سریع، بدون مراجعه به مرورگر — سبک و امن
            </p>
          </div>
        </div>
        <div className="px-4 pb-4">
          {showInstall ? (
            <button
              type="button"
              onClick={() => void handleInstall()}
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[13px] font-black text-brand-800 transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <Download className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              {busy ? 'در حال آماده‌سازی…' : 'نصب روی این دستگاه'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-[13px] font-black text-white transition-transform active:scale-[0.98]"
            >
              <SquarePlus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              راهنمای نصب روی آیفون
            </button>
          )}
        </div>
      </div>

      {/* ——— شیت راهنمای iOS ——— */}
      <AnimatePresence>
        {guideOpen && (
          <motion.div
            key="ios-guide"
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
                        {toFaDigits(i + 1)}. {step.title}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-ink-500">
                        {step.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <p className="mt-4 rounded-2xl bg-cream-100/70 px-3.5 py-2.5 text-[11px] leading-5 text-ink-600">
                در iOS نصب مستقیم از داخل مرورگر ممکن نیست؛ با همین سه قدم،
                پارس مثل یک اپ مستقل — تمام‌صفحه و بدون نوار مرورگر — اجرا می‌شود.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
