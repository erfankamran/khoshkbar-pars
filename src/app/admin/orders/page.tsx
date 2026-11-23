'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Eye, RefreshCw, Search, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { IranProvinceMap } from '@/components/admin/IranProvinceMap';
import {
  EmptyState,
  ORDER_ALLOWED_TRANSITIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  PageHeader,
  Pill,
  Toolbar,
  mutationError,
} from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { apiGet, apiPatch } from '@/lib/api-client';
import type { AdminOrderDetailDTO } from '@/server/services/admin/orders-admin.service';
import { formatPrice, formatWeight, toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * مدیریت سفارش‌ها (فاز ۱۴ + نقشهٔ پراکندگی فاکتورهای فروش — درخواست کاربر)
 * — فیلتر وضعیت، جستجو، جزئیات، گذار وضعیت
 * — نقشهٔ وکتوری ایران به تفکیک استان با اینپوت رنگی و کلید فعال/غیرفعال
 * API: /api/admin/orders (+ [id] + geo) — گذارها با ماشین وضعیت سمت سرور کنترل می‌شوند
 */

interface OrderRow {
  id: string;
  code: string;
  status: string;
  totalToman: number;
  subtotalToman: number;
  discountToman: number;
  deliveryToman: number;
  paymentMethod: string | null;
  paymentStatus: string;
  trackingCode: string | null;
  adminNote: string | null;
  customerNote: string | null;
  createdAt: string;
  user: { id: string; phone: string; fullName: string | null };
  _count: { items: number };
}

interface OrdersResp {
  orders: OrderRow[];
  total: number;
  counts: Record<string, number>;
}

/** پراکندگی جغرافیایی فاکتورهای فروش — GET /api/admin/orders/geo */
interface OrdersGeoResp {
  provinces: Array<{ name: string; ordersCount: number; revenueToman: number; cities: string[] }>;
  invoicesTotal: number;
  revenueTotal: number;
}

const STATUS_TABS = [
  { key: 'all', label: 'همه' },
  { key: 'PENDING_PAYMENT', label: 'در انتظار پرداخت' },
  { key: 'PAID', label: 'پرداخت‌شده' },
  { key: 'PROCESSING', label: 'آماده‌سازی' },
  { key: 'SHIPPED', label: 'ارسال‌شده' },
  { key: 'DELIVERED', label: 'تحویل‌شده' },
  { key: 'CANCELED', label: 'لغو شده' },
];

const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: 'پرداخت‌نشده',
  PAID: 'پرداخت‌شده',
  FAILED: 'ناموفق',
  REFUNDED: 'بازگشت‌شده',
};

export default function AdminOrdersPage() {
  return (
    <AdminShell>
      <OrdersContent />
    </AdminShell>
  );
}

