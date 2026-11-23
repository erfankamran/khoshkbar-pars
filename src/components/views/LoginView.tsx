'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, Loader2, MessageSquare, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { TopBar } from '@/components/shared/TopBar';
import { apiGet, apiPost, ApiClientError, storeSessionToken } from '@/lib/api-client';
import {
  loginWithPasskey,
  registerPasskey,
  webAuthnSupported,
} from '@/lib/webauthn-client';
import { toEnDigits, toFaDigits } from '@/lib/fa';
import { normalizePhone } from '@/lib/phone';
import { useAuthStore, type AuthUser } from '@/stores/auth-store';
import { useCartStore, type CartDTO } from '@/stores/cart-store';
import { useRouterStore } from '@/stores/router-store';

/**
 * ورود با شماره موبایل — OTP بدون رمز (فاز ۹، بخش ۱۴ مشخصات)
 *
 * جریان: شماره موبایل → کد ۶ رقمی (۵ دقیقه اعتبار) → تأیید و ورود
 * - سرد شدن ۶۰ ثانیه بین درخواست‌ها (شمارش معکوس در UI)
 * - کد در sandbox شبیه‌سازی می‌شود: devCode در محیط تست نمایش داده می‌شود
 *   (در production با سرویس پیامک جایگزین می‌شود و این ناحیه رندر نمی‌شود)
 * - پس از ورود: سبد مهمان با سبد کاربر ادغام شده و از پاسخ سرور اعمال می‌شود
 *
 * فاز Passkey:
 * - «ورود با Passkey» روی مرحلهٔ شماره — فقط وقتی مرورگر WebAuthn دارد
 * - پس از ورود OTP، اگر کاربر هنوز Passkey ندارد → پیشنهاد ذخیره روش ورود
 *   (Google Password Manager / iCloud Keychain / گذرواژه‌بان سازگار —
 *   محل ذخیره با تنظیمات دستگاه کاربر است، نه انتخاب ما)
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
  expiresInSeconds: number;
  resendAfterSeconds: number;
  devCode?: string;
}

interface OtpVerifyResponse {
  user: AuthUser;
  cart: CartDTO;
  /** توکن نشست — برای فال‌بک هدر در محیط بی‌کوکی (iframe بین‌سایتی) */
  sessionToken?: string;
}

/**
 * redirect: مقصد پس از ورود موفق (مثلاً checkout هنگام ورود از سبد خرید) —
 * بدون آن کاربر به نمای قبلی برمی‌گردد.
 */
