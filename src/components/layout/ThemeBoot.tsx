'use client';

import { useEffect } from 'react';
import { applyBrandTheme } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * بوت تم رنگی (فاز ۲) — بدون رندر بصری؛ تنظیمات برند/تم را می‌خواند و
 * متغیرهای CSS پالت را روی :root بازنویسی می‌کند تا کل فروشگاه رنگ بگیرد.
 * اگر پنل پیش‌فرض را ذخیره نکرده باشد، CSS پیش‌فرض دست‌نخورده می‌ماند.
 */
export function ThemeBoot() {
  const loaded = useSettingsStore((s) => s.loaded);
  const theme = useSettingsStore((s) => s.theme);
  const load = useSettingsStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loaded || !theme) return;
    if (!theme.primary && !theme.accent) return;
    applyBrandTheme(theme.primary || '#1f8f5a', theme.accent || '#d9b352');
  }, [loaded, theme]);

  return null;
}