function OrdersContent() {
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<string | null>(null);

  const { data, loading, error, reload } = useApi<OrdersResp>(
    `/api/admin/orders?page=1&pageSize=50&status=${status}&q=${encodeURIComponent(q)}`
  );
  const { data: geo } = useApi<OrdersGeoResp>('/api/admin/orders/geo');

  return (
    <div>
      <PageHeader
        title="سفارش‌ها"
        desc="پیگیری و تغییر وضعیت سفارش‌های فروشگاه"
        action={
          <button
            type="button"
            onClick={reload}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-cream-100 text-ink-500 hover:bg-cream-200"
            aria-label="بازخوانی"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
        }
      />

      {/* تب‌های وضعیت با شمارش */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatus(t.key)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-black transition-colors ${
              status === t.key ? 'bg-brand-600 text-white' : 'bg-white text-ink-500 ring-1 ring-cream-200 hover:bg-cream-50'
            }`}
          >
            {t.label}
            <span className={status === t.key ? 'text-brand-100' : 'text-ink-300'}>
              {toFaDigits(data?.counts?.[t.key] ?? 0)}
            </span>
          </button>
        ))}
      </div>

      <Toolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی کد سفارش یا شماره مشتری…"
            className="h-9 border-0 bg-cream-50 pr-9 text-[12px]"
          />
        </div>
      </Toolbar>

      {/* ——— نقشهٔ وکتوری پراکندگی فاکتورهای فروش به تفکیک استان (درخواست کاربر) ———
          رنگ‌آمیزی بر تعداد فاکتور؛ اینپوت رنگی + کلید فعال/غیرفعال در سربرگ کارت ——— */}
      <IranProvinceMap
        title="پراکندگی فاکتورهای فروش — نقشهٔ ایران"
        storageKey="pars-admin-map-orders"
        defaultColor="#a67d26"
        unitLabel="فاکتور"
        provinces={(geo?.provinces ?? []).map((p) => ({
          name: p.name,
          value: p.ordersCount,
          detail: `مبلغ فروش: ${formatPrice(p.revenueToman)}`,
          cities: p.cities,
        }))}
        emptyText="هنوز فاکتوری با آدرس مشخص ثبت نشده است"
        footerChips={
          geo && geo.revenueTotal > 0 ? (
            <span className="rounded-xl bg-gold-100 px-2.5 py-1 text-gold-700">
              مبلغ کل فاکتورها: {formatPrice(geo.revenueTotal)}
            </span>
          ) : undefined
        }
      />

      {loading ? (
        <div className="shimmer h-96 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={ShoppingBag} title="دریافت سفارش‌ها ناموفق بود" hint={error ?? undefined} />
      ) : data.orders.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="سفارشی در این فیلتر نیست" />
      ) : (
        <>
          {/* موبایل — کارت‌های سفارش (کلیک روی کارت = جزئیات) */}
          <div className="space-y-2.5 md:hidden">
            {data.orders.map((o) => (
              <OrderCard key={o.id} o={o} onOpen={() => setDetail(o.id)} />
            ))}
          </div>

          {/* دسکتاپ — جدول کامل */}
          <div className="hidden overflow-hidden rounded-3xl border border-cream-200 bg-white md:block">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50/70 text-[10.5px] text-ink-400">
                  <th className="px-4 py-3 font-bold">کد</th>
                  <th className="px-3 py-3 font-bold">مشتری</th>
                  <th className="px-3 py-3 font-bold">اقلام</th>
                  <th className="px-3 py-3 font-bold">مبلغ کل</th>
                  <th className="px-3 py-3 font-bold">پرداخت</th>
                  <th className="px-3 py-3 font-bold">وضعیت</th>
                  <th className="px-3 py-3 font-bold">تاریخ</th>
                  <th className="px-3 py-3 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-b border-cream-100 last:border-0 hover:bg-cream-50/50">
                    <td className="px-4 py-3">
                      <p dir="ltr" className="text-right font-mono text-[11px] font-black text-ink-900">
                        {o.code}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-[12px] font-bold text-ink-800">{o.user.fullName ?? 'مشتری پارس'}</p>
                      <p dir="ltr" className="text-right text-[10px] text-ink-400">
                        {o.user.phone}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-[12px] font-bold text-ink-700">
                      {toFaDigits(o._count.items)} قلم
                    </td>
                    <td className="px-3 py-3 text-[12px] font-black text-ink-900">
                      {formatPrice(o.totalToman)}
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone={o.paymentStatus === 'PAID' ? 'brand' : o.paymentStatus === 'REFUNDED' ? 'gold' : 'ink'}>
                        {PAYMENT_LABELS[o.paymentStatus] ?? o.paymentStatus}
                      </Pill>
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone={ORDER_STATUS_TONES[o.status] ?? 'ink'}>
                        {ORDER_STATUS_LABELS[o.status] ?? o.status}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-[10.5px] text-ink-400">
                      {formatJalaliDate(o.createdAt, { withTime: true })}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setDetail(o.id)}
                        className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600 hover:bg-cream-200"
                      >
                        <Eye className="h-3 w-3" aria-hidden />
                        جزئیات
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail && (
        <OrderDetailDialog
          id={detail}
          onClose={() => setDetail(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

/**
 * کارت سفارش موبایل — کل کارت کلیک‌پذیر (جزئیات)
 */
function OrderCard({ o, onOpen }: { o: OrderRow; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen();
      }}
      aria-label={`مشاهده جزئیات سفارش ${o.code}`}
      className="cursor-pointer rounded-2xl border border-cream-200 bg-white p-3.5 transition-colors active:bg-cream-50"
    >
      <div className="flex items-center justify-between gap-2">
        <p dir="ltr" className="font-mono text-[12px] font-black text-ink-900">
          {o.code}
        </p>
        <Pill tone={ORDER_STATUS_TONES[o.status] ?? 'ink'}>
          {ORDER_STATUS_LABELS[o.status] ?? o.status}
        </Pill>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-ink-800">
            {o.user.fullName ?? 'مشتری پارس'}
          </p>
          <p dir="ltr" className="text-right text-[10px] text-ink-400">
            {o.user.phone}
          </p>
        </div>
        <Pill tone={o.paymentStatus === 'PAID' ? 'brand' : o.paymentStatus === 'REFUNDED' ? 'gold' : 'ink'}>
          {PAYMENT_LABELS[o.paymentStatus] ?? o.paymentStatus}
        </Pill>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-cream-100 pt-2.5">
        <p className="text-[12.5px] font-black text-ink-900">
          {formatPrice(o.totalToman)} تومان
        </p>
        <p className="truncate text-[10.5px] text-ink-400">
          {toFaDigits(o._count.items)} قلم — {formatJalaliDate(o.createdAt)}
        </p>
        <span className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600">
          <Eye className="h-3 w-3" aria-hidden />
          جزئیات
        </span>
      </div>
    </div>
  );
}

function OrderDetailDialog({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<AdminOrderDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [tracking, setTracking] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      // GET حالا DTO تخت برمی‌گرداند — هم‌قرارداد با صفحهٔ جزئیات پنل
      const d = await apiGet<AdminOrderDetailDTO>(`/api/admin/orders/${id}`);
      setData(d);
      setStatus(d.status);
      setTracking(d.trackingCode ?? '');
      setNote(d.adminNote ?? '');
    } catch (e) {
      setError(mutationError(e));
    }
  };

  // بارگذاری اولیه — یک‌بار به‌ازای id
  useEffect(() => {
    void load();
     
  }, [id]);

  const save = async () => {
    setSaving(true);
    try {
      await apiPatch(`/api/admin/orders/${id}`, {
        ...(status !== (data?.status ?? '') ? { status } : {}),
        trackingCode: tracking || null,
        adminNote: note || null,
      });
      toast.success('سفارش به‌روزرسانی شد');
      onChanged();
      await load();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">خطا</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-red-600">{error}</p>
        </DialogContent>
      </Dialog>
    );
  }

  if (!data) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <div className="shimmer h-72 rounded-2xl" aria-label="در حال بارگذاری" />
        </DialogContent>
      </Dialog>
    );
  }

  // آدرس Snapshot — در DTO تخت سرور هم‌اکنون parse شده است
  const address = data.address;

  const allowed = ORDER_ALLOWED_TRANSITIONS[data.status] ?? [];
  const transitionOptions = [data.status, ...allowed].filter(
    (s, i, arr) => arr.indexOf(s) === i
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-h-[94dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-right">
            <span dir="ltr" className="font-mono text-[13px]">{data.code}</span>
            <Pill tone={ORDER_STATUS_TONES[data.status] ?? 'ink'}>
              {ORDER_STATUS_LABELS[data.status] ?? data.status}
            </Pill>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* مشتری و آدرس */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-cream-200 p-3">
              <p className="mb-1.5 text-[11px] font-black text-ink-500">مشتری</p>
              <p className="text-[12.5px] font-black text-ink-900">{data.customer.fullName ?? 'مشتری پارس'}</p>
              <a href={`tel:${data.customer.phone}`} dir="ltr" className="inline-block min-h-10 py-2 text-right text-[11px] font-bold text-brand-700">{data.customer.phone}</a>
            </div>
            <div className="rounded-2xl border border-cream-200 p-3">
              <p className="mb-1.5 text-[11px] font-black text-ink-500">آدرس تحویل</p>
              <p className="text-[11.5px] leading-6 text-ink-700">
                {address.province}، {address.city} — {address.fullAddress ?? '—'}
              </p>
              <p className="text-[10.5px] text-ink-400">
                گیرنده: {address.receiverName ?? '—'} ({address.receiverPhone ?? '—'})
              </p>
            </div>
          </section>

          {/* اقلام */}
          <section className="rounded-2xl border border-cream-200 p-3">
            <p className="mb-2 text-[11px] font-black text-ink-500">اقلام سفارش</p>
            <div className="space-y-1.5">
              {data.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-2 rounded-xl bg-cream-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-bold text-ink-800">{it.productTitle}</p>
                    <p className="text-[10px] text-ink-400">
                      {formatWeight(it.weightGrams)} × {toFaDigits(it.quantity)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[11.5px] font-black text-ink-900">
                    {formatPrice(it.lineTotalToman)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-2.5 space-y-1 border-t border-dashed border-cream-200 pt-2.5 text-[11.5px]">
              <div className="flex justify-between text-ink-500">
                <span>جمع اقلام</span>
                <span>{formatPrice(data.subtotalToman)} تومان</span>
              </div>
              {data.discountToman > 0 && (
                <div className="flex justify-between text-gold-600">
                  <span>تخفیف</span>
                  <span>−{formatPrice(data.discountToman)}</span>
                </div>
              )}
              <div className="flex justify-between text-ink-500">
                <span>ارسال</span>
                <span>{data.deliveryToman === 0 ? 'رایگان' : formatPrice(data.deliveryToman)}</span>
              </div>
              <div className="flex justify-between text-[13px] font-black text-ink-900">
                <span>مبلغ نهایی</span>
                <span>{formatPrice(data.totalToman)} تومان</span>
              </div>
            </div>
          </section>

          {data.customerNote && (
            <div className="rounded-2xl bg-gold-50 p-3 text-[11.5px] text-gold-700">
              یادداشت مشتری: {data.customerNote}
            </div>
          )}

          {/* مدیریت */}
          <section className="rounded-2xl border border-cream-200 p-3">
            <p className="mb-2 text-[11px] font-black text-ink-500">مدیریت سفارش</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>وضعیت</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {transitionOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ORDER_STATUS_LABELS[s] ?? s}
                        {allowed.includes(s) ? '' : ' (فعلی)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {status === 'CANCELED' && data.status !== 'CANCELED' && (
                  <p className="flex items-center gap-1 text-[10px] font-bold text-red-600">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    لغو سفارش موجودی اقلام را برمی‌گرداند
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="od-tracking">کد رهگیری پستی</Label>
                <Input
                  id="od-tracking"
                  dir="ltr"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  className="h-9 text-left font-mono text-[12px]"
                  placeholder="—"
                />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="od-note">یادداشت داخلی مدیر</Label>
              <Textarea
                id="od-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-16 text-[12px]"
                rows={2}
              />
            </div>
            <p className="mt-2 text-[10.5px] text-ink-400">
              وضعیت پرداخت: {PAYMENT_LABELS[data.paymentStatus] ?? data.paymentStatus}
              {data.paymentMethod ? ` — روش: ${data.paymentMethod === 'COD' ? 'پرداخت در محل' : data.paymentRef?.startsWith('SANDBOX') ? 'درگاه آنلاین (تستی)' : 'درگاه آنلاین (زیبال)'}` : ''}
              {data.shippingMethodName ? ` — ارسال: ${data.shippingMethodName}${data.shippingMethodEta ? ` (${data.shippingMethodEta})` : ''}` : ''}
            </p>
          </section>
        </div>

        <div className="flex flex-row-reverse gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-5 text-[12.5px] font-black text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            ذخیره تغییرات
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-cream-200 px-4 text-[12px] font-bold text-ink-600 hover:bg-cream-100"
          >
            بستن
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// هم‌قرارداد با DTO تخت فاز ۱۱.۳ (درخواست کاربر — چاپ فاکتور)
