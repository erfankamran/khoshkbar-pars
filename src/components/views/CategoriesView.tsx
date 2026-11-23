'use client';

import { ChevronLeft } from 'lucide-react';
import Image from 'next/image';
import { ErrorState } from '@/components/shared/States';
import { useApi } from '@/hooks/use-api';
import { toFaDigits } from '@/lib/fa';
import { useRouterStore } from '@/stores/router-store';
import type { getCategories } from '@/server/services/catalog.service';

type CategoriesResponse = Awaited<ReturnType<typeof getCategories>>;
type CategoryItem = CategoriesResponse['items'][number];

/**
 * دسته‌بندی‌ها — نمای اختصاصی تب «دسته‌بندی» (درخواست کاربر)
 *
 * - فقط دسته‌ها، در کاشی‌های بزرگ دوستونه (تصویر کامل + عنوان + تعداد محصول)
 * - برخلاف نمای فروشگاه، فهرست محصول اینجا رندر نمی‌شود
 * - لمس کاشی → نمای فروشگاه همان دسته (push — دکمه Back طبیعی کار می‌کند)
 * - سه حالت الزامی: Skeleton / Error + تلاش مجدد / داده
 */

function CategoryTileSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-card">
      <div className="shimmer aspect-square w-full" />
      <div className="px-3.5 pb-3.5 pt-3">
        <div className="shimmer h-4 w-2/3 rounded-full" />
        <div className="shimmer mt-2 h-3 w-1/3 rounded-full" />
      </div>
    </div>
  );
}

function CategoryTile({ cat }: { cat: CategoryItem }) {
  const push = useRouterStore((s) => s.push);

  return (
    <button
      type="button"
      onClick={() => push({ view: 'category', params: { slug: cat.slug } })}
      className="group overflow-hidden rounded-3xl border border-cream-200 bg-white text-right shadow-card transition-transform active:scale-[0.97]"
      aria-label={`${cat.title} — ${cat.productCount} محصول`}
    >
      {/* تصویر بزرگ دسته — نسبت مربع، همان منبع تصویر پنل مدیریت */}
      <span className="relative block aspect-square w-full overflow-hidden bg-cream-100">
        {cat.imageUrl ? (
          <Image
            src={cat.imageUrl}
            alt={cat.title}
            fill
            sizes="(max-width: 480px) 45vw, 220px"
            className="object-cover transition-transform duration-500 group-active:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[11px] text-ink-300">
            بدون تصویر
          </span>
        )}
      </span>

      <span className="flex items-center gap-2 px-3.5 pb-3.5 pt-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-black text-ink-900">
            {cat.title}
          </span>
          <span className="mt-1 block text-[10.5px] font-medium text-ink-400">
            {`${toFaDigits(cat.productCount)} محصول`}
          </span>
        </span>
        <ChevronLeft
          className="h-4 w-4 shrink-0 text-ink-300"
          aria-hidden
        />
      </span>
    </button>
  );
}

export function CategoriesView() {
  const { data, loading, error, reload } = useApi<CategoriesResponse>(
    '/api/categories'
  );

  const categories = data?.items ?? [];

  return (
    <div className="min-h-full pb-6">
      <h1 className="px-4 pb-2 pt-5 text-lg font-black text-ink-900">
        دسته‌بندی‌ها
      </h1>
      <p className="px-4 pb-3 text-[11px] text-ink-400">
        دسته موردنظر را انتخاب کنید تا محصولات آن را ببینید
      </p>

      {error ? (
        <ErrorState onRetry={reload} className="pt-8" />
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 px-4 pt-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <CategoryTileSkeleton key={i} />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <p className="px-4 pt-8 text-center text-[12px] text-ink-400">
          هنوز دسته‌بندی‌ای ساخته نشده است.
        </p>
      ) : (
        <nav
          className="grid grid-cols-2 gap-3 px-4 pt-1"
          aria-label="فهرست دسته‌بندی‌ها"
        >
          {categories.map((cat) => (
            <CategoryTile key={cat.slug} cat={cat} />
          ))}
        </nav>
      )}
    </div>
  );
}
