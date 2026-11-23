'use client';

import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Loader2,
  MapPin,
  Package,
  Phone,
  Printer,
  ReceiptText,
  Send,
  Store,
  Truck,
  User,
  X,
} from 'lucide-react';
import { ErrorState } from '@/components/shared/States';
import { useApi } from '@/hooks/use-api';
import { formatPrice, formatWeight, toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import type { InvoiceDTO } from '@/server/services/invoice.service';

/**
 * فاکتور چاپی A5 (درخواست کاربر — گزینه ۲)
 *
 * - از نمای سفارش مشتری و پنل مدیر با «چاپ فاکتور» در تب جدید باز می‌شود
 * - سایز کاغذ A5 عمودی (۱۴۸×۲۱۰ میلی‌متر) با @page — دکمهٔ چاپ window.print
 * - سربرگ: مشخصات فروشگاه (برند، تلفن، نشانی پستی پنل تنظیمات)
 * - بخش «از کی به کی»: فرستنده (فروشگاه) → گیرنده (آدرس Snapshot سفارش)
 * - اقلام با قیمت Snapshot لحظهٔ ثبت + جمع‌ها + کادر امضای دو طرف
 */

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

const METHOD_LABELS: Record<string, string> = {
  ONLINE_GATEWAY: 'پرداخت آنلاین',
  COD: 'پرداخت در محل',
};

/** قیمت جدول بدون واحد — «تومان» فقط یک‌بار در سرستون/جمع‌ها می‌آید */
const faAmount = (toman: number): string => toFaDigits(Math.round(toman).toLocaleString('en-US'));

export default function InvoicePrintPage() {
  const { code } = (useParams() as { code: string }) ?? {};
  const valid = typeof code === 'string' && /^PARS-\d{8}-[A-Z2-9]{4}$/.test(code);
  const { data, loading, error, reload } = useApi<InvoiceDTO>(
    valid ? `/api/invoice/${code}` : null
  );

  return (
    <div className="inv-root">
      {/* استایل چاپ — فقط همین صفحه؛ @page سایز کاغذ A5 عمودی را قفل می‌کند */}
      <style>{INVOICE_PRINT_CSS}</style>

      {/* ——— نوار ابزار (فقط نمایش — در چاپ حذف می‌شود) ——— */}
      <div className="no-print sticky top-0 z-10 border-b border-cream-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ReceiptText className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-[12.5px] font-black text-ink-900">پیش‌نمایش فاکتور چاپی</p>
              <p className="text-[10px] leading-4 text-ink-400">
                سایز کاغذ A5 عمودی — گزینهٔ «چاپ» مرورگر را روی A5 تنظیم کنید
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!data}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white shadow-card transition-all hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50"
            >
              <Printer className="h-4 w-4" aria-hidden />
              چاپ فاکتور
            </button>
            <button
              type="button"
              onClick={() => window.close()}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-cream-200 bg-white px-3 text-[11.5px] font-black text-ink-500 transition-colors hover:bg-cream-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              بستن
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl overflow-x-auto px-4 py-6 print:px-0 print:py-0">
        {!valid && (
          <ErrorState
            title="کد سفارش نامعتبر است"
            description="این نشانی به یک فاکتور اشاره نمی‌کند."
            className="pt-10"
          />
        )}

        {error && (
          <ErrorState
            title="فاکتور بارگذاری نشد"
            description={error.includes('وارد حساب') ? 'برای مشاهده فاکتور ابتدا وارد حساب خود شوید.' : error}
            onRetry={reload}
            className="pt-10"
          />
        )}

        {loading && valid && (
          <div className="space-y-3 pt-4">
            <div className="shimmer h-24 rounded-3xl" aria-label="در حال بارگذاری فاکتور" />
            <div className="shimmer h-40 rounded-3xl" aria-label="در حال بارگذاری فاکتور" />
            <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری فاکتور" />
          </div>
        )}

        {data && <InvoiceSheet data={data} />}
      </div>
    </div>
  );
}

