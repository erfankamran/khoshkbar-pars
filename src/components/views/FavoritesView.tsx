'use client';

import { Heart } from 'lucide-react';
import { EmptyState } from '@/components/shared/States';
import { useRouterStore } from '@/stores/router-store';

/**
 * علاقه‌مندی‌ها — حالت واقعی Empty
 * منطق افزودن/حذف و همگام‌سازی با حساب کاربری در فاز ۷ پیاده‌سازی می‌شود.
 */
export function FavoritesView() {
  const reset = useRouterStore((s) => s.reset);

  return (
    <div className="min-h-full">
      <h1 className="px-4 pb-1 pt-5 text-lg font-black text-ink-900">
        علاقه‌مندی‌ها
      </h1>
      <EmptyState
        icon={Heart}
        title="لیست علاقه‌مندی‌ها خالی است"
        description="با زدن آیکون قلب روی محصولات، آن‌ها را اینجا ذخیره کنید تا بعداً به‌راحتی پیدایشان کنید."
        actionLabel="مشاهده محصولات"
        onAction={() => reset({ view: 'home' })}
      />
    </div>
  );
}