export function LoginView({ redirect }: { redirect?: string }) {
  const back = useRouterStore((s) => s.back);
  const replace = useRouterStore((s) => s.replace);
  const push = useRouterStore((s) => s.push);
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // فاز Passkey — پشتیبانی مرورگر فقط سمت کلاینت چک می‌شود (بدون mismatch هیدراتیشن)
  const [passkeyReady, setPasskeyReady] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  // پیشنهاد ثبت Passkey پس از ورود OTP — تا بستن، ناوبری معطل می‌ماند
  const [offerPasskey, setOfferPasskey] = useState(false);
  const [passkeySaving, setPasskeySaving] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  useEffect(() => {
    setPasskeyReady(webAuthnSupported());
  }, []);

  // شمارش معکوس ارسال مجدد
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  // ——— فاز Passkey — توابع ورود و ثبت (قبل از early-return تا در هر دو شاخه در دسترس باشند) ———
  const navigateAfterLogin = () => {
    // ورود از سبد → مستقیم تسویه حساب (بدون تپ دوباره)
    if (redirect === 'checkout') {
      replace({ view: 'checkout', key: 'checkout' });
    } else {
      back();
    }
  };

  /** پس از ورود OTP — اگر Passkey ندارد و مرورگر پشتیبانی می‌کند → پیشنهاد ذخیره */
  const finishLogin = async (viaPasskey: boolean) => {
    if (!viaPasskey && passkeyReady) {
      try {
        const { passkeys } = await apiGet<{ passkeys: unknown[] }>('/api/user/passkeys');
        if (passkeys.length === 0) {
          // دیالوگ پیشنهاد؛ ناوبری پس از بستن آن انجام می‌شود
          setOfferPasskey(true);
          return;
        }
      } catch {
        /* خطای خواندن — بدون دیالوگ ادامه می‌دهیم */
      }
    }
    navigateAfterLogin();
  };

  const handlePasskeyLogin = async () => {
    setPasskeyError(null);
    setPasskeyBusy(true);
    try {
      const data = await loginWithPasskey();
      useAuthStore.getState().setUser(data.user as AuthUser);
      useCartStore.getState().applyServerCart(data.cart as CartDTO);
      storeSessionToken(data.sessionToken);
      setPasskeyBusy(false);
      navigateAfterLogin();
    } catch (e) {
      setPasskeyBusy(false);
      setPasskeyError(
        e instanceof ApiClientError ? e.message : 'ورود با Passkey ناموفق بود'
      );
    }
  };

  /** ذخیره روش ورود — هرگز جلوی ورود را نمی‌گیرد؛ خطا → ورود ادامه پیدا می‌کند */
  const savePasskey = async () => {
    setPasskeySaving(true);
    try {
      await registerPasskey();
      toast.success('روش ورود در دستگاه ذخیره شد');
    } catch {
      toast.error('ثبت روش ورود انجام نشد — از بخش «امنیت حساب» می‌توانید دوباره تلاش کنید');
    } finally {
      setPasskeySaving(false);
      setOfferPasskey(false);
      navigateAfterLogin();
    }
  };

  // ——— کاربر واردشده → کارت وضعیت ———
  if (user) {
    return (
      <div className="min-h-full">
        <TopBar title="ورود | ثبت‌نام" />
        <div className="px-4 pt-8 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <Smartphone className="h-8 w-8" strokeWidth={1.6} aria-hidden />
          </span>
          <h2 className="mt-4 text-base font-black text-ink-900">وارد حساب خود هستید</h2>
          <p className="mt-1 text-xs text-ink-500">{`با شماره ${toFaDigits(user.phone.slice(0, 4))} ${toFaDigits(user.phone.slice(4, 7))} ${toFaDigits(user.phone.slice(7))}`}</p>
          <button
            type="button"
            onClick={back}
            className="mt-6 h-12 w-full rounded-2xl bg-brand-500 text-sm font-black text-white shadow-card transition-all active:scale-[0.98] active:bg-brand-700"
          >
            بازگشت به فروشگاه
          </button>
        </div>
        {/* فاز Passkey — پیشنهاد ذخیره روش ورود پس از ورود OTP موفق */}
        {offerPasskey && (
          <PasskeyOfferDialog
            saving={passkeySaving}
            onSave={() => void savePasskey()}
            onLater={() => {
              setOfferPasskey(false);
              navigateAfterLogin();
            }}
          />
        )}
      </div>
    );
  }

  // ——— مرحله ۱: دریافت شماره موبایل ———
  const handleRequestOtp = async () => {
    setPhoneError(null);
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setPhoneError('شماره موبایل معتبر نیست — مثال: ۰۹۱۲۳۴۵۶۷۸۹');
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
      setCodeError(null);
    } catch (e) {
      setPhoneError(e instanceof ApiClientError ? e.message : 'ارسال کد ناموفق بود');
    } finally {
      setSubmitting(false);
    }
  };

  // ——— مرحله ۲: تأیید کد ———
  // fromPhoneStep: ورود سریع با کد مادر از مرحلهٔ شماره — خطا در همان مرحله نمایش داده می‌شود
  const handleVerify = async (codeValue: string, fromPhoneStep = false) => {
    const showError = (msg: string | null) =>
      fromPhoneStep ? setPhoneError(msg) : setCodeError(msg);
    showError(null);
    const ph = normalizePhone(phone);
    if (!ph) {
      showError('شماره موبایل معتبر نیست — مثال: ۰۹۱۲۳۴۵۶۷۸۹');
      return;
    }
    // نرمال‌سازی با کلاینت هم‌سو با سرور — ارقام فارسی/عربی معتبرند
    const normalized = toEnDigits(codeValue).replace(/\s/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      showError('کد ۶ رقمی را کامل وارد کنید');
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiPost<OtpVerifyResponse>('/api/auth/otp/verify', {
        phone: ph,
        code: normalized,
      });
      // اعمال کاربر و سبد ادغام‌شده (پاسخ سرور = منبع حقیقت)
      useAuthStore.getState().setUser(data.user);
      useCartStore.getState().applyServerCart(data.cart);
      // فال‌بک نشست — اگر مرورگر کوکی نشست را نفرستد (iframe بین‌سایتی)،
      // api-client توکن را در هدر x-pars-session می‌فرستد (رفع ۴۰۱ ثبت سفارش)
      storeSessionToken(data.sessionToken);
      setSubmitting(false);
      // فاز Passkey — پیشنهاد ذخیره روش ورود پیش از خروج از فرم
      await finishLogin(false);
    } catch (e) {
      setSubmitting(false);
      setCode('');
      showError(
        e instanceof ApiClientError ? e.message : 'تأیید کد ناموفق بود'
      );
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || submitting) return;
    setCodeError(null);
    setSubmitting(true);
    try {
      const data = await apiPost<OtpRequestResponse>('/api/auth/otp/request', { phone });
      setResendIn(data.resendAfterSeconds);
      setDevCode(data.devCode ?? null);
      setCode('');
    } catch (e) {
      setCodeError(e instanceof ApiClientError ? e.message : 'ارسال مجدد ناموفق بود');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full">
      <TopBar title="ورود | ثبت‌نام" />

      <div className="px-4 pt-6">
        {/* ——— هدر ——— */}
        <div className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            {step === 'phone' ? (
              <Smartphone className="h-8 w-8" strokeWidth={1.6} aria-hidden />
            ) : (
              <MessageSquare className="h-8 w-8" strokeWidth={1.6} aria-hidden />
            )}
          </span>
          <h1 className="mt-3 text-base font-black text-ink-900">
            {step === 'phone' ? 'ورود | ثبت‌نام' : 'کد تأیید را وارد کنید'}
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-ink-500">
            {step === 'phone'
              ? 'ورود بدون رمز عبور — فقط شماره موبایل و کد یک‌بارمصرف'
              : `کد ۶ رقمی به شماره ${toFaDigits(phone)} ارسال شد`}
          </p>
        </div>

        {/* ——— فرم ——— */}
        {step === 'phone' ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleRequestOtp();
            }}
          >
            <label
              htmlFor="login-phone"
              className="block text-[11px] font-bold text-ink-600"
            >
              شماره موبایل
            </label>
            <input
              id="login-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09123456789"
              className="h-13 w-full rounded-2xl border border-cream-200 bg-white px-4 text-center text-sm font-black tracking-widest text-ink-900 shadow-card outline-none transition-colors placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-300 focus:border-brand-400"
              aria-invalid={!!phoneError}
              aria-describedby={phoneError ? 'phone-error' : undefined}
            />
            {phoneError && (
              <p id="phone-error" role="alert" className="text-[11px] font-bold text-red-600">
                {phoneError}
              </p>
            )}

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
                  onClick={() => void handleVerify(MASTER_CODE, true)}
                  disabled={submitting}
                  className="mt-1 text-[11px] font-black text-brand-600 underline underline-offset-4 disabled:opacity-50"
                >
                  ورود سریع با کد مادر (بدون پیامک)
                </button>
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-sm font-black text-white shadow-card transition-all active:scale-[0.98] active:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden />
              ) : (
                'دریافت کد تأیید'
              )}
            </button>

            {/* ——— فاز Passkey: ورود مستقیم با کلید دستگاه — فقط وقتی مرورگر پشتیبانی می‌کند ——— */}
            {passkeyReady && (
              <>
                <div className="flex items-center gap-3" aria-hidden>
                  <span className="h-px flex-1 bg-cream-200" />
                  <span className="text-[10px] font-bold text-ink-300">یا</span>
                  <span className="h-px flex-1 bg-cream-200" />
                </div>
                <button
                  type="button"
                  onClick={() => void handlePasskeyLogin()}
                  disabled={passkeyBusy || submitting}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-brand-50/60 text-[13px] font-black text-brand-700 transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {passkeyBusy ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden />
                  ) : (
                    <>
                      <Fingerprint className="h-5 w-5" aria-hidden />
                      ورود سریع با Passkey
                    </>
                  )}
                </button>
                {passkeyError && (
                  <p role="alert" className="text-center text-[11px] font-bold text-red-600">
                    {passkeyError}
                  </p>
                )}
              </>
            )}
            {/* ——— پذیرش قوانین (درخواست کاربر) — جملهٔ استاندارد + لینک به صفحهٔ قوانین ——— */}
            <p className="pt-1 text-center text-[10px] leading-4 text-ink-400">
              ورود و ثبت‌نام شما به منزلهٔ آگاهی از{' '}
              <button
                type="button"
                onClick={() => push({ view: 'page', params: { slug: 'terms' }, key: 'page:terms' })}
                className="font-black text-brand-600 underline decoration-brand-300 underline-offset-2 transition-colors hover:text-brand-700"
              >
                قوانین و شرایط فروشگاه پارس
              </button>{' '}
              و پذیرش کامل آن‌ها است؛ ثبت سفارش نیز به معنای پذیرش کامل این قوانین است.
            </p>
          </form>
        ) : (
          <div className="mt-6 space-y-4">
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
                  محیط تست — کد پیامک‌شده:
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

            {codeError && (
              <p role="alert" className="text-center text-[11px] font-bold text-red-600">
                {codeError}
              </p>
            )}

            {MASTER_ENABLED && (
              <p className="text-center text-[10px] text-ink-400">
                {`کد مادر ${toFaDigits(MASTER_CODE)} نیز همیشه کار می‌کند`}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleVerify(code)}
              disabled={submitting || code.length < 6}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-sm font-black text-white shadow-card transition-all active:scale-[0.98] active:bg-brand-700 disabled:bg-cream-200 disabled:text-ink-400 disabled:shadow-none"
            >
              {submitting ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden />
              ) : (
                'تأیید و ورود'
              )}
            </button>

            <div className="flex items-center justify-center gap-3 text-[11px]">
              <button
                type="button"
                onClick={() => void handleResend()}
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
                  setCodeError(null);
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

      {/* ——— پیشنهاد ثبت Passkey پس از ورود موفق OTP (فاز Passkey) ——— */}
      {offerPasskey && (
        <PasskeyOfferDialog
          saving={passkeySaving}
          onSave={() => void savePasskey()}
          onLater={() => {
            setOfferPasskey(false);
            navigateAfterLogin();
          }}
        />
      )}
    </div>
  );
}

