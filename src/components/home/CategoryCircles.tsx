'use client';

import { useRouterStore } from '@/stores/router-store';
import { useDragScroll } from '@/hooks/use-drag-scroll';
import { cn } from '@/lib/utils';
import type { getCategories } from '@/server/services/catalog.service';

import Image from 'next/image';
type CategoryDTO = Awaited<ReturnType<typeof getCategories>>['items'][number];

/**
 * دایره‌های دسته‌بندی صفحه اصلی — تصویر واقعی از دیتابیس (فاز ۶)
 * کلیک → نمای دسته با اسلاگ (فاز ۷ محصولات را فیلتر می‌کند)
 * درگ با ماوس در دسکتاپ (useDragScroll) — لمس موبایل native می‌ماند.
 */
export function CategoryCircles({ categories }: { categories: CategoryDTO[] }) {
  const push = useRouterStore((s) => s.push);
  const drag = useDragScroll<HTMLElement>();

  return (
    <nav
      ref={drag.ref}
      onPointerDown={drag.onPointerDown}
      onClickCapture={drag.onClickCapture}
      className={cn(
        'no-scrollbar flex gap-2.5 overflow-x-auto px-4 pb-1',
        drag.dragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
      aria-label="دسته‌بندی محصولات"
    >
      {categories.map((cat) => (
        <button
          key={cat.slug}
          type="button"
          onClick={() => push({ view: 'category', params: { slug: cat.slug } })}
          className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
          aria-label={`${cat.title} — ${cat.productCount} محصول`}
        >
          <span className="block rounded-2xl border border-cream-200 bg-white p-[3px] shadow-card transition-transform active:scale-95">
            {cat.imageUrl ? (
              <Image
                src={cat.imageUrl}
                alt={cat.title}
                width={116}
                height={116}
                sizes="58px"
                className="h-[58px] w-[58px] rounded-[13px] object-cover"
              />
            ) : (
              <span className="block h-[58px] w-[58px] rounded-[13px] bg-cream-100" aria-hidden />
            )}
          </span>
          <span className="text-[11px] font-bold leading-4 text-ink-700">
            {cat.title}
          </span>
        </button>
      ))}
    </nav>
  );
}
