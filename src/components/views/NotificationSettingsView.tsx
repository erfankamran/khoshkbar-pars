'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Check, Loader2, Send, ShieldQuestion, X } from 'lucide-react';
import { toast } from 'sonner';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState, ErrorState } from '@/components/shared/States';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { apiPut } from '@/lib/api-client';
import { formatJalaliDate } from '@/lib/jalali';
import {
  resolvePushSupport,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSupport,
} from '@/lib/push-client';
import { useAuthStore } from '@/stores/auth-store';
import { useRouterStore } from '@/stores/router-store';
import { useNotificationCenter } from '@/hooks/use-notification-center';
import { useNotificationNavigation } from '@/hooks/use-notification-navigation';
import type { NotificationPreferenceDTO } from '@/server/services/notification.service';

/**
 * تنظیمات اعلان‌ها (فاز ۱۰ — رضایت‌محور، بخش ۱۱ مشخصات)
 *
 * - کارت اشتراک Push: وضعیت مرورگر (پشتیبانی/مجوز/اشتراک) + فعال‌سازی و لغو
 * - چهار رضایت با کلید فوری: تغییر → PUT بهینه‌گرا → خطا → بازگشت با toast
 * - فید مرکز اعلان‌ها (زنگوله) — لمس اعلان سفارش → جزئیات سفارش
 * - مهمان → دعوت به ورود (همه اندپوینت‌ها auth می‌خواهند)
 */

const PREF_ROWS: Array<{
  key: 'pushEnabled' | 'orderUpdates' | 'promotions' | 'newProducts';
  label: string;
  hint: string;
}> = [
  { key: 'pushEnabled', label: 'دریافت اعلان‌ها', hint: 'رضایت کلی برای نمایش اعلان روی دستگاه' },
  { key: 'orderUpdates', label: 'وضعیت سفارش‌ها', hint: 'ثبت سفارش، ارسال و تحویل' },
  { key: 'promotions', label: 'جشنواره‌ها و تخفیف‌ها', hint: 'پیش‌فرض خاموش — فقط با رضایت شما' },
  { key: 'newProducts', label: 'محصولات جدید', hint: 'معرفی محصولات تازه فصل' },
];

