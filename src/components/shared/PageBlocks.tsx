'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Award,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Gem,
  Gift,
  Headset,
  Heart,
  Info,
  Leaf,
  MapPin,
  Moon,
  Package,
  Percent,
  Phone,
  Recycle,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Sprout,
  Star,
  Store,
  Sun,
  ThumbsUp,
  Timer,
  Truck,
  Users,
  Wheat,
  Cherry,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { MarkdownContent } from '@/components/shared/MarkdownContent';
import {
  BLOCK_ICONS,
  type CardsBlock,
  type GalleryBlock,
  type IconsBlock,
  type PageBlock,
  type SliderBlock,
  type TextBlock,
} from '@/lib/page-blocks';

/**
 * رندرکنندهٔ بلوک‌های صفحه‌ساز (درخواست کاربر) — تمپلیت‌های آمادهٔ کامپوننتی
 *
 * پنج تمپلیت: نوشته (مارک‌داون امن) / کارت‌ها / آیکون‌ها / اسلایدر / گالری
 * - در هر سه سطح استفاده می‌شود: صفحهٔ SSR /p/[slug]، نمای SPA و پیش‌نمایش پنل
 * - بدون dangerouslySetInnerHTML — همه متن‌ها escape می‌شوند
 * - لینک داخلی (شروع با /) با next/link؛ لینک خارجی با <a target=_blank>
 */

/** نگاشت نام امن آیکون → کامپوننت lucide (هم‌نام با whitelist سرور) */
const ICONS: Record<string, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  Truck,
  ShieldCheck,
  Headset,
  Leaf,
  Sprout,
  Star,
  Award,
  Clock,
  Phone,
  MapPin,
  Sparkles,
  Heart,
  Package,
  BadgeCheck,
  Recycle,
  Percent,
  Gift,
  Users,
  Store,
  CheckCircle2,
  Timer,
  Wheat,
  Cherry,
  Gem,
  Flame,
  Snowflake,
  Sun,
  Moon,
  ThumbsUp,
  Info,
};

const GRID_COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

/** لینک بلوک — داخلی با Link، خارجی با <a> */
function BlockLink({
  href,
  className,
  children,
  ariaLabel,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  if (href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link href={href} className={className} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

// ———————————————————— تمپلیت «نوشته» ————————————————————
function TextBlockView({ block }: { block: TextBlock }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-card">
      <MarkdownContent source={block.markdown} variant="spa" />
    </section>
  );
}

// ———————————————————— تمپلیت «کارت‌ها» ————————————————————
function CardsBlockView({ block }: { block: CardsBlock }) {
  return (
    <section
      className={`grid gap-3 ${GRID_COLS[block.columns] ?? GRID_COLS[3]}`}
      aria-label="کارت‌ها"
    >
      {block.items.map((item, i) => {
        const inner = (
          <>
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-cream-100">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  fill
                  sizes="(max-width: 640px) 46vw, 260px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center bg-cream-50 text-2xl font-black text-cream-300">
                  {item.title.slice(0, 2)}
                </span>
              )}
              {item.badge && (
                <span className="absolute right-2 top-2 rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-black text-white shadow-card">
                  {item.badge}
                </span>
              )}
            </div>
            <div className="p-3.5">
              <p className="text-[13px] font-black leading-5 text-ink-900">{item.title}</p>
              {item.description && (
                <p className="mt-1.5 text-[11.5px] leading-5 text-ink-500">{item.description}</p>
              )}
              {item.href && (
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-brand-700">
                  مشاهده
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                </span>
              )}
            </div>
          </>
        );
        const cardClass =
          'group overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-cream-100 transition-shadow hover:shadow-lg';
        return item.href ? (
          <BlockLink key={i} href={item.href} className={`block ${cardClass}`} ariaLabel={item.title}>
            {inner}
          </BlockLink>
        ) : (
          <div key={i} className={cardClass}>
            {inner}
          </div>
        );
      })}
    </section>
  );
}

