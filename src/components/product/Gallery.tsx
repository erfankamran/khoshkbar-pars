'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { toFaDigits } from '@/lib/fa';
import { cn } from '@/lib/utils';

/**
 * گالری تصاویر محصول (فاز ۷)
 * - اسکرول snap افقی + dots فعال با ردیابی موقعیت اسکرول
 * - RTL-safe: محاسبه اسلاید فعال بر اساس «نزدیک‌ترین مرکز به مرکز نما»
 *   (مستقل از علامت scrollLeft که بین مرورگرها در RTL متفاوت است)
 * - جابه‌جایی با scrollIntoView(inline:center) — خودِ مرورگر جهت RTL را حل می‌کند
 * - با یک تصویر dots مخفی می‌شود؛ با چند تصویر بدون کد اضافه کار می‌کند
 */
export function Gallery({
  images,
  title,
}: {
  images: Array<{ url: string; alt: string | null }>;
  title: string;
}) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  if (images.length === 0) {
    return <div className="mx-4 mt-4 aspect-square rounded-3xl bg-cream-100" aria-hidden />;
  }

  const handleScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const viewCenter = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const box = child as HTMLElement;
      const c = box.offsetLeft + box.offsetWidth / 2;
      const dist = Math.abs(c - viewCenter);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActive(best);
  };

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    (el.children[i] as HTMLElement | undefined)?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  };

  return (
    <div className="relative mx-4 mt-4">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="no-scrollbar flex aspect-square w-full snap-x snap-mandatory overflow-x-auto rounded-3xl bg-cream-100"
        aria-label={`تصاویر ${title}`}
      >
        {images.map((img, i) => (
          <div key={img.url + i} className="relative h-full w-full shrink-0 snap-center">
            <Image
              src={img.url}
              alt={img.alt ?? title}
              fill
              sizes="(max-width: 480px) 92vw, 448px"
              priority={i === 0}
              quality={80}
              className="object-cover"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`تصویر ${toFaDigits(i + 1)}`}
              onClick={() => goTo(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === active ? 'w-5 bg-white' : 'w-1.5 bg-white/60'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
