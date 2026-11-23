'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Camera,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { TopBar } from '@/components/shared/TopBar';
import { ErrorState } from '@/components/shared/States';
import { useApi } from '@/hooks/use-api';
import { apiPost, apiPut, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useRouterStore } from '@/stores/router-store';
import { formatJalaliDate } from '@/lib/jalali';
import { toFaDigits } from '@/lib/fa';
import { NUT_AVATARS } from '@/lib/avatars';

/**
 * حساب کاربری من (فاز پروفایل) — تفکیک هویت کاربر از هویت فروشگاه
 *
 * - نام شخصی، ایمیل، آواتار و تاریخ عضویت — شماره موبایل فقط نمایش (تغییرش
 *   با تأیید مجدد OTP است، نه ویرایش پروفایل)
 * - کاربر بدون نام: «کاربر جدید» — نام فروشگاه هرگز جای نام مشتری نمی‌نشیند
 * - آواتار: آپلود به /api/user/profile/avatar (همان زیرساخت رسانهٔ امن؛ ۲MB)
 * - امنیت حساب: لینک به نمای مدیریت Passkeyها و نشست‌ها
 */

interface ProfileData {
  id: string;
  phone: string;
  phoneVerifiedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  memberSince: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ProfileView() {
  const push = useRouterStore((s) => s.push);
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const { data, loading, error, reload } = useApi<ProfileData>(user ? '/api/user/profile' : null);

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickingAvatar, setPickingAvatar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // پر کردن فرم هنگام ورود به حالت ویرایش (و پس از دریافت داده)
  useEffect(() => {
    if (data) {
      setFirstName(data.firstName ?? '');
      setLastName(data.lastName ?? '');
      setEmail(data.email ?? '');
    }
  }, [data, editing]);

  const displayName = data?.fullName?.trim() || 'کاربر جدید';

  const saveProfile = async () => {
    setSaving(true);
    try {
      const updated = await apiPut<ProfileData>('/api/user/profile', {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim(),
      });
      // هویت نمایشی (هدر/حساب) هم‌زمان به‌روز می‌شود
      if (user) setUser({ ...user, fullName: updated.fullName });
      toast.success('پروفایل ذخیره شد');
      setEditing(false);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'ذخیره ناموفق بود');
    } finally {
      setSaving(false);
    }
  };

  const onPickAvatar = () => fileRef.current?.click();

