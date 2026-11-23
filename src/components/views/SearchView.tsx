'use client';

import type { FormEvent } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/States';
import { useRouterStore } from '@/stores/router-store';

/**
 * جستجو — اسکلت فاز ۳
 * در فاز ۷: جستجوی زنده سمت سرور با Debounce، نرمال‌سازی فارسی (lib/fa)،
 * پیشنهاد خودکار، جستجوهای اخیر و حالت بدون نتیجه (طبق بخش ۴.۲ مشخصات).
 */
export function SearchView() {
  const back = useRouterStore((s) => s.back);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    toast.info('جستجوی زنده محصولات در فاز ۷ (صفحات فروشگاه) فعال می‌شود.');
  };

  return (
    <div className="min-h-full">
      {/* نوار جستجو */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-3">
        <button
          type="button"
          onClick={back}
          className="flex h-11 w-9 shrink-0 items-center justify-center"
          aria-label="بازگشت"
        >
          <ChevronRight className="h-5 w-5 text-ink-700" aria-hidden />
        </button>
        <div className="flex h-11 flex-1 items-center gap-2 rounded-2xl border border-cream-200 bg-white px-3.5 shadow-card focus-within:border-brand-300">
          <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          <input
            type="search"
            inputMode="search"
            placeholder="نام محصول یا دسته‌بندی…"
            className="h-full w-full bg-transparent text-[13px] text-ink-800 outline-none placeholder:text-ink-400"
            aria-label="عبارت جستجو"
          />
          <button
            type="button"
            onClick={(e) => {
              const input = e.currentTarget.previousElementSibling as HTMLInputElement;
              if (input) {
                input.value = '';
                input.focus();
              }
            }}
            className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500"
            aria-label="پاک کردن"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </form>

      <EmptyState
        icon={Search}
        title="چه چیزی لازم دارید؟"
        description="جستجوی زنده در نام محصولات و دسته‌بندی‌ها — با پشتیبانی کامل از حروف فارسی — در فاز ۷ فعال می‌شود."
      />
    </div>
  );
}
