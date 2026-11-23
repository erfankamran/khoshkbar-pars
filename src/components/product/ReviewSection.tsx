'use client';

import { useState } from 'react';
import { BadgeCheck, Star } from 'lucide-react';
import { toFaDigits } from '@/lib/fa';
import { cn } from '@/lib/utils';

/**
 * بخش نظرات محصول (فاز ۷)
 * - خلاصه امتیاز + توزیع ستاره‌ها (نوار افقی)
 * - لیست نظرات با نام نمایشی، بج «خرید تأییدشده» و تاریخ شمسی
 * - پیش‌فرض ۳ نظر؛ بقیه با «مشاهده همه» باز می‌شوند
 */

const faDate = new Intl.DateTimeFormat('fa-IR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5';
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`امتیاز ${value} از ۵`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            dim,
            i <= Math.round(value)
              ? 'fill-gold-400 text-gold-400'
              : 'fill-cream-200 text-cream-200'
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

export interface ReviewSectionData {
  summary: {
    average: number;
    count: number;
    distribution: Record<string, number>;
  };
  items: Array<{
    id: string;
    rating: number;
    comment: string | null;
    displayName: string;
    avatarUrl?: string | null;
    isVerifiedPurchase: boolean;
    createdAt: string;
  }>;
}

const PREVIEW_COUNT = 3;

export function ReviewSection({ data }: { data: ReviewSectionData }) {
  const [expanded, setExpanded] = useState(false);
  const { summary, items } = data;
  if (items.length === 0 && summary.count === 0) return null;

  const distTotal = Object.values(summary.distribution).reduce(
    (s, n) => s + n,
    0
  );

  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);

  return (
    <section className="px-4 pt-6" aria-label="نظرات خریداران">
      <h2 className="mb-3 text-[15px] font-extrabold text-ink-900">
        نظرات خریداران
      </h2>

      {/* ——— خلاصه امتیاز ——— */}
      <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
        <div className="flex items-center gap-4">
          <div className="flex w-20 shrink-0 flex-col items-center gap-1">
            <span className="text-3xl font-black leading-8 text-brand-800">
              {toFaDigits(summary.average.toFixed(1))}
            </span>
            <Stars value={summary.average} />
            <span className="text-[10px] text-ink-400">
              {`${toFaDigits(summary.count)} نظر`}
            </span>
          </div>

          {/* توزیع ۵ → ۱ */}
          {/* مبنای درصد: مجموع توزیع واقعی نظرات تأییدشده — نه آمار تجمعی محصول */}
          <div className="flex-1 space-y-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.distribution[String(star)] ?? 0;
              const pct =
                distTotal > 0 ? Math.round((count / distTotal) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-1.5">
                  <span className="w-3 text-[10px] font-bold text-ink-500">
                    {toFaDigits(star)}
                  </span>
                  <Star className="h-2.5 w-2.5 fill-gold-400 text-gold-400" aria-hidden />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-100">
                    <div
                      className="h-full rounded-full bg-gold-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-left text-[10px] tabular-nums text-ink-400">
                    {toFaDigits(count)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ——— لیست نظرات ——— */}
      <div className="mt-3 space-y-2.5">
        {visible.map((r) => (
          <article
            key={r.id}
            className="rounded-3xl border border-cream-200 bg-white p-3.5 shadow-card"
          >
            <div className="flex items-center gap-2">
              {r.avatarUrl ? (
                 
                <img
                  src={r.avatarUrl}
                  alt={`آواتار ${r.displayName}`}
                  className="h-8 w-8 shrink-0 rounded-full border border-cream-200 bg-cream-50 object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-black text-brand-700">
                  {r.displayName.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-ink-800">
                  {r.displayName}
                </p>
                <p className="text-[10px] text-ink-400">
                  {faDate.format(new Date(r.createdAt))}
                </p>
              </div>
              {r.isVerifiedPurchase && (
                <span className="flex items-center gap-0.5 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">
                  <BadgeCheck className="h-3 w-3" aria-hidden />
                  خرید تأییدشده
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Stars value={r.rating} />
            </div>

            {r.comment && (
              <p className="mt-1.5 text-xs leading-6 text-ink-600">{r.comment}</p>
            )}
          </article>
        ))}

        {items.length > PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-10 w-full items-center justify-center rounded-2xl border border-brand-200 bg-white text-xs font-bold text-brand-700 transition-colors active:bg-brand-50"
          >
            {expanded
              ? 'بستن نظرات'
              : `مشاهده همه ${toFaDigits(items.length)} نظر`}
          </button>
        )}
      </div>
    </section>
  );
}
