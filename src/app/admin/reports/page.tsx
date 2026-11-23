'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useApi } from '@/hooks/use-api';
import { formatPrice, toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import type { SalesReportDTO } from '@/server/services/admin/report-admin.service';

/**
 * گزارش فروش (فاز ۱۱.۶) — بازه‌های ۷/۱۴/۳۰ روزه
 * نمودار روزی با میله‌های CSS (بدون کتابخانه خارجی)، وضعیت‌ها و
 * پرداخت‌ها و پرفروش‌ها در کارت‌های مجزا — همه ارقام فارسی
 */

const RANGES = [
  { days: 7, label: '۷ روز' },
  { days: 14, label: '۱۴ روز' },
  { days: 30, label: '۳۰ روز' },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  PROCESSING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال‌شده',
  DELIVERED: 'تحویل‌شده',
  CANCELED: 'لغو شده',
};

const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: 'پرداخت‌نشده',
  PAID: 'پرداخت‌شده',
  FAILED: 'ناموفق',
  REFUNDED: 'بازگشت‌شده',
};

const STATUS_TONES: Record<string, string> = {
  PENDING_PAYMENT: 'bg-gold-400',
  PAID: 'bg-brand-500',
  PROCESSING: 'bg-brand-700',
  SHIPPED: 'bg-ink-400',
  DELIVERED: 'bg-brand-900',
  CANCELED: 'bg-red-400',
};

