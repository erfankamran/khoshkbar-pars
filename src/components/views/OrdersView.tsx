'use client';

import { Package, PackageOpen } from 'lucide-react';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState, ErrorState } from '@/components/shared/States';
import { formatJalaliDate } from '@/lib/jalali';
import { formatPrice, toFaDigits } from '@/lib/fa';
import { useApi } from '@/hooks/use-api';
import type { OrderListDTO } from '@/server/services/order.service';
import { useAuthStore } from '@/stores/auth-store';
import { useRouterStore } from '@/stores/router-store';

/**
 * سفارش‌های من (فاز ۹) — فهرست سفارش‌های کاربر واردشده
 * - مهمان → دعوت به ورود (API برای مهمان 401 برمی‌گرداند؛ اینجا پیش‌دستی می‌کنیم)
 * - وضعیت سفارش با چیپ رنگی؛ تصاویر اقلام از batch-IN سرور
 */

export const ORDER_STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'در انتظار پرداخت', cls: 'bg-gold-100 text-gold-700' },
  PAID: { label: 'پرداخت شده', cls: 'bg-brand-50 text-brand-700' },
  PROCESSING: { label: 'در حال پردازش', cls: 'bg-brand-50 text-brand-700' },
  SHIPPED: { label: 'ارسال شده', cls: 'bg-sky-50 text-sky-600' },
  DELIVERED: { label: 'تحویل شده', cls: 'bg-emerald-50 text-emerald-600' },
  CANCELED: { label: 'لغو شده', cls: 'bg-red-50 text-red-600' },
};

export function statusMeta(status: string) {
  return ORDER_STATUS_META[status] ?? { label: status, cls: 'bg-cream-100 text-ink-500' };
}

export function OrdersView() {
  const push = useRouterStore((s) => s.push);
  const user = useAuthStore((s) => s.user);
  const { data, loading, error, reload } = useApi<OrderListDTO>(
    user ? '/api/orders' : null
  );

  if (!user) {
    return (
      <div className="min-h-full">
        <TopBar title="سفارش‌های من" />
        <EmptyState
          icon={Package}
          title="برای مشاهده سفارش‌ها وارد شوید"
          description="پس از ورود با شماره موبایل، سفارش‌های شما اینجا نمایش داده می‌شود."
          actionLabel="ورود | ثبت‌نام"
          onAction={() => push({ view: 'login', key: 'login' })}
          className="pt-8"
        />
      </div>
    );
  }

  return (
    <div className="min-h-full pb-10">
      <TopBar title="سفارش‌های من" />

      {error && (
        <ErrorState title="سفارش‌ها بارگذاری نشد" description={error} onRetry={reload} className="pt-8" />
      )}

      {loading && (
        <div className="space-y-3 px-4 pt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="shimmer h-28 rounded-3xl" aria-label="در حال بارگذاری سفارش‌ها" />
          ))}
        </div>
      )}

      {data && data.orders.length === 0 && (
        <EmptyState
          icon={PackageOpen}
          title="هنوز سفارشی ثبت نکرده‌اید"
          description="اولین سفارش خود را ثبت کنید و وضعیت آن را اینجا دنبال کنید."
          actionLabel="شروع خرید"
          onAction={() => push({ view: 'home' })}
          className="pt-8"
        />
      )}

      {data && data.orders.length > 0 && (
        <ul className="mt-4 space-y-3 px-4">
          {data.orders.map((order) => {
            const meta = statusMeta(order.status);
            return (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() =>
                    push({
                      view: 'orderDetail',
                      params: { code: order.code },
                      key: `order:${order.code}`,
                    })
                  }
                  className="w-full rounded-3xl border border-cream-200 bg-white p-4 text-right shadow-card transition-transform active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-ink-400" dir="ltr">
                      {toFaDigits(order.code)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    {/* حداکثر ۳ تصویر اقلام */}
                    <div className="flex -space-x-2" dir="ltr" aria-hidden>
                      {order.items.slice(0, 3).map((item, i) => (
                        <span
                          key={i}
                          className="h-10 w-10 overflow-hidden rounded-xl border-2 border-white bg-cream-100"
                        >
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.productTitle ?? 'تصویر محصول'}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : null}
                        </span>
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-extrabold text-ink-900">
                        {order.items[0]?.productTitle}
                        {order.items.length > 1 &&
                          ` و ${toFaDigits(order.items.length - 1)} کالای دیگر`}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        {formatJalaliDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="text-[13px] font-black text-brand-800">
                        {formatPrice(order.totalToman)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        {`${toFaDigits(order.itemCount)} عدد`}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
