'use client';

import type { ProductCardDTO } from '@/server/services/catalog.service';
import { useDragScroll } from '@/hooks/use-drag-scroll';
import { cn } from '@/lib/utils';
import { ProductCard } from './ProductCard';

/**
 * ردیف افقی اسکرول‌شونده کارت‌های محصول — بخش‌های صفحه اصلی (بخش ۴ مشخصات)
 * اسکرول snap ملایم + فاصله استاندارد؛ در فاز ۷ برای «مشابه‌ها» هم استفاده می‌شود.
 * درگ با ماوس در دسکتاپ (useDragScroll) — لمس موبایل native می‌ماند.
 */
export function ProductRow({ items }: { items: ProductCardDTO[] }) {
  const drag = useDragScroll<HTMLDivElement>();
  if (items.length === 0) return null;

  return (
    <div
      ref={drag.ref}
      onPointerDown={drag.onPointerDown}
      onClickCapture={drag.onClickCapture}
      className={cn(
        'no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1 [scroll-padding-inline:1rem]',
        drag.dragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
    >
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
