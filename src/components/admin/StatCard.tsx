'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * کارت آماری داشبورد مدیریت (فاز ۱۱.۱)
 * - عدد اصلی با ارقام فارسی از caller می‌آید
 * - accent: رنگ متمایز برای تأکید (سبز/طلایی)
 * - href اختیاری: کارت کلیک‌پذیر می‌شود (مثلاً «کاربران» → صفحه مدیریت کاربران)
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'brand',
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: 'brand' | 'gold' | 'ink';
  /** مسیر مقصد — وقتی داده شود کل کارت لینک کلیک‌پذیر است */
  href?: string;
}) {
  const toneCls =
    tone === 'gold'
      ? 'bg-gold-100 text-gold-700'
      : tone === 'ink'
        ? 'bg-ink-100 text-ink-600'
        : 'bg-brand-50 text-brand-600';

  const shell = href
    ? 'group cursor-pointer transition-colors hover:border-brand-300 hover:bg-cream-50/60 active:bg-cream-100'
    : '';

  const inner = (
    <>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneCls}`}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-ink-500">{label}</p>
        <p className="mt-0.5 truncate text-lg font-black leading-7 text-ink-900">{value}</p>
        {hint && <p className="mt-0.5 text-[10px] text-ink-400">{hint}</p>}
      </div>
      {href && (
        <span
          className="ms-auto text-[10px] font-black text-brand-600 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        >
          مشاهده ›
        </span>
      )}
    </>
  );

  const base = 'flex items-center gap-3.5 rounded-3xl border border-cream-200 bg-white p-4 shadow-card';

  if (href) {
    return (
      <Link href={href} className={`${base} ${shell}`} aria-label={`${label} — مشاهده`}>
        {inner}
      </Link>
    );
  }

  return <div className={base}>{inner}</div>;
}
