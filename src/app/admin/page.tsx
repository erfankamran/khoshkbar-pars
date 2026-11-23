'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarRange,
  ClipboardList,
  Crown,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { StatCard } from '@/components/admin/StatCard';
import { UserDetailDialog } from '@/components/admin/UserDetailDialog';
import { DailySalesChart, MonthlySalesChart } from '@/components/admin/charts';
import { IranMapChart } from '@/components/admin/IranMapChart';
import { useApi } from '@/hooks/use-api';
import { formatPrice, formatWeight, toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import type { AdminStatsDTO } from '@/server/services/admin/stats.service';

/**
 * داشبورد مدیریت (فاز ۱۱.۱ + درخواست کاربر) — گزارش‌های فروش روزانه/ماهانه،
 * بررسی سریع وضعیت مشتری‌ها، پرفروش‌ها، موجودی کم و سفارش‌های اخیر
 * داده‌ها فقط از GET /api/admin/stats (requireAdmin سمت سرور)
 */

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  PROCESSING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال‌شده',
  DELIVERED: 'تحویل‌شده',
  CANCELED: 'لغو شده',
};

const STATUS_TONES: Record<string, string> = {
  PENDING_PAYMENT: 'bg-gold-100 text-gold-700',
  PAID: 'bg-brand-50 text-brand-700',
  PROCESSING: 'bg-brand-100 text-brand-800',
  SHIPPED: 'bg-ink-100 text-ink-700',
  DELIVERED: 'bg-brand-600 text-white',
  CANCELED: 'bg-red-50 text-red-600',
};

const STATUS_BAR_TONES: Record<string, string> = {
  PENDING_PAYMENT: 'bg-gold-400',
  PAID: 'bg-brand-400',
  PROCESSING: 'bg-brand-500',
  SHIPPED: 'bg-ink-400',
  DELIVERED: 'bg-brand-600',
  CANCELED: 'bg-red-400',
};

const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: 'پرداخت‌نشده',
  PAID: 'پرداخت‌شده',
  FAILED: 'ناموفق',
  REFUNDED: 'بازگشت‌شده',
};

/** ترتیب پایدار نمایش وضعیت‌ها در بخش تفکیک سفارش‌ها */
const STATUS_ORDER = [
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELED',
] as const;

