'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { usePwaStore } from '@/stores/pwa-store';


/**
 * بوت‌استرپ PWA (فاز ۹) — سوار در ریشه layout، بدون رندر
 *
 * وظایف:
 * ۱) ثبت Service Worker (/sw.js — کش محافظه‌کارانه آیکون‌ها، فاز ۳)
 * ۲) تشخیص محیط: حالت standalone (نصب‌شده) و iOS
 * ۳) گرفتن beforeinstallprompt و نگه‌داری آن در pwa-store — نصب به انتخاب
 *    کاربر واگذار می‌شود (کارت «نصب اپلیکیشن» در حساب کاربری)
 * ۴) appinstalled → پاک‌سازی وضعیت + پیام موفقیت
 *
 * هیچ‌کدام blocking نیست؛ خطاها بی‌صدا هستند (نصب در مرورگرهای مدرن
 * حتی بدون SW فعال ممکن است و تجربه خرید نباید مختل شود).
 */
export function PwaBootstrap() {
  const setPrompt = usePwaStore((s) => s.setPrompt);
  const setIsStandalone = usePwaStore((s) => s.setIsStandalone);
  const setIsIos = usePwaStore((s) => s.setIsIos);
  const setSwReady = usePwaStore((s) => s.setSwReady);

  useEffect(() => {
    // ——— محیط اجرا ———
    const mqStandalone = window.matchMedia('(display-mode: standalone)');
    // iPadOS 13+ خودش را Mac معرفی می‌کند — تشخیص لمسی مکمل
    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsStandalone(mqStandalone.matches);
    setIsIos(isIos);

    // ——— ثبت Service Worker ———
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(() => setSwReady())
        .catch(() => {
          /* بی‌صدا — کش محدود (file:// یا خطای شبکه) */
        });
    }

    // ——— رویداد نصب (کروم/اندروید/دسکتاپ) ———
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as import('@/stores/pwa-store').BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setIsStandalone(true);
      toast.success('اپلیکیشن پارس نصب شد');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // فقط توسعه — دسترسی دیباگ وضعیت PWA از کنسول (window.__parsPwa)
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __parsPwa?: unknown }).__parsPwa = usePwaStore;
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [setPrompt, setIsStandalone, setIsIos, setSwReady]);

  return null;
}
