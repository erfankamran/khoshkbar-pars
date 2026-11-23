'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Handshake, Loader2 } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { PageHeader, EmptyState } from '@/components/admin/kit';
import { ErrorState } from '@/components/shared/States';
import { useApi } from '@/hooks/use-api';
import { apiPatch } from '@/lib/api-client';
import { formatJalaliDate } from '@/lib/jalali';
import { toFaDigits } from '@/lib/fa';

const STATUS: Record<string, string> = { PENDING: 'در انتظار بررسی', APPROVED: 'تأییدشده', REJECTED: 'ردشده', REVOKED: 'همکاری لغوشده', all: 'همه' };
interface PartnerRequest {
  id: string; status: string; businessName: string; message: string | null; reviewNote: string | null; createdAt: string;
  user: { id: string; phone: string; fullName: string | null; role: string; isActive: boolean };
}
interface Requests { requests: PartnerRequest[]; total: number; pending: number; page: number; pageSize: number }
export default function AdminPartnersPage() {
  return <AdminShell><Suspense fallback={<p>در حال بارگذاری…</p>}><PartnerRequests /></Suspense></AdminShell>;
}
function PartnerRequests() {
  const requestId = useSearchParams().get('requestId');
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error, reload } = useApi<Requests>(`/api/admin/partners?status=${status}&page=${page}${requestId ? `&requestId=${encodeURIComponent(requestId)}` : ''}`);
  const review = async (request: PartnerRequest, decision: 'APPROVE' | 'REJECT') => {
    if (busy) return;
    if (decision === 'REJECT' && !notes[request.id]?.trim()) { toast.error('دلیل رد را برای مشتری بنویسید'); return; }
    setBusy(request.id);
    try {
      await apiPatch(`/api/admin/partners/${request.id}`, { decision, reviewNote: notes[request.id] || undefined });
      toast.success(decision === 'APPROVE' ? 'حساب مشتری به همکار تغییر کرد' : 'درخواست رد شد و دلیل برای مشتری ارسال شد');
      reload();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'بررسی درخواست انجام نشد'); }
    finally { setBusy(null); }
  };
  return <div>
    <PageHeader title="درخواست‌های همکاری" desc="بررسی درخواست خرید عمده و تأیید حساب همکار؛ همکار به بخش مدیریت دسترسی ندارد" />
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label htmlFor="partner-status" className="text-xs font-bold">وضعیت درخواست</label>
      <select id="partner-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-xl border border-cream-300 bg-white px-3 text-xs">
        {Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <span className="text-xs text-ink-500">{toFaDigits(data?.pending ?? 0)} درخواست در انتظار</span>
      <button type="button" onClick={reload} className="ms-auto min-h-10 rounded-xl border border-cream-300 px-3 text-xs font-bold">تازه‌سازی</button>
      {requestId && <Link href="/admin/partners" className="text-xs font-bold text-brand-700">همهٔ درخواست‌ها</Link>}
    </div>
    {loading ? <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-label="در حال بارگذاری درخواست‌ها" /> : error ? <ErrorState title="درخواست‌ها بارگذاری نشد" description={error} onRetry={reload} /> : !data?.requests.length ? <EmptyState icon={Handshake} title="درخواستی در این وضعیت ندارید" /> : (
      <div className="grid gap-4 xl:grid-cols-2">{data.requests.map((request) => <article key={request.id} className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap justify-between gap-2"><h2 className="font-black text-ink-900">{request.businessName}</h2><span className="text-xs font-bold text-brand-700">{STATUS[request.status]}</span></div>
        <p className="mt-2 text-xs text-ink-600">{request.user.fullName || 'مشتری پارس'} — <bdi>{toFaDigits(request.user.phone)}</bdi></p>
        <p className="mt-1 text-xs text-ink-500">{formatJalaliDate(request.createdAt, { withTime: true })}</p>
        {request.message && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-cream-50 p-3 text-sm leading-7">{request.message}</p>}
        {request.reviewNote && <p className="mt-3 text-xs leading-6 text-ink-600">پیام مدیریت: {request.reviewNote}</p>}
        {request.status === 'PENDING' && <div className="mt-4 space-y-3">
          <label htmlFor={`review-note-${request.id}`} className="block text-xs font-bold">پیام برای مشتری (برای رد درخواست الزامی)</label>
          <textarea id={`review-note-${request.id}`} rows={2} maxLength={500} value={notes[request.id] || ''} onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })} className="w-full rounded-xl border border-cream-300 p-3 text-sm" />
          {!request.user.isActive && <p className="text-xs text-red-600">حساب مشتری مسدود است؛ ابتدا وضعیت حساب را بررسی کنید.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy || !request.user.isActive} onClick={() => void review(request, 'APPROVE')} className="min-h-11 flex-1 rounded-xl bg-brand-600 px-4 text-xs font-black text-white disabled:opacity-50">{busy === request.id ? 'در حال ثبت…' : 'تأیید و فعال‌سازی همکار'}</button>
            <button type="button" disabled={!!busy || !request.user.isActive} onClick={() => void review(request, 'REJECT')} className="min-h-11 rounded-xl border border-red-200 px-4 text-xs font-bold text-red-600 disabled:opacity-50">رد درخواست</button>
          </div>
        </div>}
      </article>)}</div>
    )}
    {data && data.total > data.pageSize && <nav aria-label="صفحه‌بندی درخواست‌ها" className="mt-4 flex items-center gap-3 text-xs">
      <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className="min-h-10 rounded-xl border px-3 disabled:opacity-40">قبلی</button>
      <span>صفحهٔ {toFaDigits(page)}</span><button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)} className="min-h-10 rounded-xl border px-3 disabled:opacity-40">بعدی</button>
    </nav>}
  </div>;
}
