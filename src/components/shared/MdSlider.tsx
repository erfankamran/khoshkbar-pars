'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * اسلایدر بلوک :::slider صفحه‌ساز (درخواست کاربر)
 *
 * الگوی همان BannerSlider صفحهٔ اصلی: ردیاب flex در RTL، پیشروی خودکار ۵
 * ثانیه، توقف هنگام لمس و dots قابل لمس — با <img> ساده (نه next/image) تا
 * تصاویر آپلودی /api/media و مسیرهای استاتیک هر دو بدون تنظیم اضافه کار کنند.
 */

const AUTO_ADVANCE_MS = 5000;

export interface MdSlide {
  src: string;
  alt: string;
  caption: string;
}

export function MdSlider({ slides }: { slides: MdSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchRef = useRef(false);

  const count = slides.length;

  const go = useCallback(
    (i: number) => setIndex(((i % count) + count) % count),
    [count]
  );

  useEffect(() => {
    if (paused || count <= 1) return;
    const t = window.setInterval(
      () => setIndex((i) => (i + 1) % count),
      AUTO_ADVANCE_MS
    );
    return () => window.clearInterval(t);
  }, [paused, count]);

  if (count === 0) return null;

  return (
    <section
      aria-label="اسلایدر تصاویر"
      onPointerDown={() => {
        touchRef.current = true;
        setPaused(true);
      }}
      onPointerUp={() => {
        touchRef.current = false;
        setPaused(false);
      }}
      onPointerLeave={() => {
        if (touchRef.current) {
          touchRef.current = false;
          setPaused(false);
        }
      }}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-cream-100">
        {/* ردیاب — در RTL آیتم‌ها راست‌به‌چپ می‌چینند؛ نمایش آیتم i = جابه‌جایی مثبت */}
        <motion.div
          className="flex h-full w-full"
          animate={{ x: `${index * 100}%` }}
          transition={{ type: 'spring', stiffness: 210, damping: 30 }}
        >
          {slides.map((s, i) => (
            <div
              key={`${s.src}-${i}`}
              className="relative h-full w-full shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.src}
                alt={s.alt || `تصویر ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
              {(s.caption || s.alt) && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/70 to-transparent px-3 pb-2.5 pt-8">
                  <p className="text-[11.5px] font-bold leading-5 text-cream-50 drop-shadow">
                    {s.caption || s.alt}
                  </p>
                </div>
              )}
            </div>
          ))}
        </motion.div>

        {/* ——— dots ——— */}
        {count > 1 && (
          <div
            className="absolute bottom-2.5 left-0 right-0 z-10 flex items-center justify-center gap-1.5"
            role="tablist"
            aria-label="انتخاب تصویر"
          >
            {slides.map((s, i) => (
              <button
                key={`${s.src}-dot-${i}`}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`تصویر ${i + 1}`}
                onClick={() => go(i)}
                className={
                  i === index
                    ? 'h-1.5 w-5 rounded-full bg-cream-50 transition-all'
                    : 'h-1.5 w-1.5 rounded-full bg-cream-50/50 transition-all'
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
