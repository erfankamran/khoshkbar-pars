'use client';

import { useEffect, useState } from 'react';
import {
  Banknote,
  CreditCard,
  Loader2,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Smartphone,
  Star,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState, ErrorState } from '@/components/shared/States';
import { AddressFormSheet } from './AddressesView';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { formatPrice, toEnDigits, toFaDigits } from '@/lib/fa';
import { normalizePhone } from '@/lib/phone';
import {
  apiPost,
  apiPut,
  ApiClientError,
  storeSessionToken,
} from '@/lib/api-client';
import type { AddressDTO } from '@/server/services/address.service';
import type { OrderDTO } from '@/server/services/order.service';
import type { ShippingMethod } from '@/server/services/shipping.service';
import { useApi } from '@/hooks/use-api';
import { useAuthStore, type AuthUser } from '@/stores/auth-store';
import { useCartStore, type CartDTO } from '@/stores/cart-store';
import { useRouterStore } from '@/stores/router-store';

/**
 * تسویه حساب (فاز ۹ و ۱۰)
 *
 * - نیازمند ورود (OTP) — مهمان → دعوت به ورود
 * - آدرس تحویل: فرم مستقیم + Snapshot کامل در Order (بند ۱۳)
 * - دفترچه آدرس (فاز ۱۰): پیش‌پرکردن خودکار از آدرس پیش‌فرض + انتخاب سریع
 * - پرداخت: آنلاین شبیه‌سازی‌شده (برچسب تستی) یا در محل
 * - مبالغ فقط از store سبد (پاسخ سرور) نمایش داده می‌شود — ثبت سفارش هم
 *   سمت سرور از دیتابیس محاسبه می‌کند؛ قیمت کلاینت هرگز ارسال/پذیرفته نمی‌شود
 */

const inputCls =
  'h-11 w-full rounded-2xl border border-cream-200 bg-white px-3.5 text-[13px] font-bold text-ink-900 shadow-card outline-none transition-colors placeholder:font-normal placeholder:text-ink-300 focus:border-brand-400';
const labelCls = 'mb-1.5 block text-[11px] font-bold text-ink-600';

/** تنظیمات عمومی فروشگاه — whitelist سرور (فاز ۱۵) */
interface PublicSettingsShape {
  freeShippingThresholdToman?: number;
  storeOpen?: boolean;
  shippingMethods?: ShippingMethod[];
  shippingNote?: string;
  onlineGatewayEnabled?: boolean;
  codEnabled?: boolean;
  gatewayProvider?: string;
}

const GATEWAY_LABELS: Record<string, string> = {
  SANDBOX: 'درگاه تستی',
  ZARINPAL: 'زرین‌پال',
  IDPAY: 'آیدی‌پی',
  ZIBAL: 'زیبال',
};

/** پاسخ درخواست کد تایید — ارسال واقعی با ملی‌پیامک یا حالت آزمایشی */
interface OtpRequestShape {
  resendAfterSeconds: number;
  /** فقط حالت آزمایشی — وقتی پیامک واقعی پیکربندی نشده */
  devCode?: string;
  /** کد واقعاً پیامک شد؟ (ملی‌پیامک فعال) */
  smsSent?: boolean;
}

/** پاسخ تایید کد — کاربر ساخته/ورود، نشست و سبد ادغام‌شده */
interface OtpVerifyShape {
  user: AuthUser;
  cart: CartDTO;
  /** توکن نشست — فال‌بک هدر در محیط بی‌کوکی (iframe بین‌سایتی) */
  sessionToken?: string;
}

