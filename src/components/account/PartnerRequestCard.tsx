'use client';

import { useState } from 'react';
import { Handshake, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { apiPost } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { ErrorState } from '@/components/shared/States';

interface PartnerState {
  role: string;
  request: { status: string; businessName: string; message: string | null; reviewNote: string | null } | null;
}
export function PartnerRequestCard() {
  const user = useAuthStore((state) => state.user);
  const { data, loading, error, reload } = useApi<PartnerState>(user ? '/api/user/partner-request' : null);
  const [businessName, setBusinessName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user || user.role === 'ADMIN') return null;
  const partner = data?.role === 'PARTNER';
  const pending = data?.request?.status === 'PENDING';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await apiPost('/api/user/partner-request', { businessName, message });
      toast.success('درخواست همکاری برای مدیریت ارسال شد');
      reload();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'ارسال درخواست انجام نشد'); }
    finally { setBusy(false); }
  };
  return (
    <section id="partner-request" aria-label="همکاری با پارس" className="mt-4 rounded-3xl border border-brand-200 bg-white p-4 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-black text-brand-800"><Handshake className="h-5 w-5" aria-hidden />همکاری با پارس</h2>
      {loading ? <p className="mt-3 text-xs text-ink-500">در حال بررسی وضعیت همکاری…</p> : error ? (
        <ErrorState title="وضعیت همکاری بارگذاری نشد" description={error} onRetry={reload} />
      ) : partner ? (
        <p className="mt-3 rounded-2xl bg-brand-50 p-3 text-xs leading-6 text-brand-800">حساب همکار شما فعال است. قیمت هر کیلو و حداقل وزن خرید عمدهٔ محصولات برای شما نمایش داده می‌شود.</p>
      ) : pending ? (
        <div role="status" className="mt-3 rounded-2xl bg-gold-50 p-3 text-xs leading-6 text-ink-700">
          <p className="font-bold">درخواست «{data?.request?.businessName}» در انتظار بررسی مدیریت است.</p>
          <p>نتیجهٔ بررسی در همین بخش و اعلان‌های حساب شما نمایش داده می‌شود.</p>
        </div>
      ) : (
        <>
          {data?.request?.reviewNote && <p role="status" className="mt-3 rounded-xl bg-cream-100 p-3 text-xs leading-6 text-ink-700">پیام مدیریت: {data.request.reviewNote}</p>}
          <p className="mt-2 text-xs leading-6 text-ink-600">برای خرید عمده، مشخصات کسب‌وکارتان را بفرستید. پس از تأیید مدیریت، حساب شما به همکار تغییر می‌کند.</p>
          <form onSubmit={submit} className="mt-3 space-y-3">
            <div><label htmlFor="partner-business" className="text-xs font-bold text-ink-700">نام کسب‌وکار یا مجموعه</label>
              <input id="partner-business" required minLength={2} maxLength={120} value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-cream-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-brand-500" /></div>
            <div><label htmlFor="partner-message" className="text-xs font-bold text-ink-700">توضیحات همکاری (اختیاری)</label>
              <textarea id="partner-message" maxLength={1000} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-1 w-full rounded-xl border border-cream-300 p-3 text-sm focus-visible:outline-2 focus-visible:outline-brand-500" /></div>
            <button type="submit" disabled={busy || businessName.trim().length < 2} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-xs font-black text-white disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{busy ? 'در حال ارسال…' : data?.request ? 'ارسال دوبارهٔ درخواست همکاری' : 'ارسال درخواست همکاری'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
