'use client';

import { ChevronRight } from 'lucide-react';
import { useRouterStore } from '@/stores/router-store';

/**
 * نوار بالای نماهای دوم سطحی (فاز ۹) — دکمه بازگشت + عنوان
 * استخراج‌شده از ProductView برای استفاده مشترک در تسویه حساب، سفارش‌ها و ورود
 */
export function TopBar({ title }: { title: string }) {
  const back = useRouterStore((s) => s.back);
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-cream-200 bg-cream-50/95 px-3 py-3 backdrop-blur">
      <button
        type="button"
        onClick={back}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-card transition-transform active:scale-90"
        aria-label="بازگشت"
      >
        <ChevronRight className="h-5 w-5 text-ink-700" aria-hidden />
      </button>
      <span className="text-xs font-bold text-ink-500">{title}</span>
    </div>
  );
}