/** برگهٔ A5 — در چاپ همان چیزی که می‌بینید روی کاغذ می‌افتد */
function InvoiceSheet({ data }: { data: InvoiceDTO }) {
  const { order, store } = data;
  const canceled = order.status === 'CANCELED';

  return (
    <div className="inv-sheet mx-auto" dir="rtl">
      {/* ——— سربرگ فروشگاه ——— */}
      <header className="flex items-start justify-between gap-3 border-b-2 border-ink-900 pb-3">
        <div className="flex items-start gap-2.5">
          {store.logoUrl ? (
            <img
              src={store.logoUrl}
              alt={store.name}
              className="inv-keep-color h-14 w-14 rounded-2xl border border-cream-200 object-cover"
            />
          ) : (
            <span className="inv-keep-color flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-xl font-black text-white">
              پ
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[17px] font-black leading-6 text-ink-900">{store.fullName}</p>
            <p className="mt-0.5 text-[10px] font-bold text-ink-500">{store.tagline}</p>
            <div className="mt-1.5 space-y-0.5 text-[9.5px] leading-4 text-ink-600">
              <p className="flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0 text-brand-600" aria-hidden />
                {`تلفن: ${toFaDigits(store.supportPhone)}`}
              </p>
              {store.address && (
                <p className="flex items-start gap-1">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-brand-600" aria-hidden />
                  <span>{`نشانی: ${store.address}`}</span>
                </p>
              )}
              {store.postalCode && (
                <p>{`کدپستی: ${toFaDigits(store.postalCode)}`}</p>
              )}
            </div>
          </div>
        </div>

        <div className="inv-keep-color shrink-0 rounded-2xl border border-brand-200 bg-brand-50 px-3 py-2 text-left">
          <p className="text-[14px] font-black text-brand-800">فاکتور فروش</p>
          <p className="mt-1 text-[9.5px] font-bold text-ink-500" dir="ltr">
            {toFaDigits(order.code)}
          </p>
          <p className="mt-0.5 text-[9px] leading-4 text-ink-500">
            {`تاریخ: ${formatJalaliDate(order.createdAt)}`}
          </p>
        </div>
      </header>

      {/* ——— وضعیت سفارش و پرداخت ——— */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-[9.5px]">
        <span className={`inv-keep-color rounded-full px-2 py-0.5 font-black ${canceled ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700'}`}>
          {`وضعیت سفارش: ${STATUS_LABELS[order.status] ?? order.status}`}
        </span>
        <span className="inv-keep-color rounded-full bg-cream-100 px-2 py-0.5 font-black text-ink-600">
          {`پرداخت: ${PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}`}
          {order.paymentMethod ? ` · ${METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}` : ''}
        </span>
      </div>

      <section className="mt-3 rounded-2xl border border-cream-200 p-3" aria-label="مشخصات گیرنده فاکتور">
        <h2 className="text-[11px] font-black">مشخصات گیرنده سفارش</h2>
        <p className="mt-1 text-[11px] font-bold">{order.address.receiverName || '—'}</p>
        <p className="mt-1 text-[10px]">تلفن: <a href={`tel:${order.address.receiverPhone}`}><bdi>{toFaDigits(order.address.receiverPhone) || '—'}</bdi></a></p>
        <p className="mt-1 text-[10px] leading-5">{[order.address.province, order.address.city, order.address.fullAddress].filter(Boolean).join('، ')}</p>
        {order.address.postalCode && <p className="mt-1 text-[10px]">کدپستی: {toFaDigits(order.address.postalCode)}</p>}
      </section>

      {/* ——— روش ارسال و کد رهگیری ——— */}
      {(order.shippingMethodName || order.trackingCode) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9.5px] text-ink-600">
          {order.shippingMethodName && (
            <p className="flex items-center gap-1">
              <Package className="h-3 w-3 text-brand-600" aria-hidden />
              {`روش ارسال: ${order.shippingMethodName}`}
            </p>
          )}
          {order.trackingCode && (
            <p className="flex items-center gap-1 font-bold text-ink-800">
              <BadgeCheck className="h-3 w-3 text-brand-600" aria-hidden />
              {`کد رهگیری پست: ${toFaDigits(order.trackingCode)}`}
            </p>
          )}
          {order.shippingMethodEta && <p>{`زمان تحویل: ${order.shippingMethodEta}`}</p>}
        </div>
      )}

      {/* ——— جدول اقلام ——— */}
      <table className="mt-3 w-full border-collapse text-[9.5px]">
        <thead>
          <tr className="inv-keep-color bg-cream-100 text-ink-700">
            <th className="border border-cream-200 px-1.5 py-1.5 font-black">#</th>
            <th className="border border-cream-200 px-1.5 py-1.5 text-right font-black">شرح کالا</th>
            <th className="border border-cream-200 px-1.5 py-1.5 font-black">وزن</th>
            <th className="border border-cream-200 px-1.5 py-1.5 font-black">تعداد</th>
            <th className="border border-cream-200 px-1.5 py-1.5 font-black">قیمت واحد / نرخ (تومان)</th>
            <th className="border border-cream-200 px-1.5 py-1.5 font-black">مبلغ کل (تومان)</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => (
            <tr key={item.id} className="text-ink-800">
              <td className="border border-cream-200 px-1.5 py-1.5 text-center">{toFaDigits(i + 1)}</td>
              <td className="border border-cream-200 px-1.5 py-1.5 font-bold">{item.productTitle}{item.isWholesale && <span className="block text-[8px] font-normal">خرید عمدهٔ همکار</span>}</td>
              <td className="border border-cream-200 px-1.5 py-1.5 text-center">
                {formatWeight(item.weightGrams)}
              </td>
              <td className="border border-cream-200 px-1.5 py-1.5 text-center">
                {item.isWholesale ? 'وزنی' : toFaDigits(item.quantity)}
              </td>
              <td className="border border-cream-200 px-1.5 py-1.5 text-center">
                {faAmount(item.isWholesale ? item.pricePerKgToman ?? 0 : item.unitPriceToman)}{item.isWholesale && <span className="block text-[8px]">هر کیلو</span>}
              </td>
              <td className="border border-cream-200 px-1.5 py-1.5 text-center font-black">
                {faAmount(item.lineTotalToman)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ——— جمع‌ها ——— */}
      <div className="mt-3 flex justify-start">
        <dl className="w-56 space-y-1 text-[10px]">
          <div className="flex justify-between text-ink-600">
            <dt>جمع کالاها</dt>
            <dd className="font-black text-ink-800">{formatPrice(order.subtotalToman)}</dd>
          </div>
          {order.discountToman > 0 && (
            <div className="flex justify-between text-gold-700">
              <dt>تخفیف</dt>
              <dd className="font-black">−{formatPrice(order.discountToman)}</dd>
            </div>
          )}
          <div className="flex justify-between text-ink-600">
            <dt>هزینه ارسال</dt>
            <dd className="font-black text-ink-800">
              {order.deliveryToman === 0 ? 'رایگان' : formatPrice(order.deliveryToman)}
            </dd>
          </div>
          <div className="inv-keep-color flex justify-between rounded-xl bg-brand-600 px-2.5 py-1.5 text-white">
            <dt className="font-black">مبلغ سفارش</dt>
            <dd className="text-[11.5px] font-black">{formatPrice(order.totalToman)}</dd>
          </div>
        </dl>
      </div>

      {/* ——— شناسه پرداخت و یادداشت ——— */}
      {(order.paymentRef || order.paymentTrackId || order.paidAt || order.customerNote) && (
        <div className="mt-2 space-y-1 rounded-xl bg-cream-50 px-2.5 py-1.5 text-[9px] leading-4 text-ink-600">
          {order.paymentRef && (
            <p className="flex items-center gap-1">
              <Banknote className="h-3 w-3 text-brand-600" aria-hidden />
              {`شناسه تراکنش پرداخت: ${toFaDigits(order.paymentRef)}`}
            </p>
          )}
          {order.customerNote && <p>{`یادداشت مشتری: ${order.customerNote}`}</p>}
          {order.paymentTrackId && <p>{`شناسه پیگیری درگاه: ${toFaDigits(order.paymentTrackId)}`}</p>}
          {order.paidAt && <p>{`تاریخ پرداخت: ${formatJalaliDate(order.paidAt, { withTime: true })}`}</p>}
        </div>
      )}

      {/* ——— کادر امضا ——— */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-dashed border-cream-200 p-2 text-center">
          <p className="text-[9.5px] font-black text-ink-600">
            <Store className="ml-1 inline h-3 w-3 text-brand-600" aria-hidden />
            مهر و امضای فروشگاه
          </p>
          <div className="h-14" aria-hidden />
        </div>
        <div className="rounded-xl border border-dashed border-cream-200 p-2 text-center">
          <p className="text-[9.5px] font-black text-ink-600">
            <User className="ml-1 inline h-3 w-3 text-brand-600" aria-hidden />
            امضای تحویل‌گیرنده
          </p>
          <div className="h-14" aria-hidden />
        </div>
      </div>

      {/* ——— پاورقی ——— */}
      <footer className="mt-3 border-t border-cream-200 pt-2 text-center">
        <p className="text-[9.5px] font-black text-brand-700">
          {`با تشکر از خرید شما — ${store.fullName}`}
        </p>
        <p className="mt-0.5 text-[8.5px] text-ink-400">
          {`تاریخ چاپ: ${formatJalaliDate(data.printedAt, { withTime: true })}`}
        </p>
      </footer>
    </div>
  );
}

/** CSS صفحهٔ A5 — سایز کاغذ قفل، ابزارها حذف، رنگ‌ها حفظ */
const INVOICE_PRINT_CSS = `
.inv-root {
  min-height: 100vh;
  background: var(--color-cream-50, #fbf9f3);
}
.inv-sheet {
  width: 148mm;
  min-height: 210mm;
  background: #ffffff;
  padding: 8mm 8mm 7mm;
  color: #1c1917;
  box-shadow: 0 8px 30px rgba(28, 25, 23, 0.14);
  border-radius: 8px;
}
.inv-keep-color {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@media print {
  @page {
    size: A5 portrait;
    margin: 0;
  }
  html, body {
    background: #ffffff !important;
  }
  .no-print {
    display: none !important;
  }
  .inv-root {
    background: #ffffff !important;
    padding: 0 !important;
    min-height: auto !important;
  }
  .inv-sheet {
    width: 148mm;
    min-height: 210mm;
    margin: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
  }
}
`;
