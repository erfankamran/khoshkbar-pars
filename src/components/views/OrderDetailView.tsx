'use client';

import { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, MapPin, PackageCheck, Printer, ReceiptText, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { TopBar } from '@/components/shared/TopBar';
import { ErrorState } from '@/components/shared/States';
import { PostTrackingDialog } from '@/components/shared/PostTrackingDialog';
import { copyText } from '@/lib/clipboard';
import { formatJalaliDate } from '@/lib/jalali';
import { formatPrice, formatWeight, toFaDigits } from '@/lib/fa';
import { useApi } from '@/hooks/use-api';
import type { OrderDTO } from '@/server/services/order.service';
import { statusMeta } from '@/components/views/OrdersView';
import { useRouterStore } from '@/stores/router-store';

/**
 * جزئیات سفارش (فاز ۹ و ۱۵) — فقط مالک سفارش (سرور: سفارش دیگران → 404)
 * - همه اقلام با قیمت‌های Snapshot لحظه ثبت سفارش نمایش داده می‌شوند
 * - بنر موفقیت فقط برای ثبت تازه (params.justCreated)
 * - وضعیت ارسال با خط زمان ۴ مرحله‌ای + روش ارسال + کد رهگیری پست
 * - پرداخت آنلاین این محیط «تستی» است (paymentRef با پیشوند SANDBOX)
 */

/** مراحل خط زمان وضعیت — ایندکس فعال سفارش روی این نقشه تعیین می‌شود */
const TIMELINE_STEPS = [
  { key: 'register', label: 'ثبت سفارش' },
  { key: 'processing', label: 'در حال پردازش' },
  { key: 'shipped', label: 'ارسال شده' },
  { key: 'delivered', label: 'تحویل شده' },
] as const;

/** ایندکس مرحله فعال برای هر وضعیت — -۱ برای لغو شده */
const STATUS_STEP_INDEX: Record<string, number> = {
  PENDING_PAYMENT: 0,
  PAID: 0,
  PROCESSING: 1,
  SHIPPED: 2,
  DELIVERED: 3,
  CANCELED: -1,
};
export function OrderDetailView({
  code,
  justCreated,
}: {
  code?: string;
  justCreated?: boolean;
}) {
  const push = useRouterStore((s) => s.push);
  const valid = code ? /^PARS-\d{8}-[A-Z2-9]{4}$/.test(code) : false;
  const { data, loading, error, reload } = useApi<OrderDTO>(
    valid ? `/api/orders/${code}` : null
  );
  // دیالوگ «بررسی وضعیت بسته پست» — کد هنگام کلیک خودکار کپی می‌شود (درخواست کاربر)
  const [postDialog, setPostDialog] = useState<{ open: boolean; copied: boolean }>({
    open: false,
    copied: false,
  });

  /** شروع جریان رهگیری پست: ۱) کپی خودکار کد ۲) دیالوگ راهنما + لینک سایت پست */
  const startPostTracking = (trackingCode: string) => {
    void copyText(trackingCode).then((ok) => {
      if (ok) toast.success('کد رهگیری کپی شد — در سایت پست بچسبانید (Ctrl+V)');
      setPostDialog({ open: true, copied: ok });
    });
  };

  return (
    <div className="min-h-full pb-10">
      <TopBar title="جزئیات سفارش" />

      {!valid && (
        <ErrorState
          title="کد سفارش نامعتبر است"
          description="این نشانی به یک سفارش اشاره نمی‌کند."
          onRetry={() => push({ view: 'orders' })}
          className="pt-10"
        />
      )}

      {error && (
        <ErrorState
          title="سفارش بارگذاری نشد"
          description={error}
          onRetry={reload}
          className="pt-10"
        />
      )}

      {loading && valid && (
        <div className="space-y-3 px-4 pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shimmer h-20 rounded-3xl" aria-label="در حال بارگذاری سفارش" />
          ))}
        </div>
      )}

      {data && (
        <div className="px-4 pt-4">
          {/* ——— بنر ثبت موفق ——— */}
          {justCreated && (
            <div
              className="mb-4 flex items-start gap-2.5 rounded-3xl bg-brand-50 p-4"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <div>
                <p className="text-[13px] font-black text-brand-800">
                  سفارش شما با موفقیت ثبت شد
                </p>
                <p className="mt-1 text-[11px] leading-5 text-brand-700/80">
                  وضعیت سفارش را می‌توانید از بخش «سفارش‌های من» دنبال کنید.
                </p>
              </div>
            </div>
          )}

          {/* ——— هدر سفارش ——— */}
          <section
            className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
            aria-label="اطلاعات سفارش"
          >
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusMeta(data.status).cls}`}
              >
                {statusMeta(data.status).label}
              </span>
              <span className="text-[10px] text-ink-400" dir="ltr">
                {toFaDigits(data.code)}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              {`ثبت‌شده در ${formatJalaliDate(data.createdAt, { withTime: true })}`}
            </p>
            {/* چاپ فاکتور A5 (درخواست کاربر — گزینه ۲) — در تب جدید باز می‌شود */}
            <button
              type="button"
              onClick={() => window.open(`/invoice/${data.code}`, '_blank', 'noopener')}
              className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl border border-brand-200 bg-brand-50 text-[12px] font-black text-brand-700 transition-colors hover:bg-brand-100"
              aria-label="چاپ فاکتور این سفارش در سایز A5"
            >
              <Printer className="h-4 w-4" aria-hidden />
              چاپ فاکتور A5
            </button>
          </section>

          {/* ——— وضعیت ارسال — خط زمان ۴ مرحله‌ای (فاز ۱۵) ——— */}
          {data.status === 'CANCELED' ? (
            <section className="mt-4" aria-label="وضعیت سفارش">
              <div className="rounded-3xl bg-red-50 p-4">
                <p className="text-[12.5px] font-black text-red-600">
                  این سفارش لغو شده است
                </p>
                <p className="mt-1 text-[11px] leading-5 text-red-500/90">
                  در صورت پرداخت آنلاین، مبلغ به‌صورت بازگشت وجه (REFUNDED) ثبت شده است.
                </p>
              </div>
            </section>
          ) : (
            <section className="mt-4" aria-label="وضعیت ارسال سفارش">
              <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-black text-ink-900">
                <Truck className="h-4 w-4 text-brand-600" aria-hidden />
                وضعیت ارسال
              </h2>
              <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
                {/* خط زمان افقی */}
                <ol className="flex items-start" dir="rtl">
                  {TIMELINE_STEPS.map((step, i) => {
                    const activeIndex = STATUS_STEP_INDEX[data.status] ?? 0;
                    const done = i < activeIndex;
                    const current = i === activeIndex;
                    return (
                      <li
                        key={step.key}
                        className={`relative flex-1 ${i < TIMELINE_STEPS.length - 1 ? '' : ''}`}
                        aria-current={current ? 'step' : undefined}
                      >
                        {/* رابط اتصال — به جز آخرین مرحله */}
                        {i < TIMELINE_STEPS.length - 1 && (
                          <span
                            aria-hidden
                            className={`absolute right-4 top-4 -mr-px h-0.5 w-[calc(100%-0.5rem)] ${
                              done ? 'bg-brand-500' : 'bg-cream-200'
                            }`}
                          />
                        )}
                        <span
                          className={`relative z-10 mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-black ${
                            done
                              ? 'bg-brand-500 text-white'
                              : current
                                ? 'bg-gold-100 text-gold-700 ring-2 ring-gold-400'
                                : 'bg-cream-100 text-ink-400'
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 className="h-4.5 w-4.5" aria-hidden />
                          ) : (
                            toFaDigits(i + 1)
                          )}
                        </span>
                        <p
                          className={`mt-1.5 text-center text-[9.5px] font-bold leading-4 ${
                            done || current ? 'text-ink-800' : 'text-ink-400'
                          }`}
                        >
                          {step.label}
                        </p>
                      </li>
                    );
                  })}
                </ol>

                {/* روش ارسال + زمان تحویل + کد رهگیری */}
                <div className="mt-4 space-y-2 border-t border-dashed border-cream-200 pt-3 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500">روش ارسال</span>
                    <span className="font-bold text-ink-800">
                      {data.shippingMethodName ?? 'ارسال با پست'}
                    </span>
                  </div>
                  {data.shippingMethodEta && (
                    <div className="flex items-center justify-between">
                      <span className="text-ink-500">زمان تحویل اعلام‌شده</span>
                      <span className="font-bold text-ink-800">{data.shippingMethodEta}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-ink-500">کد رهگیری پست</span>
                    {data.trackingCode ? (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(data.trackingCode ?? '')
                            .then(() => toast.success('کد رهگیری کپی شد'))
                            .catch(() => {});
                        }}
                        className="flex items-center gap-1.5 font-bold text-brand-700"
                        aria-label="کپی کد رهگیری"
                      >
                        <span dir="ltr">{toFaDigits(data.trackingCode)}</span>
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : (
                      <span className="font-bold text-ink-400">
                        {data.status === 'SHIPPED' || data.status === 'DELIVERED'
                          ? 'به‌زودی ثبت می‌شود'
                          : 'پس از ارسال بسته'}
                      </span>
                    )}
                  </div>
                  {data.trackingCode && (
                    <div className="pt-1">
                      {/* درخواست کاربر — دکمه اصلی رهگیری در سایت پست */}
                      <button
                        type="button"
                        onClick={() => startPostTracking(data.trackingCode ?? '')}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-[12.5px] font-black text-white shadow-sm transition-colors hover:bg-brand-700"
                      >
                        <PackageCheck className="h-4 w-4" aria-hidden />
                        بررسی وضعیت بسته پست
                        <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
                      </button>
                      <p className="mt-1.5 text-center text-[10px] text-ink-400">
                        کد رهگیری خودکار کپی و در تب جدید سایت post.ir باز می‌شود
                      </p>
                    </div>
                  )}
                  {data.status === 'SHIPPED' && (
                    <p className="rounded-2xl bg-cream-50 px-3 py-2 text-[10.5px] leading-5 text-ink-500">
                      بسته به پست تحویل شده است — وضعیت لحظه‌ای مرسوله را با دکمهٔ بالا در سایت پست
                      دنبال کنید.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ——— اقلام ——— */}
          <section className="mt-4" aria-label="اقلام سفارش">
            <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-black text-ink-900">
              <ReceiptText className="h-4 w-4 text-brand-600" aria-hidden />
              اقلام سفارش
            </h2>
            <ul className="divide-y divide-cream-100 rounded-3xl border border-cream-200 bg-white shadow-card">
              {data.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 p-3">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.productTitle}
                      className="h-12 w-12 shrink-0 rounded-xl object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="h-12 w-12 shrink-0 rounded-xl bg-cream-100" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-extrabold text-ink-900">
                      {item.productTitle}
                    </p>
                      {item.isWholesale && <p className="text-[10px] font-bold text-brand-700">خرید عمدهٔ همکار</p>}
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {item.isWholesale ? `${formatWeight(item.weightGrams)} · هر کیلو ${formatPrice(item.pricePerKgToman ?? 0)}` : `${formatWeight(item.weightGrams)} · ${toFaDigits(item.quantity)} × ${formatPrice(item.unitPriceToman)}`}
                    </p>
                  </div>
                  <span className="text-[12px] font-black text-brand-800">
                    {formatPrice(item.lineTotalToman)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* ——— آدرس تحویل (Snapshot لحظه ثبت) ——— */}
          <section className="mt-4" aria-label="آدرس تحویل">
            <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-black text-ink-900">
              <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
              آدرس تحویل
            </h2>
            <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <p className="text-[12px] font-extrabold text-ink-900">
                {data.address.receiverName}
              </p>
              <a href={`tel:${data.address.receiverPhone}`} className="mt-1 inline-block min-h-10 py-2 text-xs font-bold text-brand-700" aria-label={`تماس با ${data.address.receiverName}`}><bdi>{toFaDigits(data.address.receiverPhone)}</bdi></a>
              <p className="mt-1 text-[11px] leading-5 text-ink-500">
                {`${data.address.province}، ${data.address.city}، ${data.address.fullAddress}`}
                {data.address.postalCode
                  ? ` — کدپستی ${toFaDigits(data.address.postalCode)}`
                  : ''}
              </p>
            </div>
          </section>

          {/* ——— پرداخت ——— */}
          <section className="mt-4" aria-label="اطلاعات پرداخت">
            <h2 className="mb-2 text-[13px] font-black text-ink-900">پرداخت</h2>
            <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ink-500">روش پرداخت</span>
                <span className="font-bold text-ink-800">
                  {data.paymentMethod === 'ONLINE_GATEWAY' ? 'پرداخت آنلاین' : 'پرداخت در محل'}
                  {data.paymentMethod === 'ONLINE_GATEWAY' && data.paymentRef?.startsWith('SANDBOX') && (
                    <span className="ml-1.5 rounded-full bg-gold-100 px-1.5 py-0.5 text-[9px] font-black text-gold-700">
                      تستی
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px]">
                <span className="text-ink-500">وضعیت</span>
                <span className="font-bold text-ink-800">
                  {data.paymentStatus === 'PAID' ? 'پرداخت شده' : 'پرداخت نشده'}
                </span>
              </div>
              {data.paymentRef && (
                <div className="mt-2 flex items-center justify-between text-[12px]">
                  <span className="text-ink-500">شماره پیگیری پرداخت</span>
                  <span className="font-bold text-ink-800" dir="ltr">
                    {toFaDigits(data.paymentRef)}
                  </span>
                </div>
              )}
              {data.customerNote && (
                <p className="mt-3 rounded-2xl bg-cream-50 px-3 py-2 text-[11px] leading-5 text-ink-600">
                  {`یادداشت شما: ${data.customerNote}`}
                </p>
              )}
            </div>
          </section>

          {/* ——— مبالغ ——— */}
          <section className="mt-4" aria-label="مبالغ سفارش">
            <dl className="space-y-2 rounded-3xl border border-cream-200 bg-white p-4 text-xs shadow-card">
              <div className="flex items-center justify-between">
                <dt className="text-ink-500">جمع کالاها</dt>
                <dd className="font-bold text-ink-800">{formatPrice(data.subtotalToman)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-500">هزینه ارسال</dt>
                <dd className="font-bold text-ink-800">
                  {data.deliveryToman === 0 ? 'رایگان' : formatPrice(data.deliveryToman)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-cream-200 pt-2">
                <dt className="text-[13px] font-extrabold text-ink-900">مبلغ کل سفارش</dt>
                <dd className="text-[15px] font-black text-brand-800">
                  {formatPrice(data.totalToman)}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      )}

      {/* ——— دیالوگ رهگیری پست (درخواست کاربر) ——— */}
      {data?.trackingCode && (
        <PostTrackingDialog
          code={data.trackingCode}
          open={postDialog.open}
          copiedInitially={postDialog.copied}
          onClose={() => setPostDialog({ open: false, copied: false })}
        />
      )}
    </div>
  );
}
