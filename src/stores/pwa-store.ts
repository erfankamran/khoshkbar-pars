import { create } from 'zustand';

/**
 * وضعیت نصب PWA (فاز ۹ — قابلیت نصب فروشگاه به‌عنوان اپ، بخش ۱۰.۴ مشخصات)
 *
 * - رویداد beforeinstallprompt فقط در کروم/اندروید/دسکتاپ صادر می‌شود؛
 *   آن را یک‌بار می‌گیریم، preventDefault می‌کنیم و نصب را به انتخاب خود
 *   کاربر (کارت «نصب اپلیکیشن» در حساب کاربری) واگذار می‌کنیم
 * - iOS/Safari رویداد نصب ندارد → isIos برای نمایش راهنمای دستی
 *   («افزودن به صفحه اصلی») استفاده می‌شود
 * - isStandalone یعنی اپ همین حالا نصب و مستقل اجرا می‌شود → رابط نصب مخفی
 * - بدون persist: هر بار راه‌اندازی از رویدادهای مرورگر پر می‌شود
 */

/** رویداد استاندارد نصب — فاقد تایپ رسمی در TS DOM */
export interface BeforeInstallPromptEvent extends Event {
  /** نمایش دیالوگ نصب کروم */
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | null;

interface PwaState {
  /** beforeinstallprompt گرفته شده؟ (نصب خودکار ممکن است) */
  canInstall: boolean;
  /** اپ در حالت نصب‌شده/مستقل اجرا می‌شود */
  isStandalone: boolean;
  /** Safari/iOS — نصب خودکار ندارد، راهنمای دستی نمایش داده می‌شود */
  isIos: boolean;
  /** ثبت Service Worker موفق بود (شرط پایدار نصب) */
  swReady: boolean;
  /** رویداد نصب نگه‌داری‌شده — توسط PwaBootstrap پر می‌شود */
  prompt: BeforeInstallPromptEvent | null;

  setPrompt: (p: BeforeInstallPromptEvent | null) => void;
  setIsStandalone: (v: boolean) => void;
  setIsIos: (v: boolean) => void;
  setSwReady: () => void;

  /**
   * نمایش دیالوگ نصب مرورگر — نتیجه userChoice برمی‌گردد؛
   * null یعنی رویدادی در دسترس نیست (مثلاً iOS یا مرورگر بدون پشتیبانی)
   */
  install: () => Promise<InstallOutcome>;
}

export const usePwaStore = create<PwaState>((set, get) => ({
  canInstall: false,
  isStandalone: false,
  isIos: false,
  swReady: false,
  prompt: null,

  setPrompt: (p) => set({ prompt: p, canInstall: p !== null }),
  setIsStandalone: (v) => set({ isStandalone: v }),
  setIsIos: (v) => set({ isIos: v }),
  setSwReady: () => set({ swReady: true }),

  install: async () => {
    const p = get().prompt;
    if (!p) return null;
    try {
      await p.prompt();
    } catch {
      // برخی مرورگرها دیالوگ را بدون رویداد رد می‌کنند
      return null;
    }
    const { outcome } = await p.userChoice;
    // پس از استفاده، رویداد مصرف می‌شود — مرورگر آن را دوباره نمی‌فرستد
    set({ prompt: null, canInstall: false });
    return outcome;
  },
}));