export default function AdminReportsPage() {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const { data, loading, error, reload } = useApi<SalesReportDTO>(`/api/admin/reports?days=${days}`);

  const maxRevenue = data ? Math.max(...data.daily.map((d) => d.revenueToman), 1) : 1;

  return (
    <AdminShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-black text-ink-900">گزارش فروش</h1>
          <p className="mt-0.5 text-[11px] text-ink-400">
            درآمد و وضعیت سفارش‌ها — سفارش‌های لغوشده از درآمد حذف می‌شوند
          </p>
        </div>
        {/* انتخاب بازه */}
        <div className="flex gap-1 rounded-2xl bg-cream-100 p-1" role="tablist" aria-label="بازه گزارش">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              role="tab"
              aria-selected={days === r.days}
              onClick={() => setDays(r.days as 7 | 14 | 30)}
              className={`h-8 rounded-xl px-3 text-[11.5px] font-black transition-colors ${
                days === r.days ? 'bg-brand-600 text-white' : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shimmer h-24 rounded-3xl" aria-label="در حال بارگذاری" />
            ))}
          </div>
          <div className="shimmer h-64 rounded-3xl" />
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-cream-200 bg-white p-10 text-center shadow-card">
          <p className="text-[13px] font-black text-red-600">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 h-9 rounded-xl bg-red-600 px-4 text-[11.5px] font-black text-white"
          >
            تلاش مجدد
          </button>
        </div>
      ) : !data ? null : (
        <div className="space-y-4">
          {/* ——— کارت‌های خلاصه ——— */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <p className="text-[10.5px] font-bold text-ink-400">درآمد بازه</p>
              <p className="mt-1 text-lg font-black text-brand-700">
                {formatPrice(data.totals.revenueToman)}
              </p>
            </div>
            <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <p className="text-[10.5px] font-bold text-ink-400">سفارش‌ها</p>
              <p className="mt-1 text-lg font-black text-ink-900">{toFaDigits(data.totals.ordersCount)}</p>
            </div>
            <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <p className="text-[10.5px] font-bold text-ink-400">میانگین سبد</p>
              <p className="mt-1 text-lg font-black text-ink-900">{formatPrice(data.totals.aovToman)}</p>
            </div>
            <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <p className="text-[10.5px] font-bold text-ink-400">نرخ لغو</p>
              <p className="mt-1 text-lg font-black text-ink-900">
                ٪{toFaDigits(Math.round(data.totals.cancelRate * 100))}
              </p>
            </div>
          </div>

          {/* ——— نمودار روزانه ——— */}
          <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] font-black text-ink-900">درآمد روزانه</p>
              <p className="text-[10.5px] text-ink-400">
                اقلام فروخته‌شده: {toFaDigits(data.totals.itemsSold)}
              </p>
            </div>
            <div
              className="flex h-44 items-end gap-1 overflow-x-auto"
              role="img"
              aria-label={`نمودار درآمد ${toFaDigits(data.rangeDays)} روز اخیر`}
            >
              {data.daily.map((d) => {
                const h = d.revenueToman > 0 ? Math.max(4, Math.round((d.revenueToman / maxRevenue) * 100)) : 2;
                return (
                  <div key={d.day} className="group flex min-w-[16px] flex-1 flex-col items-center justify-end gap-1">
                    <span className="pointer-events-none rounded bg-ink-900 px-1.5 py-0.5 text-[9px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {formatPrice(d.revenueToman)}
                    </span>
                    <div
                      className={`w-full max-w-6 rounded-t-md transition-colors ${
                        d.revenueToman > 0 ? 'bg-brand-500 group-hover:bg-brand-600' : 'bg-cream-200'
                      }`}
                      style={{ height: `${h}%` }}
                      title={`${d.day} — ${formatPrice(d.revenueToman)} (${toFaDigits(d.ordersCount)} سفارش)`}
                    />
                    {data.rangeDays <= 14 && (
                      <span className="text-[8.5px] text-ink-300">
                        {toFaDigits(Number(d.day.slice(8, 10)))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* ——— وضعیت سفارش‌ها ——— */}
            <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <p className="mb-3 text-[12px] font-black text-ink-900">وضعیت سفارش‌ها</p>
              {Object.keys(data.ordersByStatus).length === 0 ? (
                <p className="py-6 text-center text-[11px] text-ink-400">سفارشی در این بازه نیست</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(data.ordersByStatus)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => {
                      const total = data.totals.ordersCount || 1;
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div key={status}>
                          <div className="mb-0.5 flex items-center justify-between text-[10.5px]">
                            <span className="font-bold text-ink-600">{STATUS_LABELS[status] ?? status}</span>
                            <span className="text-ink-400">
                              {toFaDigits(count)} (٪{toFaDigits(pct)})
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-cream-100">
                            <div
                              className={`h-full rounded-full ${STATUS_TONES[status] ?? 'bg-ink-300'}`}
                              style={{ width: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              <p className="mb-2 mt-4 text-[12px] font-black text-ink-900">وضعیت پرداخت‌ها</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(data.paymentBreakdown).length === 0 ? (
                  <p className="text-[11px] text-ink-400">—</p>
                ) : (
                  Object.entries(data.paymentBreakdown).map(([p, count]) => (
                    <span
                      key={p}
                      className="rounded-full bg-cream-100 px-2.5 py-1 text-[10px] font-black text-ink-600"
                    >
                      {PAYMENT_LABELS[p] ?? p}: {toFaDigits(count)}
                    </span>
                  ))
                )}
              </div>

              <p className="mb-1 mt-4 text-[12px] font-black text-ink-900">کاربران جدید</p>
              <p className="text-[13px] font-black text-brand-700">
                {toFaDigits(data.newUsers.total)} کاربر در این بازه
              </p>
            </div>

            {/* ——— پرفروش‌ها ——— */}
            <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card lg:col-span-2">
              <p className="mb-3 text-[12px] font-black text-ink-900">پرفروش‌ترین محصولات</p>
              {data.topProducts.length === 0 ? (
                <p className="py-6 text-center text-[11px] text-ink-400">فروشی در این بازه ثبت نشده</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-right">
                    <thead>
                      <tr className="border-b border-cream-200 text-[10.5px] font-bold text-ink-400">
                        <th className="pb-2 font-bold">#</th>
                        <th className="pb-2 font-bold">محصول</th>
                        <th className="pb-2 font-bold">دسته</th>
                        <th className="pb-2 font-bold">تعداد</th>
                        <th className="pb-2 font-bold">فروش</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((p, i) => (
                        <tr key={p.productId} className="border-b border-cream-100 last:border-0">
                          <td className="py-2.5 text-[11px] font-black text-ink-300">
                            {toFaDigits(i + 1)}
                          </td>
                          <td className="py-2.5 text-[11.5px] font-extrabold text-ink-900">{p.title}</td>
                          <td className="py-2.5 text-[11px] text-ink-500">{p.categoryTitle ?? '—'}</td>
                          <td className="py-2.5 text-[11.5px] text-ink-600">{toFaDigits(p.quantity)}</td>
                          <td className="py-2.5 text-[11.5px] font-black text-brand-700">
                            {formatPrice(p.revenueToman)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.newUsers.daily.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-black text-ink-500">
                    کاربران جدید (روزانه) — آخرین {toFaDigits(Math.min(data.rangeDays, 14))} روز
                  </p>
                  <div className="flex h-16 items-end gap-1" aria-label="نمودار کاربران جدید">
                    {data.newUsers.daily.slice(-14).map((d) => {
                      const max = Math.max(...data.newUsers.daily.map((x) => x.count), 1);
                      const h = d.count > 0 ? Math.max(8, Math.round((d.count / max) * 100)) : 4;
                      return (
                        <div
                          key={d.day}
                          className="w-full max-w-6 flex-1 rounded-t bg-gold-400"
                          style={{ height: `${h}%` }}
                          title={`${d.day} — ${toFaDigits(d.count)} کاربر جدید`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-[10px] text-ink-300">
            داده‌های بازه از {formatJalaliDate(data.daily[0]?.day ?? '')} تا امروز
          </p>
        </div>
      )}
    </AdminShell>
  );
}
