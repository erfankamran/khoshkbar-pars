'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquare, ShieldCheck, Smartphone } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { apiGet, apiPost, ApiClientError, storeSessionToken } from '@/lib/api-client';
import { toEnDigits, toFaDigits } from '@/lib/fa';
import { normalizePhone } from '@/lib/phone';

/**
 * ورود به پنل مدیریت (فاز ۱۱.۱) — همان جریان امن OTP فروشگاه
 *
 * - هیچ مسیر یا رمز جداگانه‌ای برای ادمین وجود ندارد؛ مرز امنیتی، نقش ADMIN
 *   در دیتابیس است که در requireAdmin سمت سرور بررسی می‌شود
 * - پس از ورود: اگر نقش ADMIN نبود → پیام صریح «دسترسی ندارید» (بدون افشای
 *   جزئیات بیشتر)
 */

type Step = 'phone' | 'code';

/**
 * کد مادر محیطی — کنترل با فلگ واحد NEXT_PUBLIC_DEV_MODE در .env
 * (وضعیت توسعه کاربر): true → باکس طلایی فعال؛ false → در production حذف.
 * در dev (NODE_ENV!=production) همیشه فعال می‌ماند.
 */
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
const MASTER_CODE = process.env.NEXT_PUBLIC_OTP_MASTER_CODE || '123456';
const MASTER_ENABLED = DEV_MODE || process.env.NODE_ENV !== 'production';

interface OtpRequestResponse {
  resendAfterSeconds: number;
  devCode?: string;
}

interface VerifyResponse {
  user: { role: string };
  sessionToken?: string;
}

