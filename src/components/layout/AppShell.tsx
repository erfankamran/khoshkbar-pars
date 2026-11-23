'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { viewVariants, ViewRenderer } from '@/components/views';
import {
  loadPersistedStack,
  routeKey,
  useRouterStore,
} from '@/stores/router-store';
import { useAuthStore } from '@/stores/auth-store';
import { useCartStore } from '@/stores/cart-store';
import { useSettingsStore } from '@/stores/settings-store';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { MobileFrame } from './MobileFrame';
import { InstallBanner, NotificationBanner } from '@/components/pwa/PersistentBanners';
import { SplashScreen } from './SplashScreen';
import { notificationTarget } from '@/lib/notification-target';

const SPLASH_SEEN_KEY = 'pars:splash-shown';
/** حداکثر زمان Splash — تضمین می‌کند خطای شبکه Splash بی‌نهایت نگه ندارد */
const SPLASH_MAX_MS = 1900;

/** مشترک بی‌اثر — مقدار Splash پس از mount تغییر نمی‌کند */
const emptySubscribe = () => () => {};

function getSplashSeen(): boolean {
  try {
    return sessionStorage.getItem(SPLASH_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function getSplashSeenServer(): boolean {
  // در SSR Splash نمایش داده می‌شود (false = دیده‌نشده)
  return false;
}

/**
 * پوسته اپلیکیشن پارس:
 * - قاب موبایل مرکزی + هدر ثابت + محتوای اسکرول‌شونده + ناوبری پایین
 * - Splash فقط در راه‌اندازی اولیه هر نشست (sessionStorage)
 * - دکمه Back موبایل/مرورگر → pop نمای فعلی (یکپارچه با history API)
 * - حفظ موقعیت اسکرول هر نما هنگام بازگشت
 * - ثبت Service Worker پایه (PWA کامل در فاز ۱۰)
 */
export function AppShell() {
  // خواندن امن sessionStorage بدون mismatch هیدراتیشن (SSR: Splash نمایش داده می‌شود)
  const splashSeen = useSyncExternalStore(
    emptySubscribe,
    getSplashSeen,
    getSplashSeenServer
  );
  // پایان تایمر Splash — setState فقط داخل callback تایمر (مطابق قوانین React Hooks)
  const [splashTimerDone, setSplashTimerDone] = useState(false);
  // تنظیمات اسکرین اسپلش از پنل مدیریت (درخواست کاربر)
  // تا رسیدن پاسخ /api/settings، رفتار پیش‌فرض (نمایش + ۱۹۰۰ms) حفظ می‌شود
  const splashEnabled = useSettingsStore((s) => (s.splash ? s.splash.enabled : true));
  const splashDurationMs = useSettingsStore((s) =>
    s.splash ? s.splash.durationMs : SPLASH_MAX_MS
  );
  // زمان شروع Splash — برای محاسبه «زمان باقی‌مانده» وقتی تنظیمات دیر می‌رسد
  const splashStartRef = useRef<number>(0);

  // splash.enabled=false → صفحه آغازین حذف می‌شود (بلافاصله پس از رسیدن تنظیمات)
  const showSplash = !splashSeen && !splashTimerDone && splashEnabled;

  const stack = useRouterStore((s) => s.stack);
  const direction = useRouterStore((s) => s.direction);
  const scrollMap = useRouterStore((s) => s.scrollMap);
  const saveScroll = useRouterStore((s) => s.saveScroll);

  const top = stack[stack.length - 1];
  const topKey = routeKey(top);

  const viewRef = useRef<HTMLDivElement | null>(null);
  const scrollRaf = useRef<number | null>(null);

  // ——— ثبت «دیده شدن» Splash برای این نشست ———
  useEffect(() => {
    if (splashSeen) return;
    splashStartRef.current = Date.now();
    try {
      sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
    } catch {
      /* بدون sessionStorage → Splash کوتاه نمایش داده می‌شود */
    }
  }, [splashSeen]);

  // ——— تایمر حداکثر زمان Splash — مدت از تنظیمات پنل (splash.durationMs) ———
  // اگر تنظیمات پس از شروع تایمر برسد، فقط «زمان باقی‌مانده» حساب می‌شود
  // تا Splash بیشتر از مدت تعیین‌شده روی صفحه نماند
  useEffect(() => {
    if (splashSeen) return;
    const start = splashStartRef.current || Date.now();
    const remaining = Math.max(0, splashDurationMs - (Date.now() - start));
    const timer = setTimeout(() => setSplashTimerDone(true), remaining);
    return () => clearTimeout(timer);
  }, [splashSeen, splashDurationMs]);

  // ——— بازیابی پشته ناوبری پس از refresh ———
  useEffect(() => {
    const saved = loadPersistedStack();
    if (saved) useRouterStore.getState().hydrate(saved);
    // Apply notification destinations after restoring the old view stack.
    const target = notificationTarget(window.location.pathname + window.location.search);
    if (target?.partnerAccount) {
      useRouterStore.getState().push({ view: 'account', key: 'account' });
      const url = new URL(window.location.href);
      url.searchParams.delete('account');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    if (target?.orderCode) {
      useRouterStore.getState().push({
        view: 'orderDetail', params: { code: target.orderCode }, key: `orderDetail:${target.orderCode}`,
      });
      const url = new URL(window.location.href);
      url.searchParams.delete('o');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, []);

  // ——— راه‌اندازی اولیه (فاز ۹): احراز هویت → سپس همگام‌سازی سبد ———
  // کاربر واردشده: /api/cart سبد کاربر را می‌خواند (کوکی نشست خودکار ارسال می‌شود)
  useEffect(() => {
    void (async () => {
      await useAuthStore.getState().hydrate();
      await useCartStore.getState().refresh();
    })();
  }, []);

  useEffect(() => {
    const refreshIdentity = () => {
      if (document.visibilityState === 'visible') void useAuthStore.getState().hydrate().then(() => useCartStore.getState().refresh());
    };
    window.addEventListener('focus', refreshIdentity);
    document.addEventListener('visibilitychange', refreshIdentity);
    return () => { window.removeEventListener('focus', refreshIdentity); document.removeEventListener('visibilitychange', refreshIdentity); };
  }, []);

  // ——— یکپارچگی Back مرورگر/موبایل با پشته ناوبری ———
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.history.replaceState({ pars: 1 }, '');

    let armed = true;
    const unsubscribe = useRouterStore.subscribe((state, prev) => {
      // هر ورود به نمای جدید یک ورودی history اضافه می‌کند تا Back کار کند
      if (state.stack.length > prev.stack.length && armed) {
        armed = false;
        window.history.pushState({ pars: 1 }, '');
        armed = true;
      }
    });

    const onPopState = () => {
      const state = useRouterStore.getState();
      if (state.stack.length > 1) {
        state.pop();
        // مجدداً مسلح کردن Back برای pop بعدی
        window.history.pushState({ pars: 1 }, '');
      }
      // اگر فقط یک نما مانده، Back به‌طور طبیعی اجازه خروج از اپ می‌دهد
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      unsubscribe();
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  // ——— ثبت Service Worker پایه — استراتژی کامل در فاز ۱۰ ———
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW اجباری نیست — اپ بدون آن هم کار می‌کند */
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  // ——— بازیابی اسکرول نما هنگام تعویض ———
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    el.scrollTop = scrollMap[topKey] ?? 0;
    // عمداً scrollMap در وابستگی‌ها نیست؛ بازیابی فقط با تغییر نما انجام می‌شود
  }, [topKey]);

  // ——— ذخیره موقعیت اسکرول (throttle با rAF) ———
  const handleScroll = useCallback(() => {
    if (scrollRaf.current !== null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      const el = viewRef.current;
      if (el) saveScroll(topKey, el.scrollTop);
    });
  }, [topKey, saveScroll]);

  return (
    <MobileFrame>
      <AnimatePresence>
        {showSplash && <SplashScreen key="splash" />}
      </AnimatePresence>

      <Header />

      {/* بنر مجوز اعلان‌ها — بالا، همواره تا فعال‌سازی (درخواست کاربر) */}
      <NotificationBanner />

      <main className="relative min-h-0 flex-1">
        <AnimatePresence
          initial={false}
          custom={direction}
          mode="popLayout"
        >
          <motion.div
            key={topKey}
            ref={viewRef}
            custom={direction}
            variants={viewVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            onScroll={handleScroll}
            className="absolute inset-0 overflow-y-auto overscroll-contain no-scrollbar"
          >
            <ViewRenderer route={top} />
            {/* فاصله امن انتهای اسکرول */}
            <div className="h-6" aria-hidden />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* بنر نصب اپلیکیشن — پایین، همواره تا نصب روی گوشی (درخواست کاربر) */}
      <InstallBanner />

      <BottomNav />
    </MobileFrame>
  );
}