export function CheckoutView() {
  const push = useRouterStore((s) => s.push);
  const replace = useRouterStore((s) => s.replace);

  const user = useAuthStore((s) => s.user);
  const authHydrated = useAuthStore((s) => s.hydrated);

  const items = useCartStore((s) => s.items);
  const totals = useCartStore((s) => s.totals);
  const warnings = useCartStore((s) => s.warnings);
  const refresh = useCartStore((s) => s.refresh);

  const [form, setForm] = useState({
    receiverName: '',
    receiverPhone: '',
    province: '',
    city: '',
    postalCode: '',
    fullAddress: '',
    // پین نقشه از آدرس ذخیره‌شده می‌آید — انتخاب دستی روی نقشه در دفترچه آدرس است
    latitude: '',
    longitude: '',
    customerNote: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<'ONLINE_GATEWAY' | 'COD'>(
    'ONLINE_GATEWAY'
  );
  // ——— روش ارسال پستی (فاز ۱۵) — انتخاب از تنظیمات فروشگاه ———
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ——— تایید شماره موبایل مهمان با کد پیامکی (درخواست کاربر) ———
  // نام + شماره از کاربر گرفته، کد با ملی‌پیامک ارسال و سفارش با همان
  // شماره تلفن در دیتابیس ذخیره می‌شود (کاربر با verify ساخته می‌شود)
  const [guestStep, setGuestStep] = useState<'info' | 'code'>('info');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCode, setGuestCode] = useState('');
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);
  const [smsSentHint, setSmsSentHint] = useState(false);

  // شمارش معکوس ارسال مجدد کد
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const guestReady =
    guestName.trim().length >= 2 && normalizePhone(guestPhone) !== null;

  const requestGuestCode = async () => {
    setGuestError(null);
    const normalized = normalizePhone(guestPhone);
    if (guestName.trim().length < 2) {
      setGuestError('نام و نام خانوادگی را وارد کنید');
      return;
    }
    if (!normalized) {
      setGuestError('شماره موبایل معتبر نیست — مثال: ۰۹۱۲۳۴۵۶۷۸۹');
      return;
    }
    setGuestBusy(true);
    try {
      const data = await apiPost<OtpRequestShape>('/api/auth/otp/request', {
        phone: normalized,
      });
      setGuestPhone(normalized);
      setGuestStep('code');
      setResendIn(data.resendAfterSeconds);
      setDevCodeHint(data.devCode ?? null);
      setSmsSentHint(data.smsSent === true);
      setGuestCode('');
    } catch (e) {
      setGuestError(
        e instanceof ApiClientError ? e.message : 'ارسال کد ناموفق بود'
      );
    } finally {
      setGuestBusy(false);
    }
  };

  const verifyGuestCode = async () => {
    setGuestError(null);
    const ph = normalizePhone(guestPhone);
    const normalized = toEnDigits(guestCode).replace(/\s/g, '');
    if (!ph) {
      setGuestError('شماره موبایل معتبر نیست');
      return;
    }
    if (!/^\d{6}$/.test(normalized)) {
      setGuestError('کد ۶ رقمی را کامل وارد کنید');
      return;
    }
    setGuestBusy(true);
    try {
      const data = await apiPost<OtpVerifyShape>('/api/auth/otp/verify', {
        phone: ph,
        code: normalized,
      });
      // کاربر با همان شماره تلفن ساخته/ورود می‌کند و سبد ادغام می‌شود —
      // سفارش با همین هویت (شماره تلفن) در دیتابیس ذخیره می‌شود
      // (منبع حقیقت = پاسخ سرور؛ الگوی همان LoginView)
      useAuthStore.getState().setUser(data.user);
      useCartStore.getState().applyServerCart(data.cart);
      // فال‌بک نشست برای محیط بی‌کوکی — api-client آن را در هدر می‌فرستد
      storeSessionToken(data.sessionToken);
      // ثبت نام کاربر در پروفایل — پیوند نام با شماره تلفن در دیتابیس
      const parts = guestName.trim().split(/\s+/);
      void apiPut('/api/user/profile', {
        firstName: parts[0],
        ...(parts.length > 1 ? { lastName: parts.slice(1).join(' ') } : {}),
      }).catch(() => undefined);
      // پیش‌پرکردن گیرنده سفارش با اطلاعات تاییدشده
      setForm((f) => ({
        ...f,
        receiverName: f.receiverName || guestName.trim(),
        receiverPhone: f.receiverPhone || ph,
      }));
      toast.success('شماره موبایل تایید شد — ادامه تسویه حساب');
    } catch (e) {
      setGuestError(
        e instanceof ApiClientError ? e.message : 'تأیید کد ناموفق بود'
      );
      setGuestCode('');
    } finally {
      setGuestBusy(false);
    }
  };

  const resendGuestCode = async () => {
    if (resendIn > 0 || guestBusy) return;
    setGuestError(null);
    setGuestBusy(true);
    try {
      const data = await apiPost<OtpRequestShape>('/api/auth/otp/request', {
        phone: guestPhone,
      });
      setResendIn(data.resendAfterSeconds);
      setDevCodeHint(data.devCode ?? null);
      setSmsSentHint(data.smsSent === true);
      setGuestCode('');
    } catch (e) {
      setGuestError(
        e instanceof ApiClientError ? e.message : 'ارسال مجدد ناموفق بود'
      );
    } finally {
      setGuestBusy(false);
    }
  };

  // تنظیمات عمومی فروشگاه — روش‌های ارسال، درگاه‌های فعال و توضیح ارسال
  const { data: storeSettings } = useApi<PublicSettingsShape>('/api/settings');
  const shipMethods = (storeSettings?.shippingMethods ?? []).filter((m) => m.enabled);
  const freeThreshold = storeSettings?.freeShippingThresholdToman ?? 1_500_000;
  const onlineEnabled = storeSettings?.onlineGatewayEnabled !== false;
  const codEnabled = storeSettings?.codEnabled !== false;
  const storeOpen = storeSettings?.storeOpen !== false;
  const gatewayProvider = storeSettings?.gatewayProvider ?? 'SANDBOX';

  // روش پیش‌فرض: اولین روش فعال — وقتی تنظیمات رسید یا روش قبلی غیرفعال شد
  if (
    shipMethods.length > 0 &&
    (!shippingMethodId || !shipMethods.some((m) => m.id === shippingMethodId))
  ) {
    setShippingMethodId(shipMethods[0].id);
  }
  // روش پرداخت انتخابی غیرفعال شده → جابه‌جایی به گزینه فعال (پیش‌فرض سرور هر دو فعال)
  if (!onlineEnabled && paymentMethod === 'ONLINE_GATEWAY' && codEnabled) {
    setPaymentMethod('COD');
  } else if (!codEnabled && paymentMethod === 'COD' && onlineEnabled) {
    setPaymentMethod('ONLINE_GATEWAY');
  }

  // ——— دفترچه آدرس (فاز ۱۰) — پیش‌پرکردن خودکار از آدرس پیش‌فرض ———
  const {
    data: savedAddresses,
    loading: addressesLoading, error: addressesError, reload: reloadAddresses,
  } = useApi<AddressDTO[]>(user ? '/api/addresses' : null);
  // شناسه آدرسی که فرم از آن پر شده — تا پیش‌پرکردن فقط یک‌بار انجام شود
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);
  const [addressSheet, setAddressSheet] = useState<'new' | AddressDTO | null>(null);
  const [saveNewAddress, setSaveNewAddress] = useState(true);
  const [addressTitle, setAddressTitle] = useState('نشانی جدید');

  // الگوی رسمی React (تنظیم state در زمان رندر) — مثل use-api: همگرا و بی‌حلقه
  if (savedAddresses && savedAddresses.length > 0 && !prefilledFrom) {
    const def = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
    setForm((f) => ({
      ...f,
      receiverName: def.receiverName,
      receiverPhone: def.receiverPhone,
      province: def.province,
      city: def.city,
      postalCode: def.postalCode ?? '',
      fullAddress: def.fullAddress,
      latitude: def.latitude != null ? String(def.latitude) : '',
      longitude: def.longitude != null ? String(def.longitude) : '',
    }));
    setPrefilledFrom(def.id);
  }

  const fillFromAddress = (addr: AddressDTO) => {
    setForm((f) => ({
      ...f,
      receiverName: addr.receiverName,
      receiverPhone: addr.receiverPhone,
      province: addr.province,
      city: addr.city,
      postalCode: addr.postalCode ?? '',
      fullAddress: addr.fullAddress,
      latitude: addr.latitude != null ? String(addr.latitude) : '',
      longitude: addr.longitude != null ? String(addr.longitude) : '',
    }));
    setPrefilledFrom(addr.id);
    toast.success(`آدرس «${addr.title}» اعمال شد`);
  };

  const set = (key: keyof typeof form) => (value: string) => {
    if (key !== 'customerNote') setPrefilledFrom('new');
    setForm((f) => ({ ...f, [key]: value, ...(['province', 'city', 'fullAddress'].includes(key) ? { latitude: '', longitude: '' } : {}) }));
  };

  // ——— وضعیت ورود هنوز مشخص نیست ———
  if (!authHydrated) {
    return (
      <div className="min-h-full">
        <TopBar title="تسویه حساب" />
        <div className="space-y-3 px-4 pt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="shimmer h-16 rounded-3xl" aria-label="در حال بارگذاری" />
          ))}
        </div>
      </div>
    );
  }

  // ——— مهمان: ثبت سفارش با نام + شماره موبایل تاییدشده با کد پیامکی ———
  // (درخواست کاربر: به‌جای دعوت به ورود، همین‌جا نام/شماره گرفته و کد با
  // ملی‌پیامک ارسال می‌شود؛ پس از تایید، سفارش با همان شماره ذخیره می‌شود)
  if (!user) {
    return (
      <div className="min-h-full">
        <TopBar title="تسویه حساب" />

        <div className="px-4 py-4">
          {/* ——— خلاصه سبد ——— */}
          <div className="flex items-center justify-between rounded-3xl border border-cream-200 bg-white px-4 py-3.5 shadow-card">
            <p className="text-[12px] font-black text-ink-800">
              {`${toFaDigits(items.length)} قلم در سبد`}
            </p>
            <p className="text-[12.5px] font-black text-brand-700">
              {formatPrice(totals.subtotalToman)} تومان
            </p>
          </div>

          {/* ——— کارت تایید شماره با کد پیامکی ——— */}
          <section className="mt-4 rounded-3xl border border-cream-200 bg-white p-5 shadow-card">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <ShieldCheck className="h-6 w-6" strokeWidth={1.6} aria-hidden />
              </span>
              <div>
                <p className="text-[14px] font-extrabold text-ink-900">
                  ثبت سفارش با شماره موبایل
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-ink-500">
                  نام، شماره موبایل و کد تایید پیامکی — بدون ثبت‌نام قبلی
                </p>
              </div>
            </div>

            {guestStep === 'info' ? (
              /* ——— مرحله ۱: نام و شماره ——— */
              <div className="mt-4 space-y-3">
                <div>
                  <label className={labelCls} htmlFor="co-guest-name">
                    نام و نام خانوادگی *
                  </label>
                  <input
                    id="co-guest-name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className={inputCls}
                    placeholder="مثلاً علی رضایی"
                    autoComplete="name"
                    maxLength={60}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="co-guest-phone">
                    شماره موبایل *
                  </label>
                  <input
                    id="co-guest-phone"
                    dir="ltr"
                    inputMode="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    className={`${inputCls} text-left font-mono`}
                    placeholder="09123456789"
                    autoComplete="tel"
                    maxLength={14}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void requestGuestCode()}
                  disabled={guestBusy || !guestReady}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-[14px] font-black text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  {guestBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <Smartphone className="h-5 w-5" aria-hidden />
                  )}
                  دریافت کد تایید پیامکی
                </button>
              </div>
            ) : (
              /* ——— مرحله ۲: کد تایید ——— */
              <div className="mt-4 space-y-3">
                <p className="text-center text-[12px] leading-5 text-ink-600">
                  کد ۶ رقمی به شماره{' '}
                  <span dir="ltr" className="font-mono font-black text-ink-900">
                    {toFaDigits(guestPhone)}
                  </span>{' '}
                  ارسال شد
                </p>

                {smsSentHint && (
                  <p className="rounded-2xl bg-brand-50 px-3 py-2 text-center text-[11px] font-bold text-brand-700">
                    پیامک با موفقیت ارسال شد — چند لحظه صبر کنید
                  </p>
                )}
                {/* حالت آزمایشی — وقتی پیامک واقعی پیکربندی نشده */}
                {devCodeHint && !smsSentHint && (
                  <div className="rounded-2xl border border-dashed border-gold-400 bg-gold-100/70 px-3 py-2.5 text-center text-[11px] font-black text-gold-900">
                    حالت آزمایشی — کد تایید:{' '}
                    <span dir="ltr">{toFaDigits(devCodeHint)}</span>
                  </div>
                )}

                <div dir="ltr" className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={guestCode}
                    onChange={(v) => setGuestCode(v)}
                    disabled={guestBusy}
                    containerClassName="justify-center"
                    aria-label="کد تایید ۶ رقمی"
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

                <button
                  type="button"
                  onClick={() => void verifyGuestCode()}
                  disabled={guestBusy || guestCode.length < 6}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-[14px] font-black text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  {guestBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <ShieldCheck className="h-5 w-5" aria-hidden />
                  )}
                  تایید و ادامه تسویه حساب
                </button>

                <div className="flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => setGuestStep('info')}
                    className="font-bold text-ink-500"
                  >
                    اصلاح شماره
                  </button>
                  <button
                    type="button"
                    onClick={() => void resendGuestCode()}
                    disabled={resendIn > 0 || guestBusy}
                    className="font-black text-brand-600 disabled:text-ink-300"
                  >
                    {resendIn > 0
                      ? `${`ارسال مجدد کد`} (${toFaDigits(resendIn)} ثانیه)`
                      : 'ارسال مجدد کد'}
                  </button>
                </div>
              </div>
            )}

            {guestError && (
              <p className="mt-3 rounded-2xl bg-red-50 px-3.5 py-2.5 text-[11.5px] font-bold text-red-600">
                {guestError}
              </p>
            )}
          </section>

          <p className="mt-4 flex items-start gap-1.5 px-1 text-[10.5px] leading-5 text-ink-400">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden />
            پس از تایید شماره، فرم آدرس و پرداخت باز می‌شود و سفارش با همین
            شماره موبایل در سیستم ذخیره می‌گردد — سبد خرید شما حفظ می‌شود.
          </p>
        </div>
      </div>
    );
  }

  const purchasable = items.filter((i) => i.isPurchasable);

  // ——— مبالغ نمایشی با روش ارسال انتخابی (محاسبه نهایی سمت سرور است) ———
  const subtotalToman = totals.subtotalToman;
  const selectedMethod = shipMethods.find((m) => m.id === shippingMethodId);
  const selectedFee = selectedMethod
    ? subtotalToman >= freeThreshold
      ? 0
      : selectedMethod.costToman
    : totals.deliveryToman;
  const displayTotal = subtotalToman + selectedFee;

  // ——— سبد خالی ———
  if (items.length === 0 || purchasable.length === 0) {
    return (
      <div className="min-h-full">
        <TopBar title="تسویه حساب" />
        <EmptyState
          icon={MapPin}
          title="سبدی برای تسویه وجود ندارد"
          description="ابتدا کالاهای مورد نظر خود را به سبد خرید اضافه کنید."
          actionLabel="شروع خرید"
          onAction={() => push({ view: 'home' })}
          className="pt-8"
        />
      </div>
    );
  }

  const handleSubmit = async () => {
    setFormError(null);

    // ——— اعتبارسنجی سبک کلاینت (منبع حقیقت: zod سمت سرور) ———
    if (form.receiverName.trim().length < 3) {
      setFormError('نام گیرنده را کامل وارد کنید');
      return;
    }
    if (!normalizePhone(form.receiverPhone)) {
      setFormError('شماره تماس گیرنده معتبر نیست');
      return;
    }
    if (form.province.trim().length < 2 || form.city.trim().length < 2) {
      setFormError('استان و شهر را وارد کنید');
      return;
    }
    if (form.fullAddress.trim().length < 10) {
      setFormError('نشانی کامل پستی را وارد کنید');
      return;
    }
    // کد پستی: ارقام فارسی → لاتین؛ اگر پر شده باید ۱۰ رقم باشد
    // (وگرنه سرور بی‌صدا آن را حذف می‌کند و کاربر متوجه نمی‌شود)
    const postal = toEnDigits(form.postalCode).replace(/\s/g, '');
    if (postal && !/^\d{10}$/.test(postal)) {
      setFormError('کد پستی باید ۱۰ رقم باشد — یا خالی بگذارید');
      return;
    }

    setSubmitting(true);
    try {
      if ((!prefilledFrom || prefilledFrom === 'new') && saveNewAddress) {
        const saved = await apiPost<AddressDTO>('/api/addresses', { title: addressTitle.trim() || 'نشانی جدید', receiverName: form.receiverName.trim(), receiverPhone: form.receiverPhone, province: form.province.trim(), city: form.city.trim(), postalCode: postal || undefined, fullAddress: form.fullAddress.trim(), isDefault: !savedAddresses?.length });
        setPrefilledFrom(saved.id); reloadAddresses();
      }
      const order = await apiPost<
        OrderDTO & { payment?: { startUrl: string; trackId: string } }
      >('/api/orders', {
        address: {
          receiverName: form.receiverName.trim(),
          receiverPhone: form.receiverPhone,
          province: form.province.trim(),
          city: form.city.trim(),
          postalCode: postal || undefined,
          fullAddress: form.fullAddress.trim(),
          // پین نقشه آدرس ذخیره‌شده — فقط جفت کامل؛ مبنای پیک در پنل مدیریت
          ...(Number.isFinite(Number(form.latitude)) &&
          Number.isFinite(Number(form.longitude)) &&
          form.latitude !== '' &&
          form.longitude !== ''
            ? {
                latitude: Number(form.latitude),
                longitude: Number(form.longitude),
              }
            : {}),
        },
        paymentMethod,
        shippingMethodId: shippingMethodId ?? undefined,
        customerNote: form.customerNote.trim() || undefined,
      });
      // سبد در سرور پاک شد — همگام‌سازی store
      void refresh();

      // ——— درگاه واقعی (فاز ۱۶) — ریدایرکت کامل به صفحه پرداخت زیبال ———
      if (order.payment?.startUrl) {
        toast.success('در حال انتقال به درگاه پرداخت زیبال…');
        window.location.assign(order.payment.startUrl);
        return;
      }

      toast.success(`سفارش ${order.code} ثبت شد`);
      // جایگزینی نمای تسویه با جزئیات سفارش (Back → سبد)
      replace({
        view: 'orderDetail',
        params: { code: order.code, justCreated: '1' },
        key: `order:${order.code}`,
      });
    } catch (e) {
      if (e instanceof ApiClientError) {
        // سبد نامعتبر → همگام‌سازی فوری تا هشدارها دیده شوند
        if (['CART_EMPTY', 'CART_HAS_UNAVAILABLE', 'STOCK_SHORTAGE', 'MIN_ORDER'].includes(e.code)) {
          void refresh();
        }
        // نشست در سرور مرده ولی store هنوز کاربر دارد → همگام‌سازی؛
        // اگر واقعاً خروج شده باشد، رندر بعدی دعوت به ورود نشان می‌دهد
        if (e.code === 'UNAUTHENTICATED') {
          void useAuthStore.getState().hydrate();
        }
        setFormError(e.message);
      } else {
        setFormError('ثبت سفارش ناموفق بود — دوباره تلاش کنید');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full pb-32">
      <TopBar title="تسویه حساب" />
      <AddressFormSheet open={addressSheet !== null} editing={addressSheet && addressSheet !== 'new' ? addressSheet : null} onClose={() => setAddressSheet(null)} onSaved={(address) => { fillFromAddress(address); setAddressSheet(null); reloadAddresses(); }} />

      {/* ——— هشدارهای سبد (ناموجود و...) ——— */}
      {warnings.length > 0 && (
        <div className="mx-4 mt-3 space-y-1.5 rounded-2xl bg-gold-100/80 p-3" role="alert">
          {warnings.map((w, i) => (
            <p key={i} className="text-[11px] font-bold leading-5 text-gold-800">
              {w.message}
            </p>
          ))}
        </div>
      )}

      {/* ——— هشدار فروشگاه بسته (فاز ۱۵) ——— */}
      {!storeOpen && (
        <div
          className="mx-4 mt-3 flex items-start gap-2.5 rounded-2xl bg-red-50 p-3"
          role="alert"
        >
          <Store className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
          <p className="text-[11px] font-bold leading-5 text-red-600">
            فروشگاه موقتاً بسته است — در این وضعیت ثبت سفارش جدید ممکن نیست.
          </p>
        </div>
      )}

      {/* ——— فرم آدرس تحویل ——— */}
      <section className="px-4 pt-4" aria-label="آدرس تحویل">
        <h2 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-black text-ink-900">
          <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
          آدرس تحویل سفارش
        </h2>

        {/* ——— آدرس‌های ذخیره‌شده — انتخاب سریع (فاز ۱۰) ———
            حتی بدون آدرس ذخیره‌شده هم ردیف با «مدیریت آدرس‌ها» رندر می‌شود
            تا کاربر راهی به دفترچه آدرس داشته باشد */}
        {user && (
          <div className="mb-3" role="group" aria-label="آدرس‌های ذخیره‌شده">
            {addressesLoading && <p className="mb-2 text-xs text-ink-500">در حال بارگذاری آدرس‌های شما…</p>}
            {addressesError && <ErrorState title="دفترچه آدرس بارگذاری نشد" description={addressesError} onRetry={reloadAddresses} />}
            <div className="grid gap-2" role="radiogroup" aria-label="انتخاب آدرس تحویل">
              {savedAddresses?.map((addr) => (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => fillFromAddress(addr)}
                  role="radio" aria-checked={prefilledFrom === addr.id}
                  className={`flex w-full items-start gap-2 rounded-2xl border px-3 py-3 text-start text-[11.5px] shadow-card transition-all active:scale-95 ${
                    prefilledFrom === addr.id
                      ? 'border-brand-400 bg-brand-50 text-brand-800'
                      : 'border-cream-200 bg-white text-ink-600'
                  }`}
                >
                  {addr.isDefault && (
                    <Star className="h-3 w-3 fill-gold-400 text-gold-400" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1"><span className="block font-black">{addr.title} — {addr.receiverName}</span><span className="mt-1 block text-[11px] font-normal leading-6">{addr.province}، {addr.city}، {addr.fullAddress}</span><span className="block text-[10.5px] font-normal"><bdi>{toFaDigits(addr.receiverPhone)}</bdi>{addr.postalCode ? ` · کدپستی ${toFaDigits(addr.postalCode)}` : ''}</span></span>
                  {prefilledFrom === addr.id && <span className="font-bold text-brand-700">انتخاب‌شده</span>}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAddressSheet('new')}
                className="flex shrink-0 items-center gap-1 rounded-2xl border border-dashed border-cream-300 px-3 py-2 text-[11.5px] font-bold text-ink-500 transition-all active:scale-95"
              >
                ثبت آدرس جدید در همین مرحله
              </button>
            </div>
          </div>
        )}
        {savedAddresses?.some((address) => address.id === prefilledFrom) && <button type="button" onClick={() => setAddressSheet(savedAddresses.find((address) => address.id === prefilledFrom)!)} className="mb-3 min-h-10 rounded-xl border border-brand-200 px-3 text-xs font-bold text-brand-700">ویرایش آدرس انتخاب‌شده</button>}
        {(!prefilledFrom || prefilledFrom === 'new') && <div className="mb-3 rounded-2xl border border-cream-200 bg-white p-3"><label className="flex min-h-10 items-center gap-2 text-xs font-bold"><input type="checkbox" checked={saveNewAddress} onChange={(event) => setSaveNewAddress(event.target.checked)} />ذخیرهٔ این نشانی برای خریدهای بعدی</label>{saveNewAddress && <><label htmlFor="co-address-title" className={labelCls}>عنوان آدرس (مثلاً خانه یا محل کار)</label><input id="co-address-title" value={addressTitle} onChange={(event) => setAddressTitle(event.target.value)} maxLength={40} className={inputCls} /></>}</div>}
        <div className={`space-y-2.5 rounded-3xl border border-cream-200 bg-white p-4 shadow-card ${prefilledFrom && prefilledFrom !== 'new' ? 'hidden' : ''}`}>
          <div>
            <label className={labelCls} htmlFor="co-name">
              نام و نام خانوادگی گیرنده
            </label>
            <input
              id="co-name"
              className={inputCls}
              value={form.receiverName}
              onChange={(e) => set('receiverName')(e.target.value)}
              placeholder="مثلاً سارا محمدی"
              autoComplete="name"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="co-phone">
              شماره تماس گیرنده
            </label>
            <input
              id="co-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              className={`${inputCls} text-center`}
              value={form.receiverPhone}
              onChange={(e) => set('receiverPhone')(e.target.value)}
              placeholder="09123456789"
              autoComplete="tel"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={labelCls} htmlFor="co-province">
                استان
              </label>
              <input
                id="co-province"
                className={inputCls}
                value={form.province}
                onChange={(e) => set('province')(e.target.value)}
                placeholder="تهران"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="co-city">
                شهر
              </label>
              <input
                id="co-city"
                className={inputCls}
                value={form.city}
                onChange={(e) => set('city')(e.target.value)}
                placeholder="تهران"
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="co-postal">
              کد پستی (اختیاری)
            </label>
            <input
              id="co-postal"
              type="text"
              inputMode="numeric"
              dir="ltr"
              maxLength={10}
              className={`${inputCls} text-center`}
              value={form.postalCode}
              onChange={(e) => set('postalCode')(e.target.value)}
              placeholder="1234567890"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="co-address">
              نشانی کامل پستی
            </label>
            <textarea
              id="co-address"
              rows={3}
              className="w-full rounded-2xl border border-cream-200 bg-white px-3.5 py-2.5 text-[13px] font-bold leading-6 text-ink-900 shadow-card outline-none transition-colors placeholder:font-normal placeholder:text-ink-300 focus:border-brand-400"
              value={form.fullAddress}
              onChange={(e) => set('fullAddress')(e.target.value)}
              placeholder="خیابان، کوچه، پلاک و واحد"
            />
          </div>
        </div>
      </section>

      {/* ——— روش ارسال پستی (فاز ۱۵) ——— */}
      <section className="px-4 pt-4" aria-label="روش ارسال پستی">
        <h2 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-black text-ink-900">
          <PackageCheck className="h-4 w-4 text-brand-600" aria-hidden />
          روش ارسال پستی
        </h2>
        <div className="space-y-2.5" role="radiogroup" aria-label="انتخاب روش ارسال">
          {shipMethods.map((m) => {
            const fee = subtotalToman >= freeThreshold ? 0 : m.costToman;
            const active = shippingMethodId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setShippingMethodId(m.id)}
                className={`flex w-full items-center gap-3 rounded-3xl border p-4 text-right shadow-card transition-all ${
                  active
                    ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                    : 'border-cream-200 bg-white'
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                    active ? 'bg-brand-500 text-white' : 'bg-cream-100 text-ink-500'
                  }`}
                >
                  <PackageCheck className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-extrabold text-ink-900">{m.name}</span>
                  <span className="mt-0.5 block text-[10px] text-ink-400">
                    {`زمان تحویل: ${m.etaDays}`}
                  </span>
                </span>
                <span
                  className={`text-[12px] font-black ${
                    fee === 0 ? 'text-emerald-600' : active ? 'text-brand-800' : 'text-ink-600'
                  }`}
                >
                  {fee === 0 ? 'رایگان' : formatPrice(fee)}
                </span>
              </button>
            );
          })}
        </div>
        {storeSettings?.shippingNote && (
          <p className="mt-2 rounded-2xl bg-cream-100 p-3 text-[10.5px] leading-5 text-ink-500">
            {storeSettings.shippingNote}
          </p>
        )}
      </section>

      {/* ——— روش پرداخت (فاز ۱۵: فقط درگاه‌های فعال‌شده در تنظیمات) ——— */}
      <section className="px-4 pt-4" aria-label="روش پرداخت">
        <h2 className="mb-2.5 text-[13px] font-black text-ink-900">روش پرداخت</h2>
        {!onlineEnabled && !codEnabled ? (
          <p className="rounded-2xl bg-gold-100/80 p-3 text-[11px] font-bold leading-5 text-gold-800">
            در حال حاضر هیچ روش پرداختی فعال نیست — لطفاً بعداً تلاش کنید یا با پشتیبانی تماس بگیرید.
          </p>
        ) : (
          <div className="space-y-2.5" role="radiogroup" aria-label="انتخاب روش پرداخت">
            {onlineEnabled && (
              <button
                type="button"
                role="radio"
                aria-checked={paymentMethod === 'ONLINE_GATEWAY'}
                onClick={() => setPaymentMethod('ONLINE_GATEWAY')}
                className={`flex w-full items-center gap-3 rounded-3xl border p-4 text-right shadow-card transition-all ${
                  paymentMethod === 'ONLINE_GATEWAY'
                    ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                    : 'border-cream-200 bg-white'
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                    paymentMethod === 'ONLINE_GATEWAY'
                      ? 'bg-brand-500 text-white'
                      : 'bg-cream-100 text-ink-500'
                  }`}
                >
                  <CreditCard className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-extrabold text-ink-900">
                    پرداخت آنلاین
                  </span>
                  <span className="mt-0.5 block text-[10px] text-ink-400">
                    {`درگاه ${GATEWAY_LABELS[gatewayProvider] ?? gatewayProvider} — `}
                    {gatewayProvider === 'SANDBOX'
                      ? 'محیط تستی است و پرداخت واقعی انجام نمی‌شود'
                      : 'پرداخت امن از طریق درگاه انتخابی فروشگاه'}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                    paymentMethod === 'ONLINE_GATEWAY'
                      ? 'bg-brand-500 text-white'
                      : 'bg-cream-100 text-ink-400'
                  }`}
                >
                  {gatewayProvider === 'SANDBOX' ? 'تستی' : (GATEWAY_LABELS[gatewayProvider] ?? gatewayProvider)}
                </span>
              </button>
            )}

            {codEnabled && (
              <button
                type="button"
                role="radio"
                aria-checked={paymentMethod === 'COD'}
                onClick={() => setPaymentMethod('COD')}
                className={`flex w-full items-center gap-3 rounded-3xl border p-4 text-right shadow-card transition-all ${
                  paymentMethod === 'COD'
                    ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                    : 'border-cream-200 bg-white'
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                    paymentMethod === 'COD' ? 'bg-brand-500 text-white' : 'bg-cream-100 text-ink-500'
                  }`}
                >
                  <Banknote className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-extrabold text-ink-900">
                    پرداخت در محل (هنگام دریافت)
                  </span>
                  <span className="mt-0.5 block text-[10px] text-ink-400">
                    پرداخت نقدی هنگام تحویل بسته
                  </span>
                </span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* ——— یادداشت سفارش ——— */}
      <section className="px-4 pt-4" aria-label="یادداشت سفارش">
        <label className={labelCls} htmlFor="co-note">
          یادداشت سفارش (اختیاری)
        </label>
        <textarea
          id="co-note"
          rows={2}
          className="w-full rounded-2xl border border-cream-200 bg-white px-3.5 py-2.5 text-[13px] font-bold leading-6 text-ink-900 shadow-card outline-none transition-colors placeholder:font-normal placeholder:text-ink-300 focus:border-brand-400"
          value={form.customerNote}
          onChange={(e) => set('customerNote')(e.target.value)}
          placeholder="مثلاً: بسته‌بندی کادویی لطفاً"
          maxLength={300}
        />
      </section>

      {/* ——— خلاصه سفارش ——— */}
      <section className="px-4 pt-4" aria-label="اقلام سفارش">
        <h2 className="mb-2.5 text-[13px] font-black text-ink-900">
          {`${toFaDigits(purchasable.length)} کالا در سفارش`}
        </h2>
        <ul className="divide-y divide-cream-100 rounded-3xl border border-cream-200 bg-white shadow-card">
          {purchasable.map((line) => (
            <li key={line.id} className="flex items-center gap-3 p-3">
              {line.image ? (
                <img
                  src={line.image}
                  alt={line.title}
                  className="h-11 w-11 shrink-0 rounded-xl object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="h-11 w-11 shrink-0 rounded-xl bg-cream-100" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-extrabold text-ink-900">{line.title}</p>
                <p className="mt-0.5 text-[10px] text-ink-400">
                  {`${toFaDigits(line.quantity)} × ${formatPrice(line.unitPriceToman)}`}
                </p>
              </div>
              <span className="text-[12px] font-black text-brand-800">
                {formatPrice(line.lineTotalToman)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {formError && (
        <p
          role="alert"
          className="mx-4 mt-3 rounded-2xl bg-red-50 px-3.5 py-2.5 text-[11px] font-bold leading-5 text-red-600"
        >
          {formError}
        </p>
      )}

      {/* ——— نوار ثبت سفارش ——— */}
      <div className="sticky bottom-0 z-20 mt-4 border-t border-cream-200 bg-cream-50/95 p-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between px-1 text-[11px]">
          <span className="text-ink-500">
            {selectedMethod
              ? `هزینه ارسال ${selectedMethod.name} — مبلغ قابل پرداخت`
              : 'مبلغ قابل پرداخت'}
          </span>
          <span className="text-[14px] font-black text-brand-800">
            {formatPrice(displayTotal)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || !storeOpen}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-sm font-black text-white shadow-card transition-all active:scale-[0.98] active:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden />
          ) : (
            'ثبت سفارش'
          )}
        </button>
      </div>
    </div>
  );
}
