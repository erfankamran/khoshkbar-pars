'use client';

import { useEffect, useState } from 'react';
import {
  Clock,
  Fingerprint,
  KeyRound,
  Loader2,
  LogOut,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState, ErrorState } from '@/components/shared/States';
import { useApi } from '@/hooks/use-api';
import { apiDelete, apiPost, ApiClientError } from '@/lib/api-client';
import { registerPasskey, webAuthnSupported } from '@/lib/webauthn-client';
import { formatJalaliDate } from '@/lib/jalali';
import { useAuthStore } from '@/stores/auth-store';

/**
 * امنیت حساب (فاز امنیت) — مدیریت Passkeyها و نشست‌های فعال
 *
 * Passkey:
 *  - ثبت چند کلید برای دستگاه‌های مختلف + حذف
 *  - حذف آخرین کلید حساب را قفل نمی‌کند: ورود با OTP همیشه جایگزین فعال است
 *  - نام دستگاه/نوع کلید (multi-device = همگام‌شونده با گذرواژه‌بان ابری)
 * نشست‌ها:
 *  - فهرست نشست‌های فعال با آخرین فعالیت + ابطال تک‌نشست + خروج از دستگاه‌های دیگر
 */

interface PasskeyRow {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
  deviceType: string;
}

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export function SecurityView() {
  const logout = useAuthStore((s) => s.logout);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [adding, setAdding] = useState(false);

  const {
    data: pkData,
    loading: pkLoading,
    error: pkError,
    reload: reloadPasskeys,
  } = useApi<{ passkeys: PasskeyRow[] }>('/api/user/passkeys');

  const {
    data: sessData,
    loading: sessLoading,
    error: sessError,
    reload: reloadSessions,
  } = useApi<{ sessions: SessionRow[] }>('/api/user/sessions');

  useEffect(() => {
    setPasskeySupported(webAuthnSupported());
  }, []);

  const addPasskey = async () => {
    setAdding(true);
    try {
      await registerPasskey();
      toast.success('روش ورود جدید ذخیره شد');
      reloadPasskeys();
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.message : 'ثبت Passkey ناموفق بود — دوباره تلاش کنید'
      );
    } finally {
      setAdding(false);
    }
  };

  const deletePasskey = async (id: string) => {
    try {
      await apiDelete(`/api/user/passkeys/${id}`);
      toast.success('روش ورود حذف شد — ورود با کد پیامکی همچنان فعال است');
      reloadPasskeys();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'حذف ناموفق بود');
    }
  };

  const revokeSession = async (id: string) => {
    try {
      await apiDelete(`/api/user/sessions/${id}`);
      toast.success('نشست دستگاه باطل شد');
      reloadSessions();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'ابطال ناموفق بود');
    }
  };

  const revokeOthers = async () => {
    try {
      const { revokedCount } = await apiPost<{ revokedCount: number }>(
        '/api/user/sessions/revoke-others'
      );
      toast.success(
        revokedCount > 0
          ? `${revokedCount} نشست دیگر باطل شد`
          : 'نشست دیگری برای باطل کردن نیست'
      );
      reloadSessions();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'ابطال ناموفق بود');
    }
  };

  const passkeys = pkData?.passkeys ?? [];
  const sessions = sessData?.sessions ?? [];
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <div>
      <TopBar title="امنیت حساب" />

      <div className="px-4 py-4">
        {/* ——— Passkeyها ——— */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[12.5px] font-black text-ink-800">
              <Fingerprint className="h-4 w-4 text-brand-600" aria-hidden />
              روش‌های ورود ذخیره‌شده
            </p>
            {passkeySupported && (
              <button
                type="button"
                onClick={() => void addPasskey()}
                disabled={adding}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-[11.5px] font-black text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {adding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                )}
                افزودن
              </button>
            )}
          </div>

          {pkLoading ? (
            <div className="shimmer h-28 rounded-3xl" aria-label="در حال بارگذاری" />
          ) : pkError ? (
            <ErrorState title="دریافت روش‌های ورود ناموفق بود" onRetry={reloadPasskeys} />
          ) : passkeys.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="هنوز روش ورودی ذخیره نکرده‌اید"
              description={
                passkeySupported
                  ? 'برای ورود سریع با اثر انگشت یا PIN، یک Passkey ذخیره کنید'
                  : 'مرورگر این دستگاه از Passkey پشتیبانی نمی‌کند — ورود با کد پیامکی فعال است'
              }
            />
          ) : (
            <div className="space-y-2.5">
              {passkeys.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-cream-200 bg-white px-4 py-3 shadow-card"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                      <Fingerprint className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-black text-ink-900">
                        {p.deviceName ?? 'کلید دستگاه'}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-ink-400">
                        ثبت: {formatJalaliDate(p.createdAt)}
                        {p.lastUsedAt && ` — آخرین ورود: ${formatJalaliDate(p.lastUsedAt)}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                        p.deviceType === 'multiDevice'
                          ? 'bg-brand-50 text-brand-700'
                          : 'bg-cream-100 text-ink-500'
                      }`}
                    >
                      {p.deviceType === 'multiDevice' ? 'همگام‌شونده' : 'همین دستگاه'}
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                          aria-label="حذف روش ورود"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-right">حذف روش ورود؟</AlertDialogTitle>
                          <AlertDialogDescription className="text-right">
                            {passkeys.length > 1
                              ? `کلید «${p.deviceName ?? 'دستگاه'}» حذف شود؟`
                              : 'این تنها کلید ذخیره‌شده شماست. پس از حذف، ورود با کد پیامکی (OTP) همچنان فعال می‌ماند — حساب قفل نمی‌شود.'}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-row-reverse gap-2">
                          <AlertDialogAction
                            onClick={() => void deletePasskey(p.id)}
                            className="bg-red-600 text-white hover:bg-red-700"
                          >
                            حذف کن
                          </AlertDialogAction>
                          <AlertDialogCancel>انصراف</AlertDialogCancel>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-5 text-ink-400">
            <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            کلیدها در Google Password Manager، iCloud Keychain یا گذرواژه‌بان
            سازگارِ دستگاه شما ذخیره می‌شوند — کلید خصوصی هرگز به سرور نمی‌رسد.
          </p>
        </section>

        {/* ——— نشست‌های فعال ——— */}
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[12.5px] font-black text-ink-800">
              <MonitorSmartphone className="h-4 w-4 text-brand-600" aria-hidden />
              نشست‌های فعال
            </p>
            {otherSessions.length > 0 && (
              <button
                type="button"
                onClick={() => void revokeOthers()}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-[11px] font-black text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                خروج از دستگاه‌های دیگر
              </button>
            )}
          </div>

          {sessLoading ? (
            <div className="shimmer h-28 rounded-3xl" aria-label="در حال بارگذاری" />
          ) : sessError ? (
            <ErrorState title="دریافت نشست‌ها ناموفق بود" onRetry={reloadSessions} />
          ) : (
            <div className="space-y-2.5">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-cream-200 bg-white px-4 py-3 shadow-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[12px] font-bold text-ink-800">
                          {s.userAgent ?? 'دستگاه ناشناس'}
                        </p>
                        {s.isCurrent && (
                          <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-black text-white">
                            این دستگاه
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10.5px] text-ink-400">
                        آخرین فعالیت: {formatJalaliDate(s.lastUsedAt)}
                        {s.ip ? ` — IP: ${s.ip}` : ''}
                      </p>
                    </div>
                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => void revokeSession(s.id)}
                        className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600 hover:bg-cream-200"
                      >
                        <RefreshCw className="h-3 w-3" aria-hidden />
                        باطل کردن
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ——— بازیابی ——— */}
        <section className="mt-6 rounded-2xl border border-dashed border-cream-200 bg-cream-50 px-4 py-3">
          <p className="text-[11px] font-bold text-ink-600">بازیابی دسترسی</p>
          <p className="mt-1 text-[10.5px] leading-5 text-ink-400">
            اگر Passkey در دسترس نبود، همیشه می‌توانید با شماره موبایل و کد
            پیامکی وارد شوید و از همین صفحه کلید جدید ثبت کنید. تغییرات حساس
            حساب (افزودن/حذف کلید، ابطال نشست، تغییر ایمیل) در لاگ امنیتی ثبت
            می‌شود.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 text-[11px] font-black text-red-600 underline underline-offset-4"
          >
            خروج از حساب در این دستگاه
          </button>
        </section>
      </div>
    </div>
  );
}