/** دیالوگ پیشنهاد ذخیره روش ورود — متن استاندارد مگاپروژه (بخش ۴) */
function PasskeyOfferDialog({
  saving,
  onSave,
  onLater,
}: {
  saving: boolean;
  onSave: () => void;
  onLater: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 px-4 pb-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="پیشنهاد ذخیره روش ورود"
    >
      <div className="w-full max-w-md rounded-3xl border border-cream-200 bg-white p-5 shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500">
          <ShieldCheck className="h-7 w-7" strokeWidth={1.6} aria-hidden />
        </span>
        <p className="mt-3 text-center text-sm font-black text-ink-900">
          برای ورود سریع‌تر و امن‌تر، روش ورود خود را در دستگاه ذخیره کنید
        </p>
        <p className="mt-1.5 text-center text-[11px] leading-5 text-ink-500">
          با اثر انگشت، چهره یا PIN دستگاه وارد می‌شوید — بدون کد پیامکی.
          ذخیره در Google Password Manager، iCloud Keychain یا گذرواژه‌بان
          سازگارِ دستگاه شما انجام می‌شود.
        </p>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-sm font-black text-white shadow-card transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden />}
            ذخیره روش ورود
          </button>
          <button
            type="button"
            onClick={onLater}
            className="h-11 w-full rounded-2xl text-[12.5px] font-bold text-ink-500 transition-colors hover:bg-cream-100"
          >
            بعداً
          </button>
        </div>
      </div>
    </div>
  );
}
