'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Loader2,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState, ErrorState } from '@/components/shared/States';
import { Switch } from '@/components/ui/switch';
import { MapPicker } from '@/components/admin/MapPicker';
import { useApi } from '@/hooks/use-api';
import {
  apiDelete,
  apiPost,
  apiPut,
  ApiClientError,
} from '@/lib/api-client';
import { toEnDigits, toFaDigits } from '@/lib/fa';
import { formatPhoneFa, normalizePhone } from '@/lib/phone';
import type { AddressDTO } from '@/server/services/address.service';
import { useAuthStore } from '@/stores/auth-store';
import { useRouterStore } from '@/stores/router-store';

/**
 * دفترچه آدرس (فاز ۱۰) — مدیریت آدرس‌های تحویل کاربر
 *
 * - فهرست: کارت هر آدرس با برچسب، گیرنده، نشانی و نشان «پیش‌فرض»
 * - افزودن/ویرایش: شیت پایین‌صفحه با همان قواعد zod تسویه حساب
 * - حذف: تأیید دومرحله‌ای (دکمه قرمز دوم) — بدون دیالوگ سنگین
 * - پیش‌فرض: دقیقاً یک پیش‌فرض؛ تعویض و ارتقای خودکار سمت سرور
 * - تسویه حساب آدرس پیش‌فرض را پیش‌پر می‌کند (خرید بعدی دو برابر سریع‌تر)
 */

const inputCls =
  'h-11 w-full rounded-2xl border border-cream-200 bg-white px-3.5 text-[13px] font-bold text-ink-900 shadow-card outline-none transition-colors placeholder:font-normal placeholder:text-ink-300 focus:border-brand-400';
const labelCls = 'mb-1.5 block text-[11px] font-bold text-ink-600';

const EMPTY_FORM = {
  title: '',
  receiverName: '',
  receiverPhone: '',
  province: '',
  city: '',
  postalCode: '',
  fullAddress: '',
  /** پین نقشه — رشتهٔ خالی یعنی کاربر موقعیت را انتخاب نکرده */
  latitude: '',
  longitude: '',
  isDefault: false,
};

