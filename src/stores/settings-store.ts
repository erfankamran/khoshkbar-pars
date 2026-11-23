'use client';

import { create } from 'zustand';
import { apiGet } from '@/lib/api-client';

/**
 * فروشگاه تنظیمات عمومی (فاز ۲) — برند و تم برای کلاینت
 *
 * یک‌بار در هر بارگذاری صفحه از /api/settings خوانده می‌شود (guard ماژول‌سطح
 * از درخواست تکراری جلوگیری می‌کند) و برای همهٔ کامپوننت‌ها در دسترس است.
 * تا رسیدن پاسخ، کامپوننت‌ها از ثابت‌های BRAND استفاده می‌کنند (بدون پرش بصری).
 */

export interface BrandInfo {
  name: string;
  fullName: string;
  tagline: string;
  slogan: string;
  description: string;
  /** خالی = نشان پیش‌فرض پارس */
  logoUrl: string;
}

export interface ThemeInfo {
  primary: string;
  accent: string;
}

/** اسکرین اسپلش (صفحه آغازین) — تنظیمات پنل مدیریت */
export interface SplashInfo {
  /** false = صفحه آغازین اصلاً نمایش داده نمی‌شود */
  enabled: boolean;
  /** خالی = نشان پیش‌فرض پارس (LogoMark) */
  logoUrl: string;
  /** رنگ پس‌زمینه HEX — خالی/نامعتبر = سبز تیره پیش‌فرض */
  backgroundColor: string;
  /** خالی = نام برند */
  title: string;
  /** خالی = شعار برند */
  slogan: string;
  /** مدت نمایش به میلی‌ثانیه (۸۰۰ تا ۵۰۰۰) */
  durationMs: number;
}

interface SettingsState {
  brand: BrandInfo | null;
  theme: ThemeInfo | null;
  /** شماره پشتیبانی عمومی — خالی = تنظیم نشده */
  supportPhone: string;
  /** مختصات نقشه فروشگاه — خالی = ثبت نشده (نمایش در درباره فروشگاه) */
  mapLat: string;
  mapLng: string;
  /** تنظیمات اسکرین اسپلش — null = هنوز بارگذاری نشده (رفتار پیش‌فرض) */
  splash: SplashInfo | null;
  loaded: boolean;
  load: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useSettingsStore = create<SettingsState>((set) => ({
  brand: null,
  theme: null,
  supportPhone: '',
  mapLat: '',
  mapLng: '',
  splash: null,
  loaded: false,
  load: async () => {
    // درخواست موازی دومی منتظر همان Promise می‌ماند — فقط یک fetch
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const data = await apiGet<Record<string, unknown>>('/api/settings');
        // API رشته‌های عددی را به number تبدیل می‌کند (مثل مختصات نقشه) —
        // هر دو شکل به رشته نرمال می‌شود
        const str = (key: string): string => {
          const v = data[key];
          if (typeof v === 'string') return v;
          if (typeof v === 'number' && Number.isFinite(v)) return String(v);
          return '';
        };
        set({
          brand: {
            name: str('brand.name'),
            fullName: str('brand.fullName'),
            tagline: str('brand.tagline'),
            slogan: str('brand.slogan'),
            description: str('brand.description'),
            logoUrl: str('brand.logoUrl'),
          },
          theme: {
            primary: str('theme.primary'),
            accent: str('theme.accent'),
          },
          supportPhone: str('supportPhone'),
          mapLat: str('store.mapLat'),
          mapLng: str('store.mapLng'),
          splash: {
            // API بولی‌ها را به boolean تبدیل می‌کند؛ پیش‌فرض امن true است
            enabled:
              data['splash.enabled'] === undefined
                ? true
                : data['splash.enabled'] === true || data['splash.enabled'] === 'true',
            logoUrl: str('splash.logoUrl'),
            backgroundColor: str('splash.backgroundColor'),
            title: str('splash.title'),
            slogan: str('splash.slogan'),
            durationMs: Number(str('splash.durationMs')) || 1900,
          },
          loaded: true,
        });
      } catch {
        // خطای شبکه → مقادیر پیش‌فرض ثابت‌های BRAND به‌کار می‌رود
        set({ loaded: true });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
}));
