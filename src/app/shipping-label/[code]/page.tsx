'use client';
import { useParams } from 'next/navigation';
import { Printer, Truck } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { ErrorState } from '@/components/shared/States';
import { formatWeight, toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import type { ShippingLabelDTO } from '@/server/services/shipping-label.service';

export default function ShippingLabelPage() {
  const { code } = useParams<{ code: string }>();
  const valid = /^PARS-\d{8}-[A-Z2-9]{4}$/.test(code);
  const { data, loading, error, reload } = useApi<ShippingLabelDTO>(valid ? `/api/shipping-label/${code}` : null);
  return <main className="postal-root min-h-screen bg-cream-50 pb-8" dir="rtl">
    <style>{PRINT_CSS}</style>
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-white p-4">
      <h1 className="text-sm font-black">برگهٔ پستی سفارش — ویژهٔ مدیریت</h1>
      <button type="button" disabled={!data} onClick={() => window.print()} className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-xs font-bold text-white disabled:opacity-40"><Printer className="h-4 w-4" aria-hidden />چاپ برگه پستی</button>
    </div>
    {!valid ? <ErrorState title="کد سفارش نامعتبر است" /> : loading ? <p className="p-6 text-sm">در حال بارگذاری برگه پستی…</p> : error ? <ErrorState title="برگه پستی بارگذاری نشد" description={error} onRetry={reload} /> : data && <div className="mx-auto max-w-4xl overflow-x-auto p-4">
      <article className="postal-sheet mx-auto bg-white text-ink-900">
        <header className="flex items-start justify-between gap-3 border-b-2 border-black pb-3"><div><p className="text-lg font-black">{data.store.fullName}</p><p className="mt-1 text-xs">برگهٔ مشخصات مرسوله پستی</p></div><div className="text-end"><p className="font-bold" dir="ltr">{data.code}</p><p className="mt-1 text-xs">{formatJalaliDate(data.createdAt)}</p></div></header>
        <section className="mt-4 rounded-2xl border border-black p-4"><h2 className="font-black">فرستنده</h2><p className="mt-2 font-bold">{data.store.fullName}</p><p className="mt-1 leading-7">{data.store.address || 'نشانی فروشگاه هنوز در تنظیمات ثبت نشده است'}</p><div className="mt-2 flex flex-wrap justify-between gap-2 text-sm"><p>تلفن: <bdi>{toFaDigits(data.store.supportPhone)}</bdi></p><p>کدپستی: <bdi>{toFaDigits(data.store.postalCode) || '—'}</bdi></p></div></section>
        <section className="mt-4 rounded-2xl border-2 border-black p-4"><h2 className="text-lg font-black">گیرنده: {data.recipient.receiverName}</h2><p className="mt-3 text-base leading-8">{[data.recipient.province, data.recipient.city, data.recipient.fullAddress].filter(Boolean).join('، ')}</p><p className="mt-3 font-bold">تلفن: <a href={`tel:${data.recipient.receiverPhone}`}><bdi>{toFaDigits(data.recipient.receiverPhone)}</bdi></a></p><p className="mt-2 font-bold">کدپستی: <bdi>{toFaDigits(data.recipient.postalCode || '') || '—'}</bdi></p></section>
        <footer className="mt-4 space-y-2 text-sm"><p className="flex items-center gap-2"><Truck className="h-4 w-4" aria-hidden />روش ارسال: {data.shippingMethodName || '—'}</p><p>وزن کالاهای سفارش: {formatWeight(data.weightGrams)}</p>{data.trackingCode && <p>کد رهگیری پست: <bdi>{toFaDigits(data.trackingCode)}</bdi></p>}</footer>
      </article>
    </div>}
  </main>;
}
const PRINT_CSS = `
.postal-sheet{width:148mm;min-height:200mm;padding:8mm;font-size:13px;box-shadow:0 5px 20px #0001;}
@media print{@page{size:A5 portrait;margin:0}.no-print{display:none!important}.postal-root{background:white!important;padding:0!important}.postal-root>div{padding:0!important;overflow:visible!important}.postal-sheet{width:148mm;min-height:210mm;box-shadow:none;margin:0!important}body{background:white!important}}
`;