function DashboardContent() {
  const { data, loading, error, reload } = useApi<AdminStatsDTO>('/api/admin/stats');
  // درخواست کاربر — کلیک روی کاربر در داشبورد → دیالوگ جزئیات کامل
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shimmer h-20 rounded-3xl" aria-label="در حال بارگذاری" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
          <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
        </div>
        <div className="shimmer h-40 rounded-3xl" aria-label="در حال بارگذاری" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl border border-red-100 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-500" aria-hidden />
        <p className="mt-2 text-[13px] font-black text-red-700">
          {error ?? 'دریافت آمار ناموفق بود'}
        </p>
        <button
          type="button"
          onClick={reload}
          className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-[12px] font-black text-white transition-colors hover:bg-red-700"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          تلاش مجدد
        </button>
      </div>
    );
  }

  const statusEntries = STATUS_ORDER.map(
    (s) => [s, data.ordersByStatus[s] ?? 0] as const
  ).filter(([, n]) => n > 0);
  const totalOrders = data.ordersByStatus
    ? Object.values(data.ordersByStatus).reduce((a, b) => a + b, 0)
    : 0;

  const customerChips: Array<{ icon: typeof Users; label: string; value: number; cls: string }> = [
    { icon: Users, label: 'کل مشتریان', value: data.customers.total, cls: 'bg-ink-100 text-ink-700' },
    { icon: UserCheck, label: 'خریدار (حداقل ۱ سفارش)', value: data.customers.buyers, cls: 'bg-brand-50 text-brand-700' },
    { icon: ShoppingBag, label: 'خرید تکراری (۲+ سفارش)', value: data.customers.repeatBuyers, cls: 'bg-brand-100 text-brand-800' },
    { icon: UserPlus, label: 'مشتری جدید (۳۰ روز)', value: data.customers.newLast30, cls: 'bg-gold-100 text-gold-700' },
    { icon: UserMinus, label: 'مسدودشده', value: data.customers.blocked, cls: 'bg-red-50 text-red-600' },
  ];

  return (
    <div className="space-y-5">
      {/* ——— کارت‌های آمار ——— */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="فروش امروز"
          value={formatPrice(data.revenue.todayToman)}
          hint={`۳۰ روز: ${formatPrice(data.revenue.monthToman)}`}
          tone="gold"
        />
        <StatCard
          icon={TrendingUp}
          label="فروش ۷ روز اخیر"
          value={formatPrice(data.revenue.weekToman)}
          hint={`میانگین هر سفارش (۳۰ روز): ${formatPrice(data.avgOrderToman30)}`}
        />
        <StatCard
          icon={ClipboardList}
          label="سفارش‌های امروز"
          value={toFaDigits(data.ordersToday)}
          hint={`مجموع اقلام فروخته‌شده: ${toFaDigits(data.totalItemsSold)}`}
          tone="ink"
        />
        <StatCard
          icon={Users}
          label="کاربران"
          value={toFaDigits(data.users.total)}
          hint={`جدید امروز: ${toFaDigits(data.users.today)} — خریدار: ${toFaDigits(data.customers.buyers)}`}
          href="/admin/users"
        />
      </div>

      {/* ——— گزارش‌های فروش (درخواست کاربر: روزانه + ماهانه) ——— */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section
          className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
          aria-label="گزارش فروش روزانه"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[13px] font-black text-ink-900">
              <BarChart3 className="h-4 w-4 text-brand-600" aria-hidden />
              فروش روزانه — ۳۰ روز اخیر
            </h2>
            <span className="rounded-full bg-cream-100 px-2.5 py-1 text-[10px] font-bold text-ink-500">
              حداکثر روز: {formatPrice(Math.max(...data.dailySales.map((d) => d.revenueToman), 0))}
            </span>
          </div>
          <DailySalesChart data={data.dailySales} />
        </section>

        <section
          className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
          aria-label="گزارش فروش ماهانه"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[13px] font-black text-ink-900">
              <CalendarRange className="h-4 w-4 text-brand-600" aria-hidden />
              فروش ماهانه — ۱۲ ماه اخیر
            </h2>
            <span className="rounded-full bg-cream-100 px-2.5 py-1 text-[10px] font-bold text-ink-500">
              {toFaDigits(data.monthlySales.reduce((s, m) => s + m.ordersCount, 0))} سفارش در کل بازه
            </span>
          </div>
          <MonthlySalesChart data={data.monthlySales} />
        </section>
      </div>

      {/* ——— پراکندگی فروش و مشتریان روی نقشهٔ ایران (درخواست کاربر) ——— */}
      <IranMapChart geo={data.geo} />

      {/* ——— وضعیت سفارش‌ها — با سهم درصدی ——— */}
      <section
        className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
        aria-label="وضعیت سفارش‌ها"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[13px] font-black text-ink-900">
            <Activity className="h-4 w-4 text-brand-600" aria-hidden />
            سفارش‌ها بر اساس وضعیت
          </h2>
          <Link
            href="/admin/orders"
            className="text-[11px] font-black text-brand-600 transition-colors hover:text-brand-700"
          >
            مدیریت سفارش‌ها ›
          </Link>
        </div>
        {statusEntries.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-ink-400">هنوز سفارشی ثبت نشده است</p>
        ) : (
          <ul className="space-y-2.5">
            {statusEntries.map(([status, count]) => {
              const share = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
              return (
                <li key={status} className="flex items-center gap-2.5">
                  <span
                    className={`w-max shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-black ${
                      STATUS_TONES[status] ?? 'bg-ink-100 text-ink-600'
                    }`}
                  >
                    {STATUS_LABELS[status] ?? status}
                  </span>
                  <span
                    className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-cream-100"
                    aria-hidden
                  >
                    <span
                      className={`block h-full rounded-full ${STATUS_BAR_TONES[status] ?? 'bg-ink-300'}`}
                      style={{ width: `${Math.max(share, 2)}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-left text-[10.5px] font-bold text-ink-500">
                    {`${toFaDigits(count)} سفارش (${toFaDigits(share)}٪)`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-cream-100 pt-3 text-[11px] font-bold text-ink-500">
          <span className="rounded-xl bg-cream-100 px-2.5 py-1">
            محصولات فعال: {toFaDigits(data.activeProducts)}
          </span>
          <span className="rounded-xl bg-cream-100 px-2.5 py-1">
            نظرات در انتظار تأیید: {toFaDigits(data.pendingReviews)}
          </span>
          <span className="rounded-xl bg-cream-100 px-2.5 py-1">
            میانگین سبد (۳۰ روز): {formatPrice(data.avgOrderToman30)}
          </span>
        </div>
      </section>

      {/* ——— بررسی سریع وضعیت مشتری‌ها (درخواست کاربر) ——— */}
      <section
        className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
        aria-label="بررسی سریع وضعیت مشتری‌ها"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[13px] font-black text-ink-900">
            <Users className="h-4 w-4 text-brand-600" aria-hidden />
            بررسی سریع مشتری‌ها
          </h2>
          <Link
            href="/admin/users"
            className="text-[11px] font-black text-brand-600 transition-colors hover:text-brand-700"
          >
            مدیریت کاربران ›
          </Link>
        </div>

        {/* چیپ‌های جمع‌بندی */}
        <div className="mb-4 flex flex-wrap gap-2">
          {customerChips.map((c) => (
            <span
              key={c.label}
              className={`flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-[11px] font-black ${c.cls}`}
            >
              <c.icon className="h-3.5 w-3.5" aria-hidden />
              {c.label}
              <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px]">
                {toFaDigits(c.value)}
              </span>
            </span>
          ))}
        </div>

        {/* مشتریان برتر — کلیک → دیالوگ جزئیات */}
        <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-ink-700">
          <Crown className="h-3.5 w-3.5 text-gold-600" aria-hidden />
          مشتریان برتر بر اساس خرید
        </h3>
        {data.topCustomers.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-ink-400">
            هنوز خریدی ثبت نشده است
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {data.topCustomers.map((u, i) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setDetailUserId(u.id)}
                className="flex items-center gap-2.5 rounded-2xl border border-cream-200 bg-white px-3 py-2.5 text-right transition-colors hover:border-brand-300 hover:bg-cream-50/60 active:bg-cream-100"
                aria-label={`مشاهده جزئیات ${u.fullName?.trim() || u.phone}`}
              >
                <span className="relative">
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.avatarUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full border border-cream-200 bg-cream-50 object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-100 text-[11px] font-black text-ink-400">
                      {(u.fullName ?? u.phone).trim().charAt(0)}
                    </span>
                  )}
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gold-100 text-[8.5px] font-black text-gold-700">
                    {toFaDigits(i + 1)}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-black text-ink-900">
                    {u.fullName?.trim() || 'مشتری پارس'}
                  </span>
                  <span dir="ltr" className="block text-right text-[10px] text-ink-400">
                    {toFaDigits(u.phone)}
                  </span>
                  <span className="block text-[10px] font-bold text-ink-500">
                    {`${toFaDigits(u.ordersCount)} سفارش`}
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] font-black text-brand-700">
                  {formatPrice(u.totalSpentToman)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* ——— پرفروش‌ترین‌ها ——— */}
        <section
          className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
          aria-label="پرفروش‌ترین محصولات"
        >
          <h2 className="mb-3 text-[13px] font-black text-ink-900">پرفروش‌های ۳۰ روز اخیر</h2>
          {data.topProducts.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-ink-400">داده‌ای برای نمایش نیست</p>
          ) : (
            <ul className="divide-y divide-cream-100">
              {data.topProducts.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[11px] font-black ${
                      i === 0 ? 'bg-gold-100 text-gold-700' : 'bg-cream-100 text-ink-500'
                    }`}
                  >
                    {toFaDigits(i + 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-extrabold text-ink-900">{p.title}</p>
                    <p className="text-[10px] text-ink-400">
                      {`${toFaDigits(p.quantity)} عدد فروخته‌شده`}
                    </p>
                  </div>
                  <span className="text-[11.5px] font-black text-brand-700">
                    {formatPrice(p.revenueToman)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ——— موجودی کم ——— */}
        <section
          className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
          aria-label="موجودی کم"
        >
          <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-black text-ink-900">
            <AlertTriangle className="h-4 w-4 text-gold-600" aria-hidden />
            هشدار موجودی (۵ عدد یا کمتر)
          </h2>
          {data.lowStock.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-ink-400">
              همه واریانت‌ها موجودی کافی دارند
            </p>
          ) : (
            <ul className="divide-y divide-cream-100">
              {data.lowStock.map((v) => (
                <li
                  key={`${v.productTitle}-${v.weightGrams}`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-extrabold text-ink-900">
                      {v.productTitle}
                    </p>
                    <p className="text-[10px] text-ink-400">{formatWeight(v.weightGrams)}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10.5px] font-black ${
                      v.stock === 0 ? 'bg-red-50 text-red-600' : 'bg-gold-100 text-gold-700'
                    }`}
                  >
                    {v.stock === 0 ? 'ناموجود' : `${toFaDigits(v.stock)} عدد`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ——— سفارش‌های اخیر ——— */}
      <section
        className="rounded-3xl border border-cream-200 bg-white shadow-card"
        aria-label="سفارش‌های اخیر"
      >
        <h2 className="px-4 pt-4 text-[13px] font-black text-ink-900">سفارش‌های اخیر</h2>
        {data.recentOrders.length === 0 ? (
          <p className="px-4 pb-5 pt-3 text-center text-[11px] text-ink-400">
            هنوز سفارشی ثبت نشده است
          </p>
        ) : (
          <div className="overflow-x-auto px-4 pb-4 pt-2">
            <table className="w-full min-w-[640px] text-right">
              <thead>
                <tr className="border-b border-cream-200 text-[10.5px] font-bold text-ink-400">
                  <th className="pb-2 font-bold">کد</th>
                  <th className="pb-2 font-bold">مشتری</th>
                  <th className="pb-2 font-bold">مبلغ</th>
                  <th className="pb-2 font-bold">پرداخت</th>
                  <th className="pb-2 font-bold">وضعیت</th>
                  <th className="pb-2 font-bold">تاریخ</th>
                </tr>
              </thead>
              <tbody className="text-[11.5px]">
                {data.recentOrders.map((o) => (
                  <tr key={o.code} className="border-b border-cream-100 last:border-0">
                    <td className="py-2.5 font-black text-brand-800">{o.code}</td>
                    <td className="py-2.5">
                      <button
                        type="button"
                        onClick={() => setDetailUserId(o.customerUserId)}
                        className="block text-right text-ink-900 transition-colors hover:text-brand-700"
                        aria-label={`مشاهده جزئیات ${o.customerName ?? o.customerPhone}`}
                      >
                        <span className="block font-bold underline decoration-cream-300 underline-offset-2">
                          {o.customerName ?? '—'}
                        </span>
                        <span dir="ltr" className="block text-right text-[10px] text-ink-400">
                          {toFaDigits(o.customerPhone)}
                        </span>
                      </button>
                    </td>
                    <td className="py-2.5 font-black text-ink-900">
                      {formatPrice(o.totalToman)}
                    </td>
                    <td className="py-2.5 text-ink-500">
                      {PAYMENT_LABELS[o.paymentStatus] ?? o.paymentStatus}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                          STATUS_TONES[o.status] ?? 'bg-ink-100 text-ink-600'
                        }`}
                      >
                        {STATUS_LABELS[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-[10.5px] text-ink-400">
                      {formatJalaliDate(o.createdAt, { withTime: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ——— تازه‌ترین ثبت‌نام‌ها (کلیک → دیالوگ جزئیات کامل) ——— */}
      <section
        className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
        aria-label="تازه‌ترین ثبت‌نام‌ها"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[13px] font-black text-ink-900">
            <UserPlus className="h-4 w-4 text-brand-600" aria-hidden />
            تازه‌ترین ثبت‌نام‌ها
          </h2>
          <Link
            href="/admin/users"
            className="text-[11px] font-black text-brand-600 transition-colors hover:text-brand-700"
          >
            مدیریت کاربران ›
          </Link>
        </div>
        {data.recentUsers.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-ink-400">هنوز کاربری ثبت‌نام نکرده است</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.recentUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setDetailUserId(u.id)}
                className="flex items-center gap-2.5 rounded-2xl border border-cream-200 bg-white px-3 py-2.5 text-right transition-colors hover:border-brand-300 hover:bg-cream-50/60 active:bg-cream-100"
                aria-label={`مشاهده جزئیات ${u.fullName?.trim() || u.phone}`}
              >
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.avatarUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full border border-cream-200 bg-cream-50 object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-100 text-[11px] font-black text-ink-400">
                    {(u.fullName ?? u.phone).trim().charAt(0)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-black text-ink-900">
                    {u.fullName?.trim() || 'مشتری پارس'}
                    {!u.isActive && (
                      <span className="mr-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[8.5px] font-black text-red-600">
                        مسدود
                      </span>
                    )}
                    {u.role === 'ADMIN' && (
                      <span className="mr-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[8.5px] font-black text-brand-700">
                        مدیر
                      </span>
                    )}
                  </span>
                  <span dir="ltr" className="block text-right text-[10px] text-ink-400">
                    {toFaDigits(u.phone)}
                  </span>
                </span>
                <span className="shrink-0 text-left">
                  <span className="block text-[11.5px] font-black text-brand-700">
                    {formatPrice(u.totalSpentToman)}
                  </span>
                  <span className="block text-[9px] text-ink-400">
                    {toFaDigits(u.ordersCount)} سفارش
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* دیالوگ جزئیات کاربر — مشترک با صفحه کاربران */}
      {detailUserId && (
        <UserDetailDialog id={detailUserId} onClose={() => setDetailUserId(null)} />
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-black text-ink-900">داشبورد</h1>
      </div>
      <DashboardContent />
    </AdminShell>
  );
}
