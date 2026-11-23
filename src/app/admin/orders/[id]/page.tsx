'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  Banknote,
  CheckCircle2,
  Copy,
  Loader2,
  MapPin,
  PackageCheck,
  Phone,
  Printer,
  Save,
  Truck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { useApi } from '@/hooks/use-api';
import { apiPatch, ApiClientError } from '@/lib/api-client';
import { formatPrice, toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import type { AdminOrderDetailDTO } from '@/server/services/admin/orders-admin.service';

/**
 * جزئیات سفارش + اقدامات مدیر (فاز ۱۱.۳)
 *
 * - اقدامات فقط بر اساس وضعیت فعلی نمایش داده می‌شوند (سرور هم همان‌ها را
 *   قبول می‌کند — گذار غیرمجاز 409 می‌گیرد)
 * - لغو فقط پیش از ارسال؛ با تأیید دومرحله‌ای درجا و دلیل اختیاری که در
 *   یادداشت داخلی ثبت می‌شود
 * - ثبت ارسال بدون کد رهگیری ممکن نیست (اعتبارسنجی سمت سرور و کلاینت)
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

const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: 'پرداخت‌نشده',
  PAID: 'پرداخت‌شده',
  FAILED: 'ناموفق',
  REFUNDED: 'بازگشت‌شده',
};

const METHOD_LABELS: Record<string, string> = {
  ONLINE_GATEWAY: 'درگاه آنلاین (تستی)',
  COD: 'پرداخت در محل',
};

type Order = AdminOrderDetailDTO;

export default function AdminOrderDetailPage() {
  const { id } = (useParams() as { id: string }) ?? {};
  const valid = typeof id === 'string' && /^[a-z0-9]{20,40}$/i.test(id);
  const { data: order, loading, error, reload } = useApi<Order>(valid ? `/api/admin/orders/${id}` : null);

  const [busy, setBusy] = useState(false);
  const [trackingInput, setTrackingInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // پر کردن فرم‌ها پس از رسیدن داده — فقط یک‌بار
  useEffect(() => {
    if (order) {
      setTrackingInput(order.trackingCode ?? '');
      setNoteInput(order.adminNote ?? '');
    }
  }, [order]);

  const applyAction = async (
    action: string,
    payload?: Record<string, unknown>,
    successMsg?: string
  ) => {
    if (!valid) return;
    setBusy(true);
    try {
      await apiPatch(`/api/admin/orders/${id}`, { action, ...payload });
      toast.success(successMsg ?? 'اقدام با موفقیت ثبت شد');
      setCancelOpen(false);
      setCancelReason('');
      reload();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'اقدام ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  if (!valid || loading || !order) {
    return (
      <AdminShell>
        {error ? (
          <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-center">
            <p className="text-[13px] font-black text-red-700">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-3 h-9 rounded-xl bg-red-600 px-4 text-[11.5px] font-black text-white"
            >
              تلاش مجدد
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="shimmer h-16 rounded-3xl" aria-label="در حال بارگذاری" />
            <div className="shimmer h-40 rounded-3xl" aria-label="در حال بارگذاری" />
            <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
          </div>
        )}
      </AdminShell>
    );
  }

  const status = order.status;

  return (
    <AdminShell>
      {/* ——— سربرگ ——— */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/orders"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-cream-200 bg-white text-ink-500 transition-colors hover:bg-cream-100"
            aria-label="بازگشت به فهرست سفارش‌ها"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 dir="ltr" className="text-right text-base font-black text-ink-900">
                {order.code}
              </h1>
              <span
                className={`rounded-full px-2.5 py-1 text-[10.5px] font-black ${STATUS_TONES[status] ?? 'bg-cream-100 text-ink-500'}`}
              >
                {STATUS_LABELS[status] ?? status}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-ink-400">
              ثبت: {formatJalaliDate(order.createdAt, { withTime: true })}
            </p>
          </div>
        </div>

        {/* ——— نوار اقدام ——— */}
        <div className="flex flex-wrap items-center gap-2">
          {/* چاپ فاکتور A5 (درخواست کاربر — گزینه ۲) — مستقل از وضعیت */}
          <button
            type="button"
            onClick={() => window.open(`/shipping-label/${order.code}`, '_blank', 'noopener')}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 text-[11.5px] font-black text-brand-700 transition-colors hover:bg-brand-50"
            aria-label="چاپ برگه پستی این سفارش"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            چاپ برگه پستی
          </button>

          {status === 'PENDING_PAYMENT' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyAction('MARK_PAID', {}, 'پرداخت سفارش ثبت شد')}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white shadow-card transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Banknote className="h-4 w-4" aria-hidden />}
              ثبت پرداخت دستی
            </button>
          )}

          {status === 'PAID' && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void applyAction('START_PROCESSING', {}, 'سفارش وارد مرحله آماده‌سازی شد')
              }
              className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white shadow-card transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PackageCheck className="h-4 w-4" aria-hidden />}
              شروع آماده‌سازی
            </button>
          )}

          {status === 'PROCESSING' && (
            <ShipButton busy={busy} tracking={trackingInput} setTracking={setTrackingInput} onShip={() => void applyAction('SHIP', { trackingCode: trackingInput.trim() }, 'سفارش ارسال شد')} />
          )}

          {status === 'SHIPPED' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyAction('DELIVER', {}, 'سفارش تحویل‌شده ثبت شد')}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white shadow-card transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                ثبت تحویل
              </button>
              <button
                type="button"
                disabled={busy || trackingInput.trim().length < 4}
                onClick={() =>
                  void applyAction(
                    'UPDATE_TRACKING',
                    { trackingCode: trackingInput.trim() },
                    'کد رهگیری به‌روزرسانی شد'
                  )
                }
                className="flex h-10 items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 text-[11.5px] font-black text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-40"
              >
                <Truck className="h-3.5 w-3.5" aria-hidden />
                به‌روزرسانی کد رهگیری
              </button>
            </>
          )}

          {/* لغو — فقط پیش از ارسال */}
          {(status === 'PENDING_PAYMENT' || status === 'PAID' || status === 'PROCESSING') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setCancelOpen((v) => !v)}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 text-[12px] font-black text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
            >
              <Ban className="h-4 w-4" aria-hidden />
              لغو سفارش
            </button>
          )}
        </div>
      </div>

      {/* ——— تأیید لغو درجا (دومرحله‌ای) ——— */}
      {cancelOpen && (
        <div className="mb-4 rounded-3xl border border-red-200 bg-red-50 p-4">
          <p className="text-[12px] font-black text-red-700">
            لغو سفارش «{order.code}»؟ موجودی کالاها به انبار برمی‌گردد و این اقدام برگشت‌پذیر نیست.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={300}
              placeholder="دلیل لغو (اختیاری — در یادداشت داخلی ثبت می‌شود)"
              className="h-10 min-w-56 flex-1 rounded-xl border border-red-200 bg-white px-3 text-[12px] font-bold text-ink-900 outline-none placeholder:font-normal placeholder:text-red-300 focus:border-red-400"
              aria-label="دلیل لغو"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void applyAction(
                  'CANCEL',
                  cancelReason.trim() ? { reason: cancelReason.trim() } : {},
                  'سفارش لغو شد و موجودی بازگشت'
                )
              }
              className="h-10 rounded-xl bg-red-600 px-4 text-[12px] font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
            >
              بله، لغو شود
            </button>
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              className="h-10 rounded-xl bg-white px-3 text-[11.5px] font-black text-ink-500"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* ——— ستون اصلی: اقلام و مبالغ ——— */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
            <h2 className="mb-3 text-[13px] font-black text-ink-900">
              اقلام سفارش ({toFaDigits(order.itemCount)} قلم)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-right">
                <thead>
                  <tr className="border-b border-cream-200 text-[10.5px] font-bold text-ink-400">
                    <th className="pb-2 font-bold">کالا</th>
                    <th className="pb-2 font-bold">وزن</th>
                    <th className="pb-2 font-bold">تعداد</th>
                    <th className="pb-2 font-bold">قیمت واحد</th>
                    <th className="pb-2 font-bold">جمع ردیف</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id} className="border-b border-cream-100 last:border-0">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          {i.image ? (
                            <img
                              src={i.image}
                              alt={i.productTitle}
                              className="h-10 w-10 shrink-0 rounded-xl object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream-100 text-[8px] font-bold text-ink-300">
                              بدون
                              <br />
                              تصویر
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-extrabold text-ink-900">
                              {i.productTitle}
                            </p>
                            <Link
                              href={`/admin/products/${i.productId}`}
                              dir="ltr"
                              className="text-right text-[10px] text-ink-400 hover:text-brand-600"
                            >
                              /{i.slug}
                            </Link>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-[11.5px] text-ink-500">
                        {toFaDigits(i.weightGrams)} گرم
                      </td>
                      <td className="py-2.5 text-[11.5px] font-black text-ink-700">
                        {toFaDigits(i.quantity)}
                      </td>
                      <td className="py-2.5 text-[11.5px] text-ink-600">
                        {formatPrice(i.unitPriceToman)}
                      </td>
                      <td className="py-2.5 text-[11.5px] font-black text-brand-700">
                        {formatPrice(i.lineTotalToman)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* جمع‌ها */}
            <dl className="mt-4 space-y-1.5 border-t border-cream-200 pt-3 text-[12px]">
              <div className="flex justify-between text-ink-600">
                <dt>جمع کالاها</dt>
                <dd className="font-bold">{formatPrice(order.subtotalToman)}</dd>
              </div>
              {order.discountToman > 0 && (
                <div className="flex justify-between text-gold-700">
                  <dt>تخفیف</dt>
                  <dd className="font-bold">{formatPrice(order.discountToman)}</dd>
                </div>
              )}
              <div className="flex justify-between text-ink-600">
                <dt>هزینه ارسال</dt>
                <dd className="font-bold">
                  {order.deliveryToman === 0 ? 'رایگان' : formatPrice(order.deliveryToman)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-cream-200 pt-2 text-[13.5px] font-black text-ink-900">
                <dt>مبلغ نهایی</dt>
                <dd className="text-brand-700">{formatPrice(order.totalToman)}</dd>
              </div>
            </dl>
          </div>

          {/* یادداشت داخلی مدیر */}
          <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
            <h2 className="mb-2 text-[13px] font-black text-ink-900">یادداشت داخلی مدیر</h2>
            <p className="mb-2 text-[10.5px] text-ink-400">
              فقط برای تیم پنل نمایش داده می‌شود — مشتری آن را نمی‌بیند
            </p>
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="مثلاً: هماهنگی تلفنی برای زمان ارسال…"
              className="w-full resize-none rounded-2xl border border-cream-200 bg-cream-50 p-3 text-[12.5px] font-bold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300 focus:border-brand-400"
              aria-label="یادداشت داخلی مدیر"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                disabled={busy || noteInput === (order.adminNote ?? '')}
                onClick={() => void applyAction('SET_ADMIN_NOTE', { adminNote: noteInput.trim() }, 'یادداشت ذخیره شد')}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-ink-800 px-4 text-[11.5px] font-black text-white transition-all active:scale-[0.98] disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5" aria-hidden />
                ذخیره یادداشت
              </button>
            </div>
          </div>
        </div>

        {/* ——— ستون کنار: مشتری، آدرس، پرداخت ——— */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
            <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-black text-ink-900">
              <User className="h-4 w-4 text-brand-600" aria-hidden />
              مشتری
            </h2>
            <p className="text-[12.5px] font-extrabold text-ink-900">
              {order.customer.fullName ?? 'بدون نام'}
            </p>
            <a
              href={`tel:${order.customer.phone}`}
              dir="ltr"
              className="mt-1 flex w-fit items-center gap-1 text-right text-[12px] font-bold text-brand-700"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {toFaDigits(order.customer.phone)}
            </a>
          </div>

          <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
            <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-black text-ink-900">
              <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
              آدرس ارسال
            </h2>
            <dl className="space-y-1.5 text-[11.5px]">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">گیرنده</dt>
                <dd className="font-bold text-ink-900">{order.address.receiverName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">تلفن</dt>
                <dd dir="ltr" className="text-right font-bold text-ink-900">
                  <a href={`tel:${order.address.receiverPhone}`} className="font-bold text-brand-700" aria-label="تماس با گیرنده سفارش"><bdi>{toFaDigits(order.address.receiverPhone)}</bdi></a>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">استان / شهر</dt>
                <dd className="font-bold text-ink-900">
                  {order.address.province} / {order.address.city}
                </dd>
              </div>
              {order.address.postalCode && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-400">کدپستی</dt>
                  <dd dir="ltr" className="text-right font-bold text-ink-900">
                    {toFaDigits(order.address.postalCode)}
                  </dd>
                </div>
              )}
              <div className="pt-1">
                <dt className="mb-0.5 text-ink-400">نشانی کامل</dt>
                <dd className="leading-5 font-bold text-ink-800">{order.address.fullAddress}</dd>
              </div>
              {order.address.latitude != null && order.address.longitude != null && (
                <div className="pt-1">
                  <dt className="mb-0.5 text-ink-400">موقعیت دقیق تحویل</dt>
                  <dd>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${order.address.latitude}&mlon=${order.address.longitude}#map=17/${order.address.latitude}/${order.address.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-1.5 text-[11px] font-black text-brand-700 transition-colors hover:bg-brand-100"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      مشاهده پین تحویل روی نقشه
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
            <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-black text-ink-900">
              <Banknote className="h-4 w-4 text-brand-600" aria-hidden />
              پرداخت
            </h2>
            <dl className="space-y-1.5 text-[11.5px]">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">روش</dt>
                <dd className="font-bold text-ink-900">
                  {order.paymentMethod
                    ? (METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod)
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">وضعیت</dt>
                <dd>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                      order.paymentStatus === 'PAID'
                        ? 'bg-brand-50 text-brand-700'
                        : order.paymentStatus === 'REFUNDED'
                          ? 'bg-gold-100 text-gold-700'
                          : order.paymentStatus === 'FAILED'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-cream-100 text-ink-500'
                    }`}
                  >
                    {PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}
                  </span>
                </dd>
              </div>
              {order.paidAt && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-400">زمان پرداخت</dt>
                  <dd className="font-bold text-ink-900">
                    {formatJalaliDate(order.paidAt, { withTime: true })}
                  </dd>
                </div>
              )}
              {order.paymentRef && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-ink-400">شناسه تراکنش</dt>
                  <dd dir="ltr" className="flex items-center gap-1 text-right font-bold text-ink-700">
                    {order.paymentRef.startsWith('SANDBOX') && (
                      <span className="rounded-full bg-gold-100 px-1.5 py-0.5 text-[9px] font-black text-gold-700">
                        تستی
                      </span>
                    )}
                    {order.paymentRef}
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(order.paymentRef ?? '');
                        toast.success('شناسه کپی شد');
                      }}
                      className="text-ink-300 transition-colors hover:text-brand-600"
                      aria-label="کپی شناسه تراکنش"
                    >
                      <Copy className="h-3 w-3" aria-hidden />
                    </button>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* کد رهگیری / یادداشت مشتری */}
          {(order.trackingCode || order.customerNote) && (
            <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              {order.trackingCode && (
                <div className="mb-3">
                  <h2 className="mb-1 flex items-center gap-1.5 text-[13px] font-black text-ink-900">
                    <Truck className="h-4 w-4 text-brand-600" aria-hidden />
                    کد رهگیری
                  </h2>
                  <p dir="ltr" className="flex items-center gap-1.5 text-right text-[12.5px] font-black text-ink-800">
                    <BadgeCheck className="h-4 w-4 text-brand-500" aria-hidden />
                    {order.trackingCode}
                  </p>
                </div>
              )}
              {order.customerNote && (
                <div>
                  <h2 className="mb-1 text-[13px] font-black text-ink-900">یادداشت مشتری</h2>
                  <p className="text-[11.5px] leading-5 text-ink-600">{order.customerNote}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

/** دکمه ثبت ارسال — کد رهگیری را درجا می‌گیرد (بدون آن ارسال ممنوع) */
function ShipButton({
  busy,
  tracking,
  setTracking,
  onShip,
}: {
  busy: boolean;
  tracking: string;
  setTracking: (v: string) => void;
  onShip: () => void;
}) {
  const ok = /^[A-Za-z0-9-]{4,40}$/.test(tracking.trim());
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={tracking}
        onChange={(e) => setTracking(e.target.value)}
        dir="ltr"
        maxLength={40}
        placeholder="کد رهگیری پست"
        className="h-10 w-44 rounded-xl border border-cream-200 bg-white px-3 text-[12px] font-black text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300 focus:border-brand-400"
        aria-label="کد رهگیری پست"
      />
      <button
        type="button"
        disabled={busy || !ok}
        onClick={onShip}
        className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white shadow-card transition-all active:scale-[0.98] disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Truck className="h-4 w-4" aria-hidden />}
        ثبت ارسال
      </button>
    </div>
  );
}
