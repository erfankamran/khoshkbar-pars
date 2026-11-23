'use client';

import { useState } from 'react';
import { CalendarDays, TrendingUp } from 'lucide-react';
import { formatCompactToman, formatPrice, toFaDigits } from '@/lib/fa';

/**
 * نمودارهای فروش داشبورد مدیریت (درخواست کاربر: گزارش روزانه + ماهانه)
 * - CSS خالص بدون کتابخانه نمودار — هم‌راستا با تم (brand/cream/gold) و ارقام فارسی
 * - DailySalesChart: ۳۰ روز اخیر — ستون‌های عمودی؛ جریان زمان RTL (قدیمی‌ترین راست)
 * - MonthlySalesChart: ۱۲ ماه جلالی اخیر — ردیف‌های افقی؛ بدون هم‌پوشانی برچسب‌ها
 * - نوار «خلاصه» بالای هر نمودار با هاور/لمس هر ستون به‌روز می‌شود
 */

export interface SalesPoint {
  label: string;
  shortLabel?: string;
  revenueToman: number;
  ordersCount: number;
}

function ChartSummary({ point, totalToman, totalOrders }: { point: SalesPoint | null; totalToman: number; totalOrders: number }) {
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-cream-50 px-3 py-2 text-[11.5px] font-bold text-ink-600"
      role="status"
    >
      {point ? (
        <>
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
          <span className="text-ink-900">{point.label}</span>
          <span className="text-ink-300">·</span>
          <span>{`${toFaDigits(point.ordersCount)} سفارش`}</span>
          <span className="text-ink-300">·</span>
          <span className="text-brand-700">{formatPrice(point.revenueToman)}</span>
        </>
      ) : (
        <>
          <TrendingUp className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
          <span>{`مجموع: ${formatPrice(totalToman)}`}</span>
          <span className="text-ink-300">·</span>
          <span>{`${toFaDigits(totalOrders)} سفارش`}</span>
          <span className="text-[10px] font-normal text-ink-400">— برای جزئیات، ستون‌ها را لمس کنید</span>
        </>
      )}
    </div>
  );
}

function EmptyChart({ note }: { note: string }) {
  return (
    <p className="rounded-2xl bg-cream-50 py-8 text-center text-[11px] text-ink-400">{note}</p>
  );
}

/** گزارش فروش روزانه — ۳۰ ستون؛ ارتفاع متناسب با سهم فروش هر روز */
export function DailySalesChart({ data }: { data: SalesPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.revenueToman), 1);
  const totalToman = data.reduce((s, d) => s + d.revenueToman, 0);
  const totalOrders = data.reduce((s, d) => s + d.ordersCount, 0);
  const hasAny = totalToman > 0;

  return (
    <div>
      <ChartSummary
        point={active === null ? null : (data[active] ?? null)}
        totalToman={totalToman}
        totalOrders={totalOrders}
      />
      {!hasAny ? (
        <EmptyChart note="در ۳۰ روز اخیر فروشی ثبت نشده است" />
      ) : (
        <div
          className="flex items-end gap-[3px] sm:gap-1"
          style={{ height: '9.5rem' }}
          role="img"
          aria-label={`نمودار فروش روزانه ۳۰ روز اخیر — مجموع ${formatPrice(totalToman)} از ${toFaDigits(totalOrders)} سفارش`}
        >
          {data.map((d, i) => {
            const pct = d.revenueToman === 0 ? 0 : Math.max((d.revenueToman / max) * 100, 3);
            return (
              <button
                key={d.label}
                type="button"
                className="group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-sm outline-none"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                aria-label={`${d.label}: ${toFaDigits(d.ordersCount)} سفارش، ${formatPrice(d.revenueToman)}`}
              >
                <span
                  aria-hidden
                  className={`w-full rounded-t-[4px] transition-colors duration-150 ${
                    d.revenueToman === 0
                      ? 'h-[2px] bg-cream-200'
                      : active === i
                        ? 'bg-gold-500'
                        : 'bg-brand-500 group-hover:bg-gold-400'
                  }`}
                  style={d.revenueToman === 0 ? undefined : { height: `${pct}%` }}
                />
              </button>
            );
          })}
        </div>
      )}
      {/* محور روز — هر ۵ روز یک برچسب (چپ‌به‌راستِ زمان: قدیمی‌ترین راست) */}
      <div className="mt-1.5 flex gap-[3px] sm:gap-1" aria-hidden>
        {data.map((d, i) => (
          <span
            key={d.label}
            className={`min-w-0 flex-1 text-center text-[8px] font-bold ${
              active === i ? 'text-gold-700' : 'text-ink-300'
            }`}
          >
            {i % 5 === 0 ? (d.shortLabel ?? '') : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** گزارش فروش ماهانه — ۱۲ ردیف افقی؛ ماه + تعداد سفارش در راست، ستون و مبلغ در چپ */
export function MonthlySalesChart({ data }: { data: SalesPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.revenueToman), 1);
  const totalToman = data.reduce((s, d) => s + d.revenueToman, 0);
  const totalOrders = data.reduce((s, d) => s + d.ordersCount, 0);
  const hasAny = totalToman > 0;
  // ماه جاری = آخرین عنصر آرایه (قدیمی‌ترین → جدیدترین)
  const current = data[data.length - 1];
  const prev = data[data.length - 2];
  const growth =
    prev && prev.revenueToman > 0
      ? Math.round(((current.revenueToman - prev.revenueToman) / prev.revenueToman) * 100)
      : null;

  return (
    <div>
      <ChartSummary
        point={active === null ? null : (data[active] ?? null)}
        totalToman={totalToman}
        totalOrders={totalOrders}
      />
      {!hasAny ? (
        <EmptyChart note="در ۱۲ ماه اخیر فروشی ثبت نشده است" />
      ) : (
        <>
          {growth !== null && (
            <p
              className={`mb-2 text-[10.5px] font-black ${
                growth >= 0 ? 'text-brand-600' : 'text-red-500'
              }`}
            >
              {`${growth >= 0 ? '▲' : '▼'} رشد نسبت به ماه گذشته: ${toFaDigits(Math.abs(growth))}٪`}
            </p>
          )}
          <ul className="space-y-1.5" role="img" aria-label={`نمودار فروش ماهانه ۱۲ ماه اخیر — مجموع ${formatPrice(totalToman)}`}>
            {data.map((m, i) => (
              <li
                key={m.label}
                className={`flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors ${
                  active === i ? 'bg-gold-50' : ''
                }`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
              >
                <span
                  className={`w-14 shrink-0 text-[10.5px] font-black ${
                    i === data.length - 1 ? 'text-gold-700' : 'text-ink-600'
                  }`}
                >
                  {m.label}
                </span>
                <span className="w-10 shrink-0 text-[9.5px] font-bold text-ink-400">
                  {`${toFaDigits(m.ordersCount)} سفارش`}
                </span>
                <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-cream-100">
                  <span
                    className={`block h-full rounded-full transition-colors ${
                      active === i ? 'bg-gold-500' : 'bg-brand-400'
                    }`}
                    style={{
                      width: `${m.revenueToman === 0 ? 0 : Math.max((m.revenueToman / max) * 100, 1.5)}%`,
                    }}
                  />
                </span>
                <span className="w-20 shrink-0 text-left text-[10px] font-black text-ink-700">
                  {m.revenueToman === 0 ? '—' : formatCompactToman(m.revenueToman)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
