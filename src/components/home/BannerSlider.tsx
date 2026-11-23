'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, type PanInfo } from 'framer-motion';
import { toFaDigits } from '@/lib/fa';
import { useRouterStore } from '@/stores/router-store';
import type { getBanners } from '@/server/services/content.service';

import Image from 'next/image';
export type BannerDTO = Awaited<ReturnType<typeof getBanners>>['items'][number];

const AUTO_ADVANCE_MS = 4500;
const SWIPE_DISTANCE_PX = 50;
const SWIPE_VELOCITY_PX = 500;
const CLICK_SUPPRESS_PX = 10;

/**
 * اسلایدر بنر صفحه اصلی (بخش ۴.۲ مشخصات)
 *
 * - ردیاب flex در RTL: بنر i با translateX مثبت (به سمت راست) وارد دید می‌شود
 * - پیشروی خودکار ۴.۵ ثانیه؛ توقف هنگام لمس/نگه‌داشتن
 * - درگ/سوایپ کامل (ماوس و لمس): کشیدن به راست → بنر بعدی، به چپ → بنر قبلی (RTL)
 * - dots قابل لمس + نسبت ثابت 16/7 (بدون CLS)
 * - CTA بنر → ناوبری داخلی (view/params از دیتابیس)
 */
export function BannerSlider({ banners }: { banners: BannerDTO[] }) {
  const push = useRouterStore((s) => s.push);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchRef = useRef(false);
  const suppressClickRef = useRef(false);

  const count = banners.length;

  const go = useCallback(
    (i: number) => setIndex(((i % count) + count) % count),
    [count]
  );

  /**
   * پایان درگ/سوایپ — در RTL بنر بعدی سمت چپ صف می‌نشیند:
   * کشیدن محتوا به راست → بنر بعدی، کشیدن به چپ → بنر قبلی.
   * فلیک سریع هم با سرعت پذیرفته می‌شود؛ درگ کوچک فقط به جای خود برمی‌گردد.
   */
  /** حین درگ: به‌محض عبور از آستانه، کلیکِ آتی را محکوم به سرکوب کن
   * (نکتهٔ حیاتی: onDragEnd بعد از dispatch شدن click اجرا می‌شود — دیر است! */
  const onDrag = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) > CLICK_SUPPRESS_PX) {
      suppressClickRef.current = true;
    }
  };

  const onDragEnd = (
    _e: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const { offset, velocity } = info;
    if (Math.abs(offset.x) > CLICK_SUPPRESS_PX) {
      suppressClickRef.current = true;
    }
    const toNext =
      offset.x > SWIPE_DISTANCE_PX || velocity.x > SWIPE_VELOCITY_PX;
    const toPrev =
      offset.x < -SWIPE_DISTANCE_PX || velocity.x < -SWIPE_VELOCITY_PX;
    if (toNext) go(index + 1);
    else if (toPrev) go(index - 1);
  };

  useEffect(() => {
    if (paused || count <= 1) return;
    const t = window.setInterval(
      () => setIndex((i) => (i + 1) % count),
      AUTO_ADVANCE_MS
    );
    return () => window.clearInterval(t);
  }, [paused, count]);

  if (count === 0) return null;

  const openBannerLink = (b: BannerDTO) => {
    if (!b.linkView || b.linkView === 'none') return;
    push({
      view: b.linkView as Parameters<typeof push>[0]['view'],
      params: b.linkParams ?? {},
    });
  };

  return (
    <section
      className="mx-4 mt-4"
      aria-label="بنرهای ویژه"
      onPointerDown={() => {
        touchRef.current = true;
        suppressClickRef.current = false;
        setPaused(true);
      }}
      onClickCapture={(e) => {
        // کلیکِ رهاکردن بعد از درگ → CTA ناخواسته باز نشود
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
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
      <div className="relative aspect-[16/7] overflow-hidden rounded-3xl bg-brand-900 shadow-card">
        {/* ردیاب — در RTL آیتم‌ها راست‌به‌چپ می‌چینند؛ نمایش آیتم i = جابه‌جایی مثبت */}
        <motion.div
          className="flex h-full w-full cursor-grab active:cursor-grabbing"
          animate={{ x: `${index * 100}%` }}
          transition={{ type: 'spring', stiffness: 210, damping: 30 }}
          drag="x"
          dragSnapToOrigin
          dragMomentum={false}
          dragElastic={0.08}
          onDrag={onDrag}
          onDragEnd={onDragEnd}
        >
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => openBannerLink(b)}
              aria-label={b.title}
              className="relative h-full w-full shrink-0 text-start"
            >
              {/* بنر اول در لود اولیه دیده می‌شود و LCP صفحه است — اولویت‌دار بارگیری می‌شود */}
              <Image
                src={b.imageUrl}
                alt={b.title}
                fill
                priority={i === 0}
                sizes="(max-width: 480px) 100vw, 448px"
                className="object-cover"
                draggable={false}
              />
              <div
                className="absolute inset-0 bg-gradient-to-l from-brand-950/70 via-brand-950/20 to-transparent"
                aria-hidden
              />
              <div className="absolute inset-y-0 right-0 flex max-w-[62%] flex-col justify-center gap-1 p-4">
                <p className="text-[15px] font-black leading-6 text-cream-50 drop-shadow">
                  {b.title}
                </p>
                {b.subtitle && (
                  <p className="text-[11px] font-bold leading-5 text-brand-100 drop-shadow">
                    {b.subtitle}
                  </p>
                )}
              </div>
            </button>
          ))}
        </motion.div>

        {/* ——— dots ——— */}
        {count > 1 && (
          <div
            className="absolute bottom-2.5 left-0 right-0 z-10 flex items-center justify-center gap-1.5"
            role="tablist"
            aria-label="انتخاب بنر"
          >
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`بنر ${toFaDigits(i + 1)}`}
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