export default function AdminLoginPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // اگر قبلاً با حساب مدیر وارد شده → مستقیم داشبورد
  useEffect(() => {
    let alive = true;
    apiGet<VerifyResponse>('/api/auth/me')
      .then((data) => {
        if (alive && data.user?.role === 'ADMIN') router.replace('/admin');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [router]);

  // شمارش معکوس ارسال مجدد
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const requestOtp = async (targetPhone: string) => {
    setError(null);
    const normalized = normalizePhone(targetPhone);
    if (!normalized) {
      setError('شماره موبایل معتبر نیست — مثال: ۰۹۱۲۳۴۵۶۷۸۹');
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiPost<OtpRequestResponse>('/api/auth/otp/request', {
        phone: normalized,
      });
      setStep('code');
      setResendIn(data.resendAfterSeconds);
      setDevCode(data.devCode ?? null);
      setCode('');
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'ارسال کد ناموفق بود');
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (codeValue?: string) => {
    setError(null);
    // نرمال‌سازی شماره — ورود سریع با کد مادر از مرحلهٔ شماره هم ممکن است
    const ph = normalizePhone(phone);
    if (!ph) {
      setError('شماره موبایل معتبر نیست — مثال: ۰۹۱۲۳۴۵۶۷۸۹');
      return;
    }
    const normalized = toEnDigits(codeValue ?? code).replace(/\s/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      setError('کد ۶ رقمی را کامل وارد کنید');
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiPost<VerifyResponse>('/api/auth/otp/verify', {
        phone: ph,
        code: normalized,
      });
      storeSessionToken(data.sessionToken);
      if (data.user?.role !== 'ADMIN') {
        // نشست معتبر ولی بدون مجوز — خارج می‌شویم تا نشست بی‌اجازه باقی نماند
        await apiPost('/api/auth/logout').catch(() => undefined);
        setError('این حساب دسترسی مدیریتی ندارد');
        setSubmitting(false);
        return;
      }
      router.replace('/admin');
    } catch (e) {
      setCode('');
      setError(e instanceof ApiClientError ? e.message : 'تأیید کد ناموفق بود');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-950 px-4">
      <div className="w-full max-w-sm">
        {/* برند */}
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400/15 text-2xl font-black text-gold-300">
            پ
          </span>
          <h1 className="mt-3 text-lg font-black text-white">پنل مدیریت پارس</h1>
          <p className="mt-1 text-[11px] text-brand-300">
            ورود فقط با شماره موبایل دارای دسترسی مدیریتی
          </p>
        </div>

        <div className="rounded-3xl border border-brand-900 bg-white p-5 shadow-float">
          {step === 'phone' ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void requestOtp(phone);
              }}
            >
              <label htmlFor="admin-phone" className="block text-[11px] font-bold text-ink-600">
                شماره موبایل مدیر
              </label>
              <input
                id="admin-phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09123456789"
                className="h-12 w-full rounded-2xl border border-cream-200 bg-cream-50 px-4 text-center text-sm font-black tracking-widest text-ink-900 outline-none transition-colors placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-300 focus:border-brand-400"
              />

              {/* کد مادر محیطی — بسته به env؛ حذف موقت تا اتصال پیامک واقعی */}
              {MASTER_ENABLED && (
                <div className="rounded-2xl border border-dashed border-gold-400 bg-gold-100/70 px-3 py-2.5 text-center">
                  <p className="text-[11px] font-bold text-gold-800">
                    محیط تست — کد مادر:
                    <span
                      dir="ltr"
                      className="mx-1 inline-block text-base font-black tracking-[0.25em] text-gold-900"
                    >
                      {toFaDigits(MASTER_CODE)}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void verify(MASTER_CODE)}
                    className="mt-1 text-[11px] font-black text-brand-600 underline underline-offset-4"
                  >
                    ورود سریع با کد مادر (بدون پیامک)
                  </button>
                </div>
              )}

              {error && (
                <p role="alert" className="text-[11px] font-bold text-red-600">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-sm font-black text-white shadow-card transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden />
                ) : (
                  <>
                    <Smartphone className="h-4 w-4" aria-hidden />
                    دریافت کد تأیید
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <MessageSquare className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-2 text-[12px] font-black text-ink-900">کد تأیید را وارد کنید</p>
                <p dir="ltr" className="text-right text-[11px] text-ink-400">
                  {toFaDigits(phone)}
                </p>
              </div>

              <div dir="ltr" className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={(v) => setCode(v)}
                  disabled={submitting}
                  containerClassName="justify-center"
                  aria-label="کد تأیید ۶ رقمی"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <span className="mx-1 h-1 w-3 rounded-full bg-cream-200" aria-hidden />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {/* شبیه‌سازی پیامک در sandbox — در production رندر نمی‌شود */}
              {devCode && (
                <div className="rounded-2xl border border-dashed border-gold-400 bg-gold-100/70 px-3 py-2.5 text-center">
                  <p className="text-[11px] font-bold text-gold-800">
                    محیط تست — کد:
                    <span
                      dir="ltr"
                      className="mx-1 inline-block text-base font-black tracking-[0.25em] text-gold-900"
                    >
                      {toFaDigits(devCode)}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setCode(devCode)}
                    className="mt-1 text-[11px] font-black text-brand-600 underline underline-offset-4"
                  >
                    پر کردن خودکار کد
                  </button>
                </div>
              )}

              {error && (
                <p role="alert" className="text-center text-[11px] font-bold text-red-600">
                  {error}
                </p>
              )}

              {MASTER_ENABLED && (
                <p className="text-center text-[10px] text-ink-400">
                  {`کد مادر ${toFaDigits(MASTER_CODE)} نیز همیشه کار می‌کند`}
                </p>
              )}

              <button
                type="button"
                onClick={() => void verify()}
                disabled={submitting || code.length < 6}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-sm font-black text-white shadow-card transition-all active:scale-[0.98] disabled:bg-cream-200 disabled:text-ink-400 disabled:shadow-none"
              >
                {submitting ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden />
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    ورود به پنل
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-3 text-[11px]">
                <button
                  type="button"
                  onClick={() => void requestOtp(phone)}
                  disabled={resendIn > 0 || submitting}
                  className="font-bold text-brand-600 disabled:text-ink-300"
                >
                  {resendIn > 0
                    ? `ارسال مجدد کد تا ${toFaDigits(resendIn)} ثانیه`
                    : 'ارسال مجدد کد'}
                </button>
                <span className="text-ink-200" aria-hidden>
                  |
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setCode('');
                    setError(null);
                    setDevCode(null);
                  }}
                  className="font-bold text-ink-500"
                >
                  تغییر شماره
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[10px] leading-4 text-brand-400">
          همه تلاش‌های دسترسی در لاگ امنیتی ثبت می‌شود
        </p>
      </div>
    </div>
  );
}
