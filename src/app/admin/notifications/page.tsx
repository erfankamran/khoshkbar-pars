'use client';

import { useState } from 'react';
import { BellRing, RefreshCw, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { EmptyState, PageHeader, Pill, mutationError } from '@/components/admin/kit';
import { StatCard } from '@/components/admin/StatCard';
import { useApi } from '@/hooks/use-api';
import { apiPost } from '@/lib/api-client';
import { toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * اطلاع‌رسانی‌ها (فاز ۱۴) — آمار مخاطبان، ارسال گروهی رضایت‌محور، لاگ ارسال‌ها
 * قاعده: فقط کاربرانی که Push + تبلیغات را رضایت داده‌اند هدف می‌گیرند
 */

interface OverviewResp {
  stats: { activeSubs: number; pushOptIn: number; promoOptIn: number; sent: number; failed: number };
  recentLogs: Array<{
    id: string;
    title: string;
    body: string;
    status: string;
    error: string | null;
    sentAt: string | null;
    createdAt: string;
    user: { phone: string } | null;
  }>;
}

const LINK_VIEWS = [
  { value: 'none', label: 'بدون لینک' },
  { value: 'category', label: 'دسته‌بندی' },
  { value: 'product', label: 'محصول' },
  { value: 'search', label: 'جستجو' },
];

const STATUS_TONES: Record<string, 'brand' | 'red' | 'ink' | 'gold'> = {
  SENT: 'brand',
  FAILED: 'red',
  QUEUED: 'gold',
  SKIPPED: 'ink',
};

const STATUS_LABELS: Record<string, string> = {
  SENT: 'ارسال‌شده',
  FAILED: 'ناموفق',
  QUEUED: 'در صف',
  SKIPPED: 'بدون رضایت',
};

export default function AdminNotificationsPage() {
  return (
    <AdminShell>
      <NotificationsContent />
    </AdminShell>
  );
}

function NotificationsContent() {
  const { data, loading, error, reload } = useApi<OverviewResp>('/api/admin/notifications');
  const [form, setForm] = useState({ title: '', body: '', linkView: 'none', param: '' });
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ audience: number; queued: number } | null>(null);

  const send = async () => {
    setSending(true);
    setLastResult(null);
    try {
      const res = await apiPost<{ audience: number; queued: number; vapidConfigured: boolean }>(
        '/api/admin/notifications/broadcast',
        {
          title: form.title,
          body: form.body,
          linkView: form.linkView === 'none' ? null : form.linkView,
          linkParams:
            form.linkView === 'category' || form.linkView === 'product'
              ? { slug: form.param }
              : form.linkView === 'search'
                ? { q: form.param }
                : undefined,
        }
      );
      setLastResult({ audience: res.audience, queued: res.queued });
      if (!res.vapidConfigured) {
        toast.warning('کلید VAPID تنظیم نشده — اعلان فقط در خوراک داخل اپ ثبت می‌شود');
      } else if (res.queued === 0) {
        toast.info('مخاطبی با رضایت Push و دستگاه فعال یافت نشد');
      } else {
        toast.success(`اعلان برای ${res.queued} دستگاه در صف ارسال قرار گرفت`);
      }
      setForm({ title: '', body: '', linkView: 'none', param: '' });
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setSending(false);
    }
  };

  const canSend = form.title.trim().length >= 3 && form.body.trim().length >= 3;

  if (loading) {
    return (
      <div>
        <PageHeader title="اطلاع‌رسانی‌ها" desc="ارسال گروهی Push به رضایت‌داران" />
        <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title="اطلاع‌رسانی‌ها" desc="ارسال گروهی Push به رضایت‌داران" />
        <EmptyState icon={BellRing} title="دریافت آمار ناموفق بود" hint={error ?? undefined} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="اطلاع‌رسانی‌ها" desc="ارسال گروهی Push به رضایت‌داران + لاگ تحویل" />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={Users} label="دستگاه فعال Push" value={toFaDigits(data.stats.activeSubs)} />
        <StatCard icon={BellRing} label="رضایت Push کلی" value={toFaDigits(data.stats.pushOptIn)} tone="gold" />
        <StatCard icon={Send} label="رضایت اخبار تبلیغاتی" value={toFaDigits(data.stats.promoOptIn)} />
        <StatCard
          icon={BellRing}
          label="ارسال موفق / ناموفق"
          value={`${toFaDigits(data.stats.sent)} / ${toFaDigits(data.stats.failed)}`}
          tone="ink"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {/* فرم ارسال گروهی */}
        <section className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
          <p className="text-[13px] font-black text-ink-900">ارسال گروهی اعلان</p>
          <p className="mt-0.5 text-[10.5px] leading-5 text-ink-400">
            فقط کاربرانی که «دریافت Push» و «اخبار و تخفیف‌ها» را فعال کرده‌اند دریافت می‌کنند —
            ارسال بدون رضایت هرگز انجام نمی‌شود.
          </p>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bc-title">عنوان *</Label>
              <Input
                id="bc-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-9 text-[12.5px]"
                placeholder="مثلاً جشنواره یلدا شروع شد!"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-body">متن *</Label>
              <Textarea
                id="bc-body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="min-h-16 text-[12.5px]"
                rows={2}
                maxLength={200}
                placeholder="تا ۴۰٪ تخفیف آجیل یلدایی"
              />
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <div className="space-y-1.5">
                <Label>مقصد (اختیاری)</Label>
                <Select value={form.linkView} onValueChange={(v) => setForm({ ...form, linkView: v })}>
                  <SelectTrigger className="h-9 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINK_VIEWS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(form.linkView === 'category' || form.linkView === 'product' || form.linkView === 'search') && (
                <div className="space-y-1.5">
                  <Label htmlFor="bc-param">{form.linkView === 'search' ? 'عبارت' : 'اسلاگ'}</Label>
                  <Input
                    id="bc-param"
                    dir="ltr"
                    value={form.param}
                    onChange={(e) => setForm({ ...form, param: e.target.value.toLowerCase() })}
                    className="h-9 text-left font-mono text-[11px]"
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend || sending}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 text-[12.5px] font-black text-white hover:bg-brand-700 disabled:opacity-40"
            >
              {sending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
              ارسال اعلان
            </button>
            {lastResult && (
              <p className="rounded-xl bg-cream-50 p-2.5 text-[10.5px] text-ink-500">
                مخاطبان واجد شرایط: {toFaDigits(lastResult.audience)} — در صف ارسال: {toFaDigits(lastResult.queued)} دستگاه
              </p>
            )}
          </div>
        </section>

        {/* لاگ‌های اخیر */}
        <section className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
          <p className="text-[13px] font-black text-ink-900">آخرین ارسال‌ها</p>
          <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pl-1">
            {data.recentLogs.length === 0 ? (
              <p className="py-8 text-center text-[11.5px] text-ink-400">هنوز اعلانی ثبت نشده است</p>
            ) : (
              data.recentLogs.map((l) => (
                <div key={l.id} className="rounded-2xl border border-cream-100 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[12px] font-black text-ink-800">{l.title}</p>
                    <Pill tone={STATUS_TONES[l.status] ?? 'ink'}>{STATUS_LABELS[l.status] ?? l.status}</Pill>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[10.5px] text-ink-500">{l.body}</p>
                  <p className="mt-1 text-[10px] text-ink-400">
                    {l.user ? (
                      <span dir="ltr">{l.user.phone}</span>
                    ) : (
                      'کاربر حذف‌شده'
                    )}{' '}
                    — {formatJalaliDate(l.createdAt, { withTime: true })}
                    {l.error ? ` — ${l.error}` : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