  /** فاز آواتار — انتخاب شخصیت پارس از لیست ۸ گانه */
  const pickNutAvatar = async (url: string) => {
    if (data?.avatarUrl === url) return;
    setPickingAvatar(url);
    try {
      const updated = await apiPut<ProfileData>('/api/user/profile', { avatarUrl: url });
      if (user) setUser({ ...user, avatarUrl: updated.avatarUrl });
      toast.success('شخصیت شما به‌روزرسانی شد');
      reload();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'تغییر آواتار ناموفق بود');
    } finally {
      setPickingAvatar(null);
    }
  };

  const onAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('حجم تصویر حداکثر ۲ مگابایت است');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiPost<{ avatarUrl: string }>('/api/user/profile/avatar', form);
      toast.success('تصویر پروفایل به‌روزرسانی شد');
      if (user) setUser({ ...user, avatarUrl: res.avatarUrl });
      reload();
      void res;
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'آپلود ناموفق بود');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const canSave =
    (firstName.trim().length === 0 || firstName.trim().length >= 2) &&
    (lastName.trim().length === 0 || lastName.trim().length >= 2) &&
    (email.trim().length === 0 || EMAIL_RE.test(email.trim()));

  return (
    <div>
      <TopBar title="حساب کاربری من" />

      <div className="px-4 py-4">
        {loading ? (
          <div className="space-y-3">
            <div className="shimmer h-32 rounded-3xl" aria-label="در حال بارگذاری" />
            <div className="shimmer h-40 rounded-3xl" aria-label="در حال بارگذاری" />
          </div>
        ) : error || !data ? (
          <ErrorState title="دریافت پروفایل ناموفق بود" onRetry={reload} />
        ) : (
          <>
            {/* ——— کارت هویت ——— */}
            <section className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={onPickAvatar}
                  disabled={uploading}
                  className="group relative shrink-0"
                  aria-label="تغییر تصویر پروفایل"
                >
                  {data.avatarUrl ? (
                    <img
                      src={data.avatarUrl}
                      alt="تصویر پروفایل"
                      className="h-16 w-16 rounded-full border-2 border-cream-200 object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-400">
                      <Camera className="h-7 w-7" strokeWidth={1.5} aria-hidden />
                    </span>
                  )}
                  <span className="absolute -bottom-0.5 -left-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-card">
                    {uploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <Camera className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => void onAvatarFile(e.target.files?.[0])}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-black text-ink-900">{displayName}</p>
                  <p dir="ltr" className="mt-0.5 text-right font-mono text-[12px] font-bold text-ink-500">
                    {toFaDigits(data.phone)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {data.phoneVerifiedAt && (
                      <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                        <BadgeCheck className="h-3 w-3" aria-hidden />
                        شماره تأییدشده
                      </span>
                    )}
                    <span className="rounded-full bg-cream-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">
                      عضویت از {formatJalaliDate(data.memberSince)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-cream-100 px-3 text-[11.5px] font-bold text-ink-600 hover:bg-cream-200"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {editing ? 'انصراف' : 'ویرایش'}
                </button>
              </div>
            </section>

            {/* ——— شخصیت‌های پارس (فاز آواتار) — انتخاب از ۸ شخصیت مغز ——— */}
            <section className="mt-3 rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-black text-ink-900">شخصیت‌های پارس</p>
                <p className="text-[10px] text-ink-400">یکی را انتخاب کنید یا عکس بگذارید</p>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2.5">
                {NUT_AVATARS.map((av) => {
                  const selected = data.avatarUrl === av.url;
                  const busy = pickingAvatar === av.url;
                  return (
                    <button
                      key={av.key}
                      type="button"
                      onClick={() => void pickNutAvatar(av.url)}
                      disabled={pickingAvatar !== null}
                      aria-label={`انتخاب شخصیت ${av.label}`}
                      aria-pressed={selected}
                      className={`relative flex flex-col items-center gap-1 rounded-2xl border p-2 transition-all active:scale-95 disabled:opacity-60 ${
                        selected
                          ? 'border-brand-500 bg-brand-50 shadow-card'
                          : 'border-cream-200 bg-white hover:border-brand-200'
                      }`}
                    >
                      { }
                      <img
                        src={av.url}
                        alt={`شخصیت ${av.label}`}
                        className={`h-11 w-11 rounded-full object-cover ${
                          selected ? 'ring-2 ring-brand-500 ring-offset-1' : ''
                        }`}
                      />
                      <span
                        className={`text-[9.5px] font-black ${
                          selected ? 'text-brand-700' : 'text-ink-500'
                        }`}
                      >
                        {busy ? '…' : av.label}
                      </span>
                      {selected && (
                        <span className="absolute -top-1 -left-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-brand-600 text-white">
                          <BadgeCheck className="h-3 w-3" aria-hidden />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ——— ویرایش اطلاعات شخصی ——— */}
            {editing ? (
              <section className="mt-3 rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label htmlFor="pf-first" className="text-[11px] font-bold text-ink-600">
                      نام
                    </label>
                    <input
                      id="pf-first"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      maxLength={40}
                      className="h-11 w-full rounded-2xl border border-cream-200 px-4 text-[13px] font-bold text-ink-900 outline-none focus:border-brand-400"
                      placeholder="مثلاً علی"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="pf-last" className="text-[11px] font-bold text-ink-600">
                      نام خانوادگی
                    </label>
                    <input
                      id="pf-last"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      maxLength={40}
                      className="h-11 w-full rounded-2xl border border-cream-200 px-4 text-[13px] font-bold text-ink-900 outline-none focus:border-brand-400"
                      placeholder="مثلاً رضایی"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="pf-email" className="text-[11px] font-bold text-ink-600">
                      ایمیل (اختیاری)
                    </label>
                    <input
                      id="pf-email"
                      type="email"
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={120}
                      className="h-11 w-full rounded-2xl border border-cream-200 px-4 text-left font-mono text-[12px] text-ink-900 outline-none focus:border-brand-400"
                      placeholder="you@example.com"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveProfile()}
                    disabled={!canSave || saving}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-sm font-black text-white shadow-card transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {saving && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />}
                    ذخیره اطلاعات
                  </button>
                </div>
              </section>
            ) : (
              /* ——— اطلاعات حساب (نمایش) ——— */
              <section className="mt-3 overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-card">
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[12px] font-bold text-ink-500">نام</span>
                  <span className="text-[12.5px] font-black text-ink-900">
                    {data.firstName ?? '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-cream-200 px-4 py-3.5">
                  <span className="text-[12px] font-bold text-ink-500">نام خانوادگی</span>
                  <span className="text-[12.5px] font-black text-ink-900">
                    {data.lastName ?? '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-cream-200 px-4 py-3.5">
                  <span className="text-[12px] font-bold text-ink-500">ایمیل</span>
                  <span dir="ltr" className="text-right font-mono text-[11.5px] font-bold text-ink-700">
                    {data.email ?? '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-cream-200 px-4 py-3.5">
                  <span className="text-[12px] font-bold text-ink-500">شماره موبایل</span>
                  <span dir="ltr" className="text-right font-mono text-[12px] font-black text-ink-900">
                    {toFaDigits(data.phone)}
                  </span>
                </div>
              </section>
            )}

            {/* ——— امنیت حساب ——— */}
            <button
              type="button"
              onClick={() => push({ view: 'security' })}
              className="mt-3 flex w-full items-center justify-between rounded-3xl border border-cream-200 bg-white px-4 py-4 shadow-card transition-transform active:scale-[0.99]"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-right">
                  <span className="block text-[13px] font-black text-ink-900">امنیت حساب</span>
                  <span className="block text-[10.5px] text-ink-400">
                    Passkeyها و نشست‌های فعال
                  </span>
                </span>
              </span>
              <span className="rounded-xl bg-cream-100 px-3 py-1.5 text-[11px] font-bold text-ink-600">
                مشاهده
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