export function AddressesView() {
  const user = useAuthStore((s) => s.user);
  // تا مشخص شدن وضعیت نشست، اسکلتون — نه فلش گمراه‌کننده «وارد شوید»
  // (همان الگوی CheckoutView؛ hydrate در راه‌اندازی اپ چند صد میلی‌ثانیه طول می‌کشد)
  const authHydrated = useAuthStore((s) => s.hydrated);
  const push = useRouterStore((s) => s.push);

  const {
    data: addresses,
    loading,
    error,
    reload,
  } = useApi<AddressDTO[]>(user ? '/api/addresses' : null);

  // شیت فرم: null = بسته | 'new' = افزودن | AddressDTO = ویرایش همان آدرس
  const [sheet, setSheet] = useState<'new' | AddressDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      // بازگشت خودکار دکمه به حالت عادی — تأیید فراموش‌شده نمی‌ماند
      setTimeout(() => setConfirmDeleteId((cur) => (cur === id ? null : cur)), 3500);
      return;
    }
    setDeleting(true);
    try {
      await apiDelete(`/api/addresses/${id}`);
      toast.success('آدرس حذف شد');
      setConfirmDeleteId(null);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'حذف آدرس ناموفق بود');
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (addr: AddressDTO) => {
    try {
      await apiPut<AddressDTO>(`/api/addresses/${addr.id}`, {
        title: addr.title,
        receiverName: addr.receiverName,
        receiverPhone: addr.receiverPhone,
        province: addr.province,
        city: addr.city,
        postalCode: addr.postalCode ?? undefined,
        fullAddress: addr.fullAddress,
        isDefault: true,
      });
      toast.success(`«${addr.title}» پیش‌فرض شد`);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'تنظیم پیش‌فرض ناموفق بود');
    }
  };

  // ——— وضعیت نشست هنوز مشخص نیست — اسکلتون (بدون فلش «وارد شوید») ———
  if (!authHydrated) {
    return (
      <div className="flex min-h-full flex-col">
        <TopBar title="آدرس‌های من" />
        <div className="space-y-3 px-4 pt-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="shimmer h-28 rounded-3xl" aria-label="در حال بارگذاری" />
          ))}
        </div>
      </div>
    );
  }

  // ——— مهمان ———
  if (!user) {
    return (
      <div className="flex min-h-full flex-col">
        <TopBar title="آدرس‌های من" />
        <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500">
            <MapPin className="h-8 w-8" strokeWidth={1.5} aria-hidden />
          </span>
          <p className="mt-4 text-[15px] font-extrabold text-ink-900">
            برای مدیریت آدرس‌ها وارد شوید
          </p>
          <p className="mt-1.5 text-xs leading-6 text-ink-500">
            آدرس‌های ذخیره‌شده، تسویه حساب خریدهای بعدی را سریع‌تر می‌کند
          </p>
          <button
            type="button"
            onClick={() => push({ view: 'login', key: 'login' })}
            className="mt-5 h-11 rounded-2xl bg-brand-500 px-8 text-[13px] font-black text-white transition-transform active:scale-95"
          >
            ورود | ثبت‌نام
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopBar title="آدرس‌های من" />

      <div className="px-4 pb-8 pt-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="shimmer h-28 rounded-3xl" aria-label="در حال بارگذاری" />
            ))}
          </div>
        ) : error ? (
          <ErrorState
            title="آدرس‌ها بارگذاری نشد"
            description={error}
            onRetry={reload}
          />
        ) : !addresses || addresses.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="هنوز آدرسی ندارید"
            description="آدرس تحویل را یک‌بار ذخیره کنید تا در خریدهای بعدی خودکار پر شود."
            actionLabel="افزودن اولین آدرس"
            onAction={() => setSheet('new')}
            className="pt-6"
          />
        ) : (
          <>
            <p className="mb-2 text-[11px] text-ink-400">
              {`${toFaDigits(addresses.length)} آدرس ذخیره‌شده`}
            </p>
            <ul className="space-y-2.5">
              {addresses.map((addr) => (
                <li
                  key={addr.id}
                  className={`rounded-3xl border bg-white p-4 shadow-card ${
                    addr.isDefault ? 'border-brand-300 ring-1 ring-brand-200' : 'border-cream-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <MapPin className="h-4 w-4" aria-hidden />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-ink-900">
                      {addr.title}
                    </p>
                    {addr.isDefault && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[9.5px] font-black text-brand-700">
                        <Star className="h-3 w-3 fill-brand-500 text-brand-500" aria-hidden />
                        پیش‌فرض
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 space-y-1 pr-10">
                    <p className="text-[12px] font-bold text-ink-800">
                      {`${addr.receiverName} — ${formatPhoneFa(addr.receiverPhone)}`}
                    </p>
                    <p className="text-[11px] leading-5 text-ink-500">
                      {`${addr.province}، ${addr.city}`}
                    </p>
                    <p className="text-[11px] leading-5 text-ink-600">{addr.fullAddress}</p>
                    {addr.postalCode && (
                      <p className="text-[10px] text-ink-400" dir="ltr">
                        {toFaDigits(addr.postalCode)}
                      </p>
                    )}
                    {addr.latitude != null && addr.longitude != null && (
                      <p className="flex items-center gap-1 text-[10px] font-bold text-brand-600">
                        <MapPin className="h-3 w-3" aria-hidden />
                        موقعیت دقیق روی نقشه ثبت شده
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 pr-10">
                    {!addr.isDefault && (
                      <button
                        type="button"
                        onClick={() => void handleSetDefault(addr)}
                        className="flex h-8 items-center gap-1 rounded-xl bg-cream-100 px-3 text-[11px] font-black text-ink-700 transition-transform active:scale-95"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        پیش‌فرض
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSheet(addr)}
                      className="flex h-8 items-center gap-1 rounded-xl bg-cream-100 px-3 text-[11px] font-black text-ink-700 transition-transform active:scale-95"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      ویرایش
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(addr.id)}
                      disabled={deleting}
                      className={`flex h-8 items-center gap-1 rounded-xl px-3 text-[11px] font-black transition-all active:scale-95 disabled:opacity-60 ${
                        confirmDeleteId === addr.id
                          ? 'bg-red-500 text-white'
                          : 'bg-red-50 text-red-600'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      {confirmDeleteId === addr.id ? 'تأیید حذف؟' : 'حذف'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ——— دکمه افزودن ——— */}
        {(!loading && !error) && (
          <button
            type="button"
            onClick={() => setSheet('new')}
            className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/40 text-[13px] font-black text-brand-700 transition-transform active:scale-[0.98]"
          >
            <Plus className="h-4.5 w-4.5" aria-hidden />
            افزودن آدرس جدید
          </button>
        )}
      </div>

      {/* ——— شیت فرم افزودن/ویرایش ——— */}
      <AddressFormSheet
        open={sheet !== null}
        editing={sheet !== 'new' && sheet !== null ? sheet : null}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setSheet(null);
          reload();
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------
// شیت فرم افزودن/ویرایش آدرس
// ------------------------------------------------------------

export function AddressFormSheet({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: AddressDTO | null;
  onClose: () => void;
  onSaved: (address: AddressDTO) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // کلید باز شدن شیت — هر بار باز شدن، فرم تازه با مقادیر ویرایش پر می‌شود
  const [lastEditing, setLastEditing] = useState<AddressDTO | null | 'closed'>('closed');

  if (open && lastEditing === 'closed') {
    setLastEditing(editing);
    setFormError(null);
    setForm(
      editing
        ? {
            title: editing.title,
            receiverName: editing.receiverName,
            receiverPhone: editing.receiverPhone,
            province: editing.province,
            city: editing.city,
            postalCode: editing.postalCode ?? '',
            fullAddress: editing.fullAddress,
            latitude: editing.latitude != null ? String(editing.latitude) : '',
            longitude: editing.longitude != null ? String(editing.longitude) : '',
            isDefault: editing.isDefault,
          }
        : EMPTY_FORM
    );
  } else if (!open && lastEditing !== 'closed') {
    setLastEditing('closed');
  }

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  // پین نقشه فقط وقتی معتبر است که هر دو مختصات عددی باشند — جفت ناقص ارسال نمی‌شود
  const hasCoords =
    form.latitude !== '' &&
    form.longitude !== '' &&
    Number.isFinite(Number(form.latitude)) &&
    Number.isFinite(Number(form.longitude));

  /** موقعیت فعلی دستگاه — GPS مرورگر؛ رد شدن/خطا فقط پیام می‌دهد، فرم دست‌نخورده می‌ماند */
  const locateMe = () => {
    if (!navigator.geolocation) {
      toast.error('مرورگر شما از موقعیت‌یابی پشتیبانی نمی‌کند');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        toast.success('موقعیت فعلی شما روی نقشه گذاشته شد — در صورت نیاز مارکر را جابجا کنید');
      },
      () => toast.error('دسترسی به موقعیت ممکن نشد — مارکر را با دست جابجا کنید'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmit = async () => {
    setFormError(null);
    // ——— اعتبارسنجی سبک کلاینت (منبع حقیقت: zod سمت سرور) ———
    if (form.title.trim().length < 2) {
      setFormError('برچسب آدرس را وارد کنید (مثلاً «خانه»)');
      return;
    }
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
    const body = {
      title: form.title.trim(),
      receiverName: form.receiverName.trim(),
      receiverPhone: form.receiverPhone,
      province: form.province.trim(),
      city: form.city.trim(),
      postalCode: postal || undefined,
      fullAddress: form.fullAddress.trim(),
      ...(hasCoords
        ? { latitude: Number(form.latitude), longitude: Number(form.longitude) }
        : {}),
      isDefault: form.isDefault,
    };
    try {
      let saved: AddressDTO;
      if (editing) {
        saved = await apiPut<AddressDTO>(`/api/addresses/${editing.id}`, body);
        toast.success('آدرس به‌روزرسانی شد');
      } else {
        saved = await apiPost<AddressDTO>('/api/addresses', body);
        toast.success('آدرس ذخیره شد');
      }
      onSaved(saved);
    } catch (e) {
      setFormError(
        e instanceof ApiClientError ? e.message : 'ذخیره آدرس ناموفق بود'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="address-form"
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="بستن فرم"
            onClick={onClose}
            className="absolute inset-0 bg-ink-900/45 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'ویرایش آدرس' : 'افزودن آدرس'}
            className="relative flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-3xl bg-cream-50 shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="shrink-0 pb-1 pt-3">
              <div className="mx-auto h-1 w-10 rounded-full bg-cream-300" />
            </div>
            <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-1">
              <h2 className="text-[15px] font-black text-ink-900">
                {editing ? 'ویرایش آدرس' : 'افزودن آدرس جدید'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink-500 shadow-card"
                aria-label="بستن"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* ——— فیلدهای فرم — قابل اسکرول ——— */}
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-3">
              <div>
                <label className={labelCls} htmlFor="ad-title">
                  برچسب آدرس
                </label>
                <input
                  id="ad-title"
                  className={inputCls}
                  value={form.title}
                  onChange={(e) => set('title')(e.target.value)}
                  placeholder="مثلاً خانه یا محل کار"
                  maxLength={30}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="ad-name">
                  نام و نام خانوادگی گیرنده
                </label>
                <input
                  id="ad-name"
                  className={inputCls}
                  value={form.receiverName}
                  onChange={(e) => set('receiverName')(e.target.value)}
                  placeholder="مثلاً سارا محمدی"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="ad-phone">
                  شماره تماس گیرنده
                </label>
                <input
                  id="ad-phone"
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
                  <label className={labelCls} htmlFor="ad-province">
                    استان
                  </label>
                  <input
                    id="ad-province"
                    className={inputCls}
                    value={form.province}
                    onChange={(e) => set('province')(e.target.value)}
                    placeholder="تهران"
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="ad-city">
                    شهر
                  </label>
                  <input
                    id="ad-city"
                    className={inputCls}
                    value={form.city}
                    onChange={(e) => set('city')(e.target.value)}
                    placeholder="تهران"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="ad-postal">
                  کد پستی (اختیاری)
                </label>
                <input
                  id="ad-postal"
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
                <label className={labelCls} htmlFor="ad-full">
                  نشانی کامل پستی
                </label>
                <textarea
                  id="ad-full"
                  rows={3}
                  className="w-full rounded-2xl border border-cream-200 bg-white px-3.5 py-2.5 text-[13px] font-bold leading-6 text-ink-900 shadow-card outline-none transition-colors placeholder:font-normal placeholder:text-ink-300 focus:border-brand-400"
                  value={form.fullAddress}
                  onChange={(e) => set('fullAddress')(e.target.value)}
                  placeholder="خیابان، کوچه، پلاک و واحد"
                  maxLength={300}
                />
              </div>

              {/* ——— پین نقشه تحویل (درخواست کاربر) — مختصات با آدرس ذخیره می‌شود ——— */}
              <div className="rounded-2xl border border-cream-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-bold text-ink-600">
                    موقعیت دقیق روی نقشه (اختیاری)
                  </p>
                  <button
                    type="button"
                    onClick={locateMe}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-xl bg-brand-50 px-2.5 text-[10.5px] font-black text-brand-700 transition-transform active:scale-95"
                  >
                    <LocateFixed className="h-3.5 w-3.5" aria-hidden />
                    موقعیت فعلی من
                  </button>
                </div>
                <MapPicker
                  lat={form.latitude}
                  lng={form.longitude}
                  onChange={(lat, lng) =>
                    setForm((f) => ({ ...f, latitude: lat, longitude: lng }))
                  }
                  ariaLabel="نقشه انتخاب موقعیت دقیق تحویل سفارش"
                />
                <p className="mt-2 text-[10px] leading-4 text-ink-400">
                  روی نقشه بزنید یا مارکر را بکشید تا محل دقیق تحویل ثبت شود
                </p>
                {hasCoords && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-ink-600" dir="ltr">
                      {`${form.latitude} , ${form.longitude}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, latitude: '', longitude: '' }))
                      }
                      className="text-[10px] font-black text-red-500"
                    >
                      حذف مختصات
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-cream-200 bg-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-extrabold text-ink-900">
                    آدرس پیش‌فرض من
                  </p>
                  <p className="mt-0.5 text-[10.5px] leading-4 text-ink-500">
                    در تسویه حساب خودکار پر می‌شود
                  </p>
                </div>
                <Switch
                  checked={form.isDefault}
                  onCheckedChange={(v) => set('isDefault')(v)}
                  aria-label="تنظیم به‌عنوان آدرس پیش‌فرض"
                />
              </div>

              {formError && (
                <p
                  role="alert"
                  className="rounded-2xl bg-red-50 px-3.5 py-2.5 text-[11px] font-bold leading-5 text-red-600"
                >
                  {formError}
                </p>
              )}
            </div>

            {/* ——— نوار ذخیره ——— */}
            <div className="shrink-0 border-t border-cream-200 bg-cream-50 p-3 pb-safe">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-sm font-black text-white shadow-card transition-all active:scale-[0.98] active:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-4.5 w-4.5" aria-hidden />
                )}
                {editing ? 'ذخیره تغییرات' : 'ذخیره آدرس'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
