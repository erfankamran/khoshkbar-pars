'use client';

import { useState } from 'react';
import { ChevronRight, Loader2, PackageOpen } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/shared/States';
import { CategoryChipSkeleton, ProductCardSkeleton } from '@/components/shared/Skeletons';
import { ProductCard } from '@/components/product/ProductCard';
import { useApi } from '@/hooks/use-api';
import { useDragScroll } from '@/hooks/use-drag-scroll';
import {
  usePaginatedProducts,
  type ProductSort,
} from '@/hooks/use-paginated-products';
import { toFaDigits } from '@/lib/fa';
import { cn } from '@/lib/utils';
import { useRouterStore } from '@/stores/router-store';
import type { getCategories } from '@/server/services/catalog.service';

type CategoriesResponse = Awaited<ReturnType<typeof getCategories>>;

/**
 * صفحه دسته‌بندی (فاز ۷ — بخش ۵.۱ مشخصات)
 *
 * - چیپ دسته‌ها: تعویض سریع با replace در پشته ناوبری (Back → صفحه قبل)
 * - مرتب‌سازی سمت سرور: پرفروش‌ترین / جدیدترین / ارزان‌ترین / گران‌ترین
 * - گرید ۲ ستونه + «نمایش بیشتر» (append — بدون پرش اسکرول)
 * - سه حالت الزامی: Skeleton / Error + تلاش مجدد / داده + حالت خالی
 */

const SORT_OPTIONS: Array<{ key: ProductSort; label: string }> = [
  { key: 'popular', label: 'پرفروش‌ترین' },
  { key: 'newest', label: 'جدیدترین' },
  { key: 'cheap', label: 'ارزان‌ترین' },
  { key: 'expensive', label: 'گران‌ترین' },
];

export function CategoryView({ slug }: { slug?: string }) {
  const back = useRouterStore((s) => s.back);
  const replace = useRouterStore((s) => s.replace);
  const chipsDrag = useDragScroll<HTMLElement>();
  const sortDrag = useDragScroll<HTMLDivElement>();

  const [activeSort, setActiveSort] = useState<ProductSort>('popular');

  const {
    items,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    loadMore,
    reload,
  } = usePaginatedProducts(slug, activeSort);

  const {
    data: categoriesResp,
    loading: categoriesLoading,
  } = useApi<CategoriesResponse>('/api/categories');

  const categoryList = categoriesResp?.items;
  const activeCategory = slug
    ? categoryList?.find((c) => c.slug === slug)
    : undefined;
  const pageTitle = activeCategory?.title ?? 'همه محصولات';

  const switchCategory = (nextSlug: string | undefined) => {
    if ((slug ?? undefined) === nextSlug) return;
    replace({
      view: 'category',
      params: nextSlug ? { slug: nextSlug } : undefined,
      key: `category:${nextSlug ?? 'all'}`,
    });
  };

  return (
    <div className="min-h-full pb-8">
      {/* ——— نوار بالا ——— */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-cream-200 bg-cream-50/95 px-3 py-3 backdrop-blur">
        <button
          type="button"
          onClick={back}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-card transition-transform active:scale-90"
          aria-label="بازگشت"
        >
          <ChevronRight className="h-5 w-5 text-ink-700" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-extrabold text-ink-900">
            {pageTitle}
          </h1>
          {total > 0 && (
            <p className="text-[10px] text-ink-400">
              {`${toFaDigits(total)} محصول`}
            </p>
          )}
        </div>
      </div>

      {/* ——— چیپ دسته‌ها ——— */}
      {categoriesLoading ? (
        <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 pt-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <CategoryChipSkeleton key={i} />
          ))}
        </div>
      ) : (
        categoryList && (
          <nav
            ref={chipsDrag.ref}
            onPointerDown={chipsDrag.onPointerDown}
            onClickCapture={chipsDrag.onClickCapture}
            className={cn(
              'no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3',
              chipsDrag.dragging ? 'cursor-grabbing' : 'cursor-grab'
            )}
            aria-label="انتخاب دسته‌بندی"
          >
            {/* همه محصولات */}
            <button
              type="button"
              onClick={() => switchCategory(undefined)}
              className={cn(
                'h-8 shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors',
                !slug
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-ink-600 shadow-card active:bg-cream-100'
              )}
            >
              همه
            </button>
            {categoryList.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => switchCategory(c.slug)}
                className={cn(
                  'h-8 shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors',
                  slug === c.slug
                    ? 'bg-brand-500 text-white'
                    : 'bg-white text-ink-600 shadow-card active:bg-cream-100'
                )}
              >
                {c.title}
              </button>
            ))}
          </nav>
        )
      )}

      {/* ——— مرتب‌سازی ——— */}
      <div
        ref={sortDrag.ref}
        onPointerDown={sortDrag.onPointerDown}
        onClickCapture={sortDrag.onClickCapture}
        className={cn(
          'no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3',
          sortDrag.dragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        role="radiogroup"
        aria-label="مرتب‌سازی محصولات"
      >
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={activeSort === opt.key}
            onClick={() => setActiveSort(opt.key)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-bold transition-colors',
              activeSort === opt.key
                ? 'border-gold-400 bg-gold-100/70 text-brand-900'
                : 'border-cream-200 bg-white text-ink-500 active:bg-cream-100'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ——— محتوا ——— */}
      {error ? (
        <ErrorState onRetry={reload} className="pt-10" />
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 px-4 pt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} className="w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="محصولی یافت نشد"
          description={
            activeCategory
              ? `هنوز محصولی در دسته «${activeCategory.title}» موجود نیست.`
              : 'محصولی با این تنظیمات پیدا نشد.'
          }
          className="pt-10"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 px-4 pt-4">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} className="w-full" />
            ))}
          </div>

          {/* ——— نمایش بیشتر / پایان لیست ——— */}
          <div className="flex flex-col items-center gap-2 pt-5">
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex h-11 items-center gap-2 rounded-2xl border border-brand-200 bg-white px-6 text-sm font-bold text-brand-700 transition-colors active:bg-brand-50 disabled:opacity-60"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    در حال بارگذاری…
                  </>
                ) : (
                  'نمایش بیشتر'
                )}
              </button>
            ) : (
              <p className="text-[11px] text-ink-300">
                {`همه ${toFaDigits(items.length)} محصول نمایش داده شد`}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
