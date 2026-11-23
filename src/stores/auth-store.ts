import { create } from 'zustand';
import {
  apiGet,
  apiPost,
  clearSessionToken,
  readStoredSessionToken,
  storeSessionToken,
} from '@/lib/api-client';
import { useCartStore } from '@/stores/cart-store';

/**
 * وضعیت احراز هویت کلاینت (فاز ۹ · فاز ۱۰ — فال‌بک نشست)
 *
 * - حقیقت نشست در کوکی HttpOnly pars_session است؛ store فقط «نمایش» کاربر را
 *   نگه می‌دارد و در راه‌اندازی از /api/auth/me همگام می‌شود
 * - فال‌بک هدر (x-pars-session): در iframe بین‌سایتی کوکی ارسال نمی‌شود؛
 *   توکن از بدنهٔ پاسخ verify/me در localStorage ذخیره می‌شود و api-client آن
 *   را در همهٔ درخواست‌ها می‌فرستد — بدون آن ثبت سفارش ۴۰۱ می‌داد
 * - خودترمیمی: اگر سرور مهمان گفت ولی توکن ذخیره داریم → نشست مرده است؛
 *   توکن پاک می‌شود تا درخواست‌های بعدی بی‌هدر زنده نامعتبر نفرستند
 * - بدون persist: پس از refresh، hydrate() دوباره از سرور می‌خواند (منبع حقیقت
 *   سرور است — عدم persist از دوگانگی وضعیت جلوگیری می‌کند)
 */

export interface AuthUser {
  id: string;
  phone: string;
  fullName: string | null;
  role: string;
  /** آواتار شخصیت پارس یا آپلود کاربر — فاز آواتار */
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  /** hydrate اولیه انجام شده؟ (تا UI گمراه نشود) */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const data = await apiGet<{ user: AuthUser | null; sessionToken?: string }>(
        '/api/auth/me'
      );
      if (data.user) {
        // به‌روزرسانی فال‌بک هدر — بعد از refresh هم نشست حفظ می‌شود
        storeSessionToken(data.sessionToken ?? readStoredSessionToken());
      } else if (readStoredSessionToken()) {
        // سرور نشست را نمی‌شناسد (منقضی/باطل‌شده) → توکن مرده پاک شود
        clearSessionToken();
      }
      set({ user: data.user, hydrated: true });
    } catch {
      // شبکه سرد → مهمان نمایش داده می‌شود؛ تلاش بعدی در تعامل بعدی
      set({ hydrated: true });
    }
  },

  setUser: (user) => set({ user, hydrated: true }),

  logout: async () => {
    try {
      await apiPost('/api/auth/logout');
    } finally {
      set({ user: null });
      // توکن فال‌بک هم باید پاک شود — نشست سمت سرور باطل شده است
      clearSessionToken();
      useCartStore.getState().clear();
      // سرور سبد کاربر را به سبد دستگاه برگردانده — همگام‌سازی فوری تا بج
      // و ردیف‌ها باقی بمانند (خروج ≠ خالی شدن سبد)
      void useCartStore.getState().refresh();
    }
  },
}));
