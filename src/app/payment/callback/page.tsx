'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { toFaDigits } from '@/lib/fa';

/**
 * صفحه بازگشت از درگاه پرداخت (فاز ۱۶) — /payment/callback
 *
 * زیبال کاربر را با ?trackId=&success=&status=&orderId= به اینجا برمی‌گرداند.
 * پارامتر success جعل‌پذیر است — این صفحه فقط POST /api/payments/verify
 * می‌زند و نتیجه را از پاسخ وریفای سمت سرور (v1/verify زیبال) نشان می‌دهد.
 */

interface VerifyResp {
  ok: boolean;
  data?: {
    verified: boolean;
    alreadyPaid: boolean;
    code: string;
    gatewayResult: number | null;
    gatewayStatus: number | null;
    gatewayMessage: string;
    refNumber: string | null;
  };
  error?: { code: string; message: string };
}

const ZIBAL_STATUS_LABELS: Record<string, string> = {
  '-1': 'در انتظار پرداخت',
  '-2': 'خطای داخلی درگاه',
  '1': 'پرداخت‌شده — تأییدشده',
  '2': 'پرداخت‌شده — تأییدنشده',
  '3': 'لغو شده توسط کاربر',
  '4': 'شماره کارت نامعتبر است',
  '5': 'موجودی حساب کافی نیست',
  '6': 'رمز واردشده اشتباه است',
  '10': 'صادرکننده کارت نامعتبر است',
  '11': 'خطای سوییچ بانکی',
  '12': 'کارت قابل دسترسی نیست',
};

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <p className="text-[13px] font-bold text-ink-500">در حال بررسی…</p>
        </Shell>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-cream-50 px-4"
      lang="fa"
    >
      <div className="w-full max-w-sm rounded-3xl border border-cream-200 bg-white p-6 text-center shadow-card">
        <p className="mb-1 text-[15px] font-black text-brand-800">فروشگاه پارس</p>
        <p className="mb-4 text-[11px] text-ink-400">نتیجه پرداخت آنلاین</p>
        {children}
      </div>
    </div>
  );
}

function CallbackContent() {
  const params = useSearchParams();
  const code = params.get('order') ?? '';
  const trackId = params.get('trackId') ?? '';
  const calledRef = useRef(false);

  const [state, setState] = useState<'verifying' | 'ok' | 'failed' | 'invalid'>('verifying');
  const [message, setMessage] = useState('در حال بررسی پرداخت…');
  const [refNumber, setRefNumber] = useState<string | null>(null);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    void (async () => {
      if (!code || !trackId) {
        setState('invalid');
        setMessage('پارامترهای بازگشت از درگاه کامل نیست');
        return;
      }
      try {
        const res = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, trackId }),
        });
        const body = (await res.json().catch(() => ({}))) as VerifyResp;
        if (res.status === 401) {
          setState('failed');
          setMessage('برای بررسی پرداخت ابتدا با شماره موبایل وارد حساب شوید');
          return;
        }
        if (!res.ok || !body.data) {
          setState('failed');
          setMessage(body.error?.message ?? 'بررسی پرداخت ناموفق بود');
          return;
        }
        const d = body.data;
        if (d.verified) {
          setState('ok');
          setMessage(d.gatewayMessage);
          setRefNumber(d.refNumber);
        } else {
          setState('failed');
          const statusLabel = d.gatewayStatus !== null && ZIBAL_STATUS_LABELS[String(d.gatewayStatus)];
          setMessage(statusLabel ? `${d.gatewayMessage} — ${statusLabel}` : d.gatewayMessage);
        }
      } catch {
        setState('failed');
        setMessage('ارتباط با سرور برقرار نشد — دوباره تلاش کنید');
      }
    })();
  }, [code, trackId]);

  return (
    <Shell>
      {state === 'verifying' && (
        <div className="flex flex-col items-center gap-3 py-2" role="status">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" aria-hidden />
          <p className="text-[13px] font-bold text-ink-600">{message}</p>
          {code && (
            <p className="text-[11px] text-ink-400" dir="ltr">
              {toFaDigits(code)}
            </p>
          )}
        </div>
      )}

      {state === 'ok' && (
        <div className="flex flex-col items-center gap-2 py-2" role="status">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden />
          <p className="text-[14px] font-black text-emerald-600">پرداخت با موفقیت انجام شد</p>
          <p className="text-[11.5px] leading-5 text-ink-500">{message}</p>
          {code && (
            <p className="text-[11px] text-ink-400" dir="ltr">
              {`سفارش: ${toFaDigits(code)}`}
            </p>
          )}
          {refNumber && (
            <p className="text-[11px] text-ink-400" dir="ltr">
              {`شماره پیگیری: ${toFaDigits(refNumber)}`}
            </p>
          )}
        </div>
      )}

      {(state === 'failed' || state === 'invalid') && (
        <div className="flex flex-col items-center gap-2 py-2" role="alert">
          <XCircle className="h-12 w-12 text-red-400" aria-hidden />
          <p className="text-[14px] font-black text-red-500">پرداخت انجام نشد</p>
          <p className="text-[11.5px] leading-5 text-ink-500">{message}</p>
          {code && (
            <p className="text-[11px] text-ink-400" dir="ltr">
              {`سفارش: ${toFaDigits(code)}`}
            </p>
          )}
          <p className="mt-1 text-[10.5px] leading-5 text-ink-400">
            در صورت کسر مبلغ از حساب، حداکثر تا ۷۲ ساعت به‌صورت خودکار بازگشت داده می‌شود.
          </p>
        </div>
      )}

      <Link
        href="/"
        className="mt-4 flex h-11 w-full items-center justify-center rounded-2xl bg-brand-500 text-[13px] font-black text-white shadow-card transition-all active:scale-[0.98] active:bg-brand-700"
      >
        بازگشت به فروشگاه
      </Link>
    </Shell>
  );
}