// ———————————————————— تمپلیت «آیکون‌ها» ————————————————————
function IconsBlockView({ block }: { block: IconsBlock }) {
  return (
    <section
      className={`grid gap-3 ${GRID_COLS[block.columns] ?? GRID_COLS[4]}`}
      aria-label="ویژگی‌ها"
    >
      {block.items.map((item, i) => {
        const Icon = ICONS[item.icon] ?? Sparkles;
        return (
          <div
            key={i}
            className="flex flex-col items-center rounded-3xl bg-white p-4 text-center shadow-card ring-1 ring-cream-100"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <p className="mt-2.5 text-[12.5px] font-black text-ink-900">{item.title}</p>
            {item.description && (
              <p className="mt-1 text-[10.5px] leading-4 text-ink-400">{item.description}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ———————————————————— تمپلیت «اسلایدر» ————————————————————
function SliderBlockView({ block }: { block: SliderBlock }) {
  const [index, setIndex] = useState(0);
  const count = block.slides.length;

  // پخش خودکار — فقط با بیش از یک اسلاید
  useEffect(() => {
    if (!block.autoplay || count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 4500);
    return () => clearInterval(t);
  }, [block.autoplay, count]);

  const slide = block.slides[Math.min(index, count - 1)];
  const go = (dir: 1 | -1) => setIndex((i) => (i + dir + count) % count);

  const content = (
    <>
      <Image
        src={slide.imageUrl}
        alt={slide.title ?? 'اسلاید'}
        fill
        sizes="(max-width: 768px) 100vw, 760px"
        className="object-cover"
        priority={index === 0}
      />
      {(slide.title || slide.subtitle) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/70 via-ink-950/25 to-transparent p-5 pt-10 text-white">
          {slide.title && <p className="text-[15px] font-black leading-6">{slide.title}</p>}
          {slide.subtitle && (
            <p className="mt-1 text-[11.5px] leading-5 text-white/85">{slide.subtitle}</p>
          )}
        </div>
      )}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="اسلاید قبلی"
            className="absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink-700 shadow-card transition-colors hover:bg-white"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="اسلاید بعدی"
            className="absolute left-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink-700 shadow-card transition-colors hover:bg-white"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5" dir="ltr">
            {block.slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`اسلاید ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </>
  );

  const shellClass =
    'relative aspect-[2.4/1] w-full overflow-hidden rounded-3xl bg-cream-100 shadow-card';

  if (slide.href) {
    return (
      <BlockLink href={slide.href} className={`block ${shellClass}`} ariaLabel={slide.title ?? undefined}>
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0"
          >
            {content}
          </motion.div>
        </AnimatePresence>
      </BlockLink>
    );
  }
  return (
    <section className={shellClass} aria-label="اسلایدر">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0"
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

// ———————————————————— تمپلیت «گالری» ————————————————————
function GalleryBlockView({ block }: { block: GalleryBlock }) {
  return (
    <section
      className={`grid gap-2.5 ${GRID_COLS[block.columns] ?? GRID_COLS[3]}`}
      aria-label="گالری تصاویر"
    >
      {block.images.map((img, i) => (
        <div
          key={i}
          className="relative aspect-square overflow-hidden rounded-2xl bg-cream-100 shadow-card"
        >
          <Image
            src={img.url}
            alt={img.alt ?? `تصویر ${i + 1}`}
            fill
            sizes="(max-width: 640px) 46vw, 240px"
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
        </div>
      ))}
    </section>
  );
}

// ———————————————————— رندرکنندهٔ اصلی ————————————————————
export function PageBlocks({ blocks }: { blocks: PageBlock[] }) {
  if (!blocks.length) return null;
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'text':
            return <TextBlockView key={i} block={block} />;
          case 'cards':
            return <CardsBlockView key={i} block={block} />;
          case 'icons':
            return <IconsBlockView key={i} block={block} />;
          case 'slider':
            return <SliderBlockView key={i} block={block} />;
          case 'gallery':
            return <GalleryBlockView key={i} block={block} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

/** فهرست نام‌های مجاز برای استفادهٔ ادمین (پیکر آیکون در پنل) */
export { BLOCK_ICONS };
