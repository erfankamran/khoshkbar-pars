'use client';

import { Truck } from 'lucide-react';
import { formatPrice, toFaDigits } from '@/lib/fa';
import type { CartTotals } from '@/stores/cart-store';

/**
 * خلاصه مبالغ سبد (فاز ۸) — همه اعداد از سرور با قیمت لحظه‌ای دیتابیس
 * - نوار پیشرفت «تا ارسال رایگان» انگیزه افزایش سبد است (آستانه از Setting)
 * - هشدار حداقل مبلغ سفارش پیش از فعال‌شدن دکمه ادامه
 */
export function CartSummary({ totals }: { totals: CartTotals }) {
  const { subtotalToman, deliveryToman, freeShipping, remainingForFreeShippingToman } = totals;

  // نسبت پیشرفت تا آستانه ارسال رایگان — بر اساس ۱۵۰۰٬۰۰۰ پیش‌فرض؟ نه:
  // آستانه واقعی = subtotal + remaining (سرور ارسال می‌کند؛ اختلاف صفر یعنی واجد شرط)
  const threshold = subtotalToman + remainingForFreeShippingToman;
  const pct =
    threshold > 0 && !freeShipping
      ? Math.min(100, Math.round((subtotalToman / threshold) * 100))
      : 100;

  return (
    <section
      className="mx-4 mt-4 rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
      aria-label="خلاصه سفارش"
    >
      {/* ——— نوار ارسال رایگان ——— */}
      {subtotalToman > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold">
            <Truck className="h-3.5 w-3.5 text-brand-600" aria-hidden />
            {freeShipping ? (
              <span className="text-brand-700">ارسال این سفارش رایگان است 🎉</span>
            ) : (
              <span className="text-ink-600">
                {`${formatPrice(remainingForFreeShippingToman)} تا ارسال رایگان`}
              </span>
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-cream-100">
            <div
              className={freeShipping ? 'h-full rounded-full bg-brand-500' : 'h-full rounded-full bg-gold-400'}
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="پیشرفت تا ارسال رایگان"
            />
          </div>
        </div>
      )}

      {/* ——— ردیف‌های مبلغ ——— */}
      <dl className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-ink-500">جمع کالاها ({`${toFaDigits(totals.totalQuantity)} عدد`})</dt>
          <dd className="font-bold text-ink-800">{formatPrice(subtotalToman)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-ink-500">هزینه ارسال</dt>
          <dd className="font-bold">
            {subtotalToman === 0 ? (
              <span className="text-ink-300">—</span>
            ) : freeShipping ? (
              <span className="text-brand-700">
                <span className="ml-1 text-[10px] text-ink-300 line-through">
                  {formatPrice(totals.standardDeliveryToman)}
                </span>
                رایگان
              </span>
            ) : (
              formatPrice(deliveryToman)
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between border-t border-dashed border-cream-200 pt-2">
          <dt className="text-[13px] font-extrabold text-ink-900">مبلغ قابل پرداخت</dt>
          <dd className="text-[15px] font-black text-brand-800">
            {formatPrice(totals.totalPayableToman)}
          </dd>
        </div>
      </dl>

      {!totals.meetsMinOrder && subtotalToman > 0 && (
        <p className="mt-2.5 rounded-xl bg-gold-100/70 px-3 py-2 text-[11px] font-bold text-gold-700">
          {`حداقل مبلغ سفارش ${formatPrice(totals.minOrderToman)} است`}
        </p>
      )}
    </section>
  );
}