export function NotificationSettingsView() {
  const user = useAuthStore((s) => s.user);
  const push = useRouterStore((s) => s.push);

  const [support, setSupport] = useState<PushSupport | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  // ——— ترجیحات با هوک استاندارد پروژه (لغو خودکار + مدیریت race) ———
  const {
    data: prefs,
    loading: prefsLoading,
    error: prefsError,
    reload: reloadPrefs,
  } = useApi<NotificationPreferenceDTO>(user ? '/api/notifications/preferences' : null);

  // ——— وضعیت Push مرورگر ———
  useEffect(() => {
    if (!user) return;
    void resolvePushSupport().then(setSupport).catch(() => setSupport('unsupported'));
  }, [user]);

  const handleToggle = async (
    key: keyof NotificationPreferenceDTO,
    value: boolean
  ) => {
    if (!prefs) return;
    const body = { ...prefs, [key]: value };
    try {
      await apiPut<NotificationPreferenceDTO>('/api/notifications/preferences', body);
      reloadPrefs(); // منبع حقیقت = سرور
      toast.success('تنظیمات اعلان ذخیره شد');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ذخیره تنظیمات ناموفق بود');
    }
  };

  const handleSubscribe = async () => {
    setPushBusy(true);
    try {
      await subscribeToPush();
      setSupport('subscribed');
      toast.success('اعلان‌ها روی این دستگاه فعال شد');
      if (prefs && !prefs.pushEnabled) {
        try {
          await apiPut<NotificationPreferenceDTO>('/api/notifications/preferences', {
            ...prefs,
            pushEnabled: true,
          });
          reloadPrefs();
        } catch {
          /* رضایت ثبت نشد — کاربر دستی روشن می‌کند */
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'PERMISSION_DENIED') {
        toast.error('مجوز اعلان رد شد — از تنظیمات مرورگر می‌توانید فعال کنید');
        setSupport('denied');
      } else {
        toast.error('فعال‌سازی اعلان‌ها ناموفق بود');
      }
    } finally {
      setPushBusy(false);
    }
  };

  const handleUnsubscribe = async () => {
    setPushBusy(true);
    try {
      await unsubscribeFromPush();
      setSupport('enable');
      toast.success('اعلان‌های این دستگاه خاموش شد');
    } finally {
      setPushBusy(false);
    }
  };

  // ——— مهمان ———
  if (!user) {
    return (
      <div className="flex min-h-full flex-col">
        <TopBar title="تنظیمات اعلان‌ها" />
        <GuestPrompt />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopBar title="تنظیمات اعلان‌ها" />

      <div className="px-4 pb-8 pt-4">
        {/* ——— کارت اشتراک Push ——— */}
        <PushCard
          support={support}
          busy={pushBusy}
          onSubscribe={() => void handleSubscribe()}
          onUnsubscribe={() => void handleUnsubscribe()}
        />

        {/* ——— رضایت‌ها ——— */}
        <section className="mt-4" aria-label="رضایت دریافت اعلان">
          {prefsLoading ? (
            <div className="flex h-28 items-center justify-center rounded-3xl border border-cream-200 bg-white">
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-hidden />
            </div>
          ) : prefsError || !prefs ? (
            <ErrorState
              title="تنظیمات بارگذاری نشد"
              description={prefsError ?? 'خطا در دریافت تنظیمات'}
              onRetry={reloadPrefs}
            />
          ) : (
            <ul className="overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-card">
              {PREF_ROWS.map((row, i) => (
                <li
                  key={row.key}
                  className={`flex items-center gap-3 px-4 py-3.5 ${
                    i < PREF_ROWS.length - 1 ? 'border-b border-cream-100' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-extrabold text-ink-900">{row.label}</p>
                    <p className="mt-0.5 text-[10.5px] leading-4 text-ink-500">{row.hint}</p>
                  </div>
                  <Switch
                    checked={prefs[row.key]}
                    onCheckedChange={(v) => void handleToggle(row.key, v)}
                    aria-label={row.label}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ——— خوراک اعلان‌ها ——— */}
        <NotificationFeed />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// کارت اشتراک Push
// ------------------------------------------------------------

function PushCard({
  support,
  busy,
  onSubscribe,
  onUnsubscribe,
}: {
  support: PushSupport | null;
  busy: boolean;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
}) {
  if (support === null || support === 'unsupported') {
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-100 text-ink-400">
          <BellOff className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-xs text-ink-500">
          مرورگر شما از اعلان پشتیبانی نمی‌کند — پارس روی مرورگرهای مدرن موبایل کامل کار می‌کند
        </p>
      </div>
    );
  }

  if (support === 'not-configured') {
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-100 text-ink-400">
          <ShieldQuestion className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-xs text-ink-500">اعلان‌ها فعلاً در دسترس نیست</p>
      </div>
    );
  }

  if (support === 'subscribed') {
    return (
      <div className="rounded-3xl border border-brand-200 bg-brand-50/60 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
            <Check className="h-5 w-5" strokeWidth={2.4} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-ink-900">
              اعلان‌ها روی این دستگاه فعال است
            </p>
            <p className="mt-0.5 text-[11px] text-ink-500">
              اعلان‌های وضعیت سفارش را همین‌جا می‌بینید
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onUnsubscribe}
          disabled={busy}
          className="mt-3 h-9 w-full rounded-2xl border border-red-200 bg-white text-xs font-black text-red-600 transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'در حال انجام…' : 'خاموش کردن اعلان‌های این دستگاه'}
        </button>
      </div>
    );
  }

  // 'enable' | 'denied'
  return (
    <div
      className={`rounded-3xl border p-4 ${
        support === 'denied'
          ? 'border-cream-200 bg-white'
          : 'border-brand-200 bg-gradient-to-l from-brand-600 to-brand-800'
      }`}
    >
      <div
        className={`flex items-center gap-3 ${
          support === 'denied' ? '' : 'text-white'
        }`}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            support === 'denied' ? 'bg-cream-100 text-ink-400' : 'bg-white/15 text-white'
          }`}
        >
          <Bell className="h-6 w-6" strokeWidth={1.6} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[14px] font-extrabold ${
              support === 'denied' ? 'text-ink-900' : 'text-white'
            }`}
          >
            {support === 'denied' ? 'مجوز اعلان رد شده است' : 'از وضعیت سفارش باخبر شوید'}
          </p>
          <p
            className={`mt-0.5 text-[11px] leading-4 ${
              support === 'denied' ? 'text-ink-500' : 'text-white/80'
            }`}
          >
            {support === 'denied'
              ? 'از تنظیمات مرورگر، مجوز اعلان این سایت را فعال کنید'
              : 'کاملاً اختیاری — فقط اعلان‌هایی که خودتان انتخاب می‌کنید'}
          </p>
        </div>
      </div>
      {support === 'enable' && (
        <button
          type="button"
          onClick={onSubscribe}
          disabled={busy}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[13px] font-black text-brand-800 transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Bell className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          )}
          {busy ? 'در حال فعال‌سازی…' : 'فعال‌سازی اعلان‌ها'}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// خوراک اعلان‌های داخل اپ
// ------------------------------------------------------------

function NotificationFeed() {
  const { items, loading, error, refresh, markOneRead, removeOne, deletingIds } = useNotificationCenter();
  const navigate = useNotificationNavigation(true);

  return (
    <section className="mt-6" aria-label="اعلان‌های اخیر">
      <h2 className="mb-2 text-[13px] font-extrabold text-ink-700">اعلان‌های اخیر</h2>
      {loading ? (
        <div className="flex h-20 items-center justify-center rounded-3xl border border-cream-200 bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-hidden />
        </div>
      ) : error && items.length === 0 ? (
        <ErrorState title="اعلان‌ها بارگذاری نشد" description={error} onRetry={() => void refresh()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Send}
          title="هنوز اعلانی ندارید"
          description="اعلان‌های سفارش و فروشگاه اینجا نمایش داده می‌شود"
        />
      ) : (
        <ul className="overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-card">
          {items.map((n, i) => (
            <li key={n.id} className={`flex items-start ${i < items.length - 1 ? 'border-b border-cream-100' : ''}`}>
              <button
                type="button"
                onClick={() => {
                  void markOneRead(n.id);
                  navigate(n.url);
                }}
                className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-right transition-colors active:bg-cream-50"
              >
                <span
                  className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                    n.isRead ? 'bg-cream-300' : 'bg-red-500'
                  }`}
                  aria-label={n.isRead ? undefined : 'خوانده‌نشده'}
                  aria-hidden={n.isRead}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] font-extrabold text-ink-900">
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-400">
                      {formatJalaliDate(n.createdAt, { withTime: true })}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-5 text-ink-600">
                    {n.body}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`حذف اعلان ${n.title}`}
                title="حذف اعلان"
                disabled={deletingIds.has(n.id)}
                onClick={() => void removeOne(n.id)}
                className="me-1 mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-40"
              >
                {deletingIds.has(n.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// دعوت مهمان
// ------------------------------------------------------------

function GuestPrompt() {
  const push = useRouterStore((s) => s.push);
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        <Bell className="h-8 w-8" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="mt-4 text-[15px] font-extrabold text-ink-900">
        برای تنظیم اعلان‌ها وارد شوید
      </p>
      <p className="mt-1.5 text-xs leading-6 text-ink-500">
        اعلان‌ها کاملاً اختیاری و رضایت‌محور است — با ورود به حساب می‌توانید
        هر کدام را جداگانه روشن یا خاموش کنید
      </p>
      <button
        type="button"
        onClick={() => push({ view: 'login', key: 'login' })}
        className="mt-5 h-11 rounded-2xl bg-brand-500 px-8 text-[13px] font-black text-white transition-transform active:scale-95"
      >
        ورود | ثبت‌نام
      </button>
    </div>
  );
}
