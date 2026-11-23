'use client';

import { useState } from 'react';
import {
  CircleHelp,
  Link as LinkIcon,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { DeleteButton, EmptyState, PageHeader, Pill, mutationError } from '@/components/admin/kit';
import { MediaUploadField } from '@/components/admin/MediaUploadField';
import { useApi } from '@/hooks/use-api';
import { apiPatch, apiPost } from '@/lib/api-client';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { SiteContent } from '@/server/services/content.service';

/**
 * مدیریت محتوای مستقل فروشگاه (فاز ۳) — چهار بخش با چرخه مدیریت خودشان:
 *   پرسش‌های متداول / شماره‌های تماس / نمادهای اعتماد / لینک‌های فوتر
 *
 * تصمیم معماری: این داده‌ها در جداول مستقل‌اند (نه Setting) و از پنل
 * همین صفحه مدیریت می‌شوند؛ تصویر نمادها با MediaUploadField از /api/media
 */

type TabKey = 'faq' | 'contacts' | 'badges' | 'links';

const TABS: Array<{ key: TabKey; label: string; icon: typeof CircleHelp }> = [
  { key: 'faq', label: 'پرسش‌های متداول', icon: CircleHelp },
  { key: 'contacts', label: 'شماره‌های تماس', icon: Phone },
  { key: 'badges', label: 'نمادهای اعتماد', icon: ShieldCheck },
  { key: 'links', label: 'لینک‌های فوتر', icon: LinkIcon },
];

export default function AdminContentPage() {
  return (
    <AdminShell>
      <ContentTabs />
    </AdminShell>
  );
}

function ContentTabs() {
  const [tab, setTab] = useState<TabKey>('faq');

  return (
    <div>
      <PageHeader
        title="محتوای فروشگاه"
        desc="پرسش‌های متداول، تماس، نمادهای اعتماد و لینک‌های فوتر"
      />

      {/* ——— تب‌ها ——— */}
      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto pb-0.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11.5px] font-black transition-colors ${
                active ? 'bg-brand-600 text-white shadow-card' : 'bg-cream-100 text-ink-600 hover:bg-cream-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'faq' && <FaqSection />}
      {tab === 'contacts' && <ContactsSection />}
      {tab === 'badges' && <BadgesSection />}
      {tab === 'links' && <FooterLinksSection />}
    </div>
  );
}

// ═══════════════════ پرسش‌های متداول ═══════════════════

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

function FaqSection() {
  const { data, loading, error, reload } = useApi<{ faq: FaqRow[] }>('/api/admin/faq');
  const [editing, setEditing] = useState<FaqRow | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleActive = async (row: FaqRow) => {
    try {
      await apiPatch(`/api/admin/faq/${row.id}`, { isActive: !row.isActive });
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  return (
    <div>
      <SectionBar onCreate={() => setCreating(true)} createLabel="پرسش جدید" />
      {loading ? (
        <div className="shimmer h-48 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={CircleHelp} title="دریافت پرسش‌ها ناموفق بود" hint={error ?? undefined} />
      ) : data.faq.length === 0 ? (
        <EmptyState icon={CircleHelp} title="پرسشی ثبت نشده است" hint="اولین پرسش متداول را بسازید" />
      ) : (
        <div className="space-y-3">
          {data.faq.map((row) => (
            <div key={row.id} className="rounded-3xl border border-cream-200 bg-white shadow-card">
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-black text-ink-900">{row.question}</p>
                  <Pill tone={row.isActive ? 'green' : 'ink'}>{row.isActive ? 'فعال' : 'غیرفعال'}</Pill>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-6 text-ink-500">{row.answer}</p>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-cream-200 px-4 py-3">
                <label className="flex items-center gap-2 text-[11px] font-bold text-ink-600">
                  <Switch checked={row.isActive} onCheckedChange={() => void toggleActive(row)} />
                  نمایش در فروشگاه
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600 hover:bg-cream-200"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                    ویرایش
                  </button>
                  <DeleteButton
                    path={`/api/admin/faq/${row.id}`}
                    confirmText={`پرسش «${row.question}» حذف شود؟`}
                    onDeleted={reload}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <FaqDialog
          item={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function FaqDialog({
  item,
  onClose,
  onSaved,
}: {
  item?: FaqRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    question: item?.question ?? '',
    answer: item?.answer ?? '',
    sortOrder: item?.sortOrder ?? 0,
    isActive: item?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const canSave = form.question.trim().length >= 4 && form.answer.trim().length >= 4;

  const save = async () => {
    setSaving(true);
    try {
      if (isEdit) {
        await apiPatch(`/api/admin/faq/${item.id}`, form);
        toast.success('پرسش به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/faq', form);
        toast.success('پرسش ساخته شد');
      }
      onSaved();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEdit ? 'ویرایش پرسش' : 'پرسش متداول جدید'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ff-q">پرسش *</Label>
            <Input
              id="ff-q"
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              className="h-9 text-[12.5px]"
              placeholder="مثلاً هزینه ارسال چقدر است؟"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-a">پاسخ *</Label>
            <Textarea
              id="ff-a"
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              className="min-h-24 text-[12.5px]"
              placeholder="پاسخ کامل و روشن بنویسید"
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ff-o">ترتیب نمایش</Label>
              <Input
                id="ff-o"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="h-9 text-[12px]"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-[12px] font-bold text-ink-700">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              فعال
            </label>
          </div>
        </div>
        <DialogFooter className="flex-row-reverse gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-5 text-[12.5px] font-black text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {isEdit ? 'ذخیره' : 'ایجاد'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-cream-200 px-4 text-[12px] font-bold text-ink-600 hover:bg-cream-100"
          >
            انصراف
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════ شماره‌های تماس ═══════════════════

interface ContactRow {
  id: string;
  label: string;
  phone: string;
  sortOrder: number;
  isActive: boolean;
}

function ContactsSection() {
  const { data, loading, error, reload } = useApi<{ contacts: ContactRow[] }>('/api/admin/contacts');
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleActive = async (row: ContactRow) => {
    try {
      await apiPatch(`/api/admin/contacts/${row.id}`, { isActive: !row.isActive });
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  return (
    <div>
      <SectionBar onCreate={() => setCreating(true)} createLabel="شماره جدید" />
      {loading ? (
        <div className="shimmer h-40 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={Phone} title="دریافت شماره‌ها ناموفق بود" hint={error ?? undefined} />
      ) : data.contacts.length === 0 ? (
        <EmptyState icon={Phone} title="شماره‌ای ثبت نشده است" hint="مثلاً پشتیبانی یا سفارش تلفنی" />
      ) : (
        <div className="space-y-3">
          {data.contacts.map((row) => (
            <div key={row.id} className="rounded-3xl border border-cream-200 bg-white shadow-card">
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-black text-ink-900">{row.label}</p>
                    <Pill tone={row.isActive ? 'green' : 'ink'}>{row.isActive ? 'فعال' : 'غیرفعال'}</Pill>
                  </div>
                  <p dir="ltr" className="mt-1 font-mono text-[12px] font-black text-brand-700">
                    {row.phone}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600 hover:bg-cream-200"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                    ویرایش
                  </button>
                  <DeleteButton
                    path={`/api/admin/contacts/${row.id}`}
                    confirmText={`شماره «${row.label}» حذف شود؟`}
                    onDeleted={reload}
                  />
                </div>
              </div>
              <div className="border-t border-dashed border-cream-200 px-4 py-3">
                <label className="flex items-center gap-2 text-[11px] font-bold text-ink-600">
                  <Switch checked={row.isActive} onCheckedChange={() => void toggleActive(row)} />
                  نمایش در فروشگاه
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ContactDialog
          item={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function ContactDialog({
  item,
  onClose,
  onSaved,
}: {
  item?: ContactRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    label: item?.label ?? '',
    phone: item?.phone ?? '',
    sortOrder: item?.sortOrder ?? 0,
    isActive: item?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const canSave = form.label.trim().length >= 2 && form.phone.trim().length >= 7;

  const save = async () => {
    setSaving(true);
    try {
      if (isEdit) {
        await apiPatch(`/api/admin/contacts/${item.id}`, form);
        toast.success('شماره به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/contacts', form);
        toast.success('شماره ساخته شد');
      }
      onSaved();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEdit ? `ویرایش «${item.label}»` : 'شماره تماس جدید'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cf-l">عنوان *</Label>
            <Input
              id="cf-l"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="h-9 text-[12.5px]"
              placeholder="مثلاً پشتیبانی"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-p">شماره تماس *</Label>
            <Input
              id="cf-p"
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="h-9 text-left font-mono text-[12px]"
              placeholder="021-91000000"
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-o">ترتیب نمایش</Label>
              <Input
                id="cf-o"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="h-9 text-[12px]"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-[12px] font-bold text-ink-700">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              فعال
            </label>
          </div>
        </div>
        <DialogFooter className="flex-row-reverse gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-5 text-[12.5px] font-black text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {isEdit ? 'ذخیره' : 'ایجاد'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-cream-200 px-4 text-[12px] font-bold text-ink-600 hover:bg-cream-100"
          >
            انصراف
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════ نمادهای اعتماد ═══════════════════

interface BadgeRow {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

function BadgesSection() {
  const { data, loading, error, reload } = useApi<{ badges: BadgeRow[] }>('/api/admin/badges');
  const [editing, setEditing] = useState<BadgeRow | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleActive = async (row: BadgeRow) => {
    try {
      await apiPatch(`/api/admin/badges/${row.id}`, { isActive: !row.isActive });
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  return (
    <div>
      <SectionBar onCreate={() => setCreating(true)} createLabel="نماد جدید" />
      {loading ? (
        <div className="shimmer h-40 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={ShieldCheck} title="دریافت نمادها ناموفق بود" hint={error ?? undefined} />
      ) : data.badges.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="نمادی ثبت نشده است" hint="مثلاً اینماد اعتماد الکترونیکی" />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.badges.map((row) => (
            <div key={row.id} className="rounded-3xl border border-cream-200 bg-white shadow-card">
              <div className="flex items-center gap-3 p-4">
                { }
                <img
                  src={row.imageUrl}
                  alt={`نماد ${row.title}`}
                  className="h-14 w-14 shrink-0 rounded-2xl border border-cream-200 object-contain p-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-black text-ink-900">{row.title}</p>
                    <Pill tone={row.isActive ? 'green' : 'ink'}>{row.isActive ? 'فعال' : 'غیرفعال'}</Pill>
                  </div>
                  {row.linkUrl && (
                    <p dir="ltr" className="mt-0.5 truncate text-left font-mono text-[10px] text-ink-400">
                      {row.linkUrl}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-cream-200 px-4 py-3">
                <label className="flex items-center gap-2 text-[11px] font-bold text-ink-600">
                  <Switch checked={row.isActive} onCheckedChange={() => void toggleActive(row)} />
                  نمایش در فروشگاه
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600 hover:bg-cream-200"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                    ویرایش
                  </button>
                  <DeleteButton
                    path={`/api/admin/badges/${row.id}`}
                    confirmText={`نماد «${row.title}» حذف شود؟`}
                    onDeleted={reload}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <BadgeDialog
          item={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function BadgeDialog({
  item,
  onClose,
  onSaved,
}: {
  item?: BadgeRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    title: item?.title ?? '',
    imageUrl: item?.imageUrl ?? '',
    linkUrl: item?.linkUrl ?? '',
    sortOrder: item?.sortOrder ?? 0,
    isActive: item?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const canSave = form.title.trim().length >= 2 && form.imageUrl.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, linkUrl: form.linkUrl.trim() || null };
      if (isEdit) {
        await apiPatch(`/api/admin/badges/${item.id}`, payload);
        toast.success('نماد به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/badges', payload);
        toast.success('نماد ساخته شد');
      }
      onSaved();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEdit ? `ویرایش «${item.title}»` : 'نماد اعتماد جدید'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bf2-t">عنوان *</Label>
            <Input
              id="bf2-t"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="h-9 text-[12.5px]"
              placeholder="مثلاً اینماد اعتماد الکترونیکی"
            />
          </div>
          <div className="space-y-1.5">
            <Label>تصویر نماد *</Label>
            <MediaUploadField
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
              ariaLabel="تصویر نماد اعتماد"
              kind="content"
              emptyHint="لوگوی نماد را آپلود کنید (PNG/JPG/WebP تا ۵ مگابایت)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf2-u">لینک (اختیاری)</Label>
            <Input
              id="bf2-u"
              dir="ltr"
              value={form.linkUrl}
              onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
              className="h-9 text-left font-mono text-[11px]"
              placeholder="https://trustseal.enamad.ir/…"
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bf2-o">ترتیب نمایش</Label>
              <Input
                id="bf2-o"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="h-9 text-[12px]"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-[12px] font-bold text-ink-700">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              فعال
            </label>
          </div>
        </div>
        <DialogFooter className="flex-row-reverse gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-5 text-[12.5px] font-black text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {isEdit ? 'ذخیره' : 'ایجاد'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-cream-200 px-4 text-[12px] font-bold text-ink-600 hover:bg-cream-100"
          >
            انصراف
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════ لینک‌های فوتر ═══════════════════

interface FooterLinkRow {
  id: string;
  title: string;
  url: string;
  sortOrder: number;
  isActive: boolean;
}

function FooterLinksSection() {
  const { data, loading, error, reload } = useApi<{ links: FooterLinkRow[] }>('/api/admin/footer-links');
  const [editing, setEditing] = useState<FooterLinkRow | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleActive = async (row: FooterLinkRow) => {
    try {
      await apiPatch(`/api/admin/footer-links/${row.id}`, { isActive: !row.isActive });
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  return (
    <div>
      <SectionBar onCreate={() => setCreating(true)} createLabel="لینک جدید" />
      {loading ? (
        <div className="shimmer h-40 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={LinkIcon} title="دریافت لینک‌ها ناموفق بود" hint={error ?? undefined} />
      ) : data.links.length === 0 ? (
        <EmptyState icon={LinkIcon} title="لینکی ثبت نشده است" hint="مثلاً «قوانین فروشگاه» یا «رهگیری سفارش»" />
      ) : (
        <div className="space-y-2.5">
          {data.links.map((row) => (
            <div key={row.id} className="rounded-2xl border border-cream-200 bg-white shadow-card">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[12.5px] font-black text-ink-900">{row.title}</p>
                    <Pill tone={row.isActive ? 'green' : 'ink'}>{row.isActive ? 'فعال' : 'غیرفعال'}</Pill>
                  </div>
                  <p dir="ltr" className="mt-0.5 truncate text-left font-mono text-[10px] text-ink-400">
                    {row.url}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch checked={row.isActive} onCheckedChange={() => void toggleActive(row)} />
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600 hover:bg-cream-200"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                    ویرایش
                  </button>
                  <DeleteButton
                    path={`/api/admin/footer-links/${row.id}`}
                    confirmText={`لینک «${row.title}» حذف شود؟`}
                    onDeleted={reload}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <FooterLinkDialog
          item={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function FooterLinkDialog({
  item,
  onClose,
  onSaved,
}: {
  item?: FooterLinkRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    title: item?.title ?? '',
    url: item?.url ?? '',
    sortOrder: item?.sortOrder ?? 0,
    isActive: item?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const canSave = form.title.trim().length >= 2 && form.url.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      if (isEdit) {
        await apiPatch(`/api/admin/footer-links/${item.id}`, form);
        toast.success('لینک به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/footer-links', form);
        toast.success('لینک ساخته شد');
      }
      onSaved();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEdit ? `ویرایش «${item.title}»` : 'لینک فوتر جدید'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="flf-t">عنوان *</Label>
            <Input
              id="flf-t"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="h-9 text-[12.5px]"
              placeholder="مثلاً قوانین و مقررات"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="flf-u">آدرس لینک *</Label>
            <Input
              id="flf-u"
              dir="ltr"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="h-9 text-left font-mono text-[11px]"
              placeholder="/faq یا https://…"
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="flf-o">ترتیب نمایش</Label>
              <Input
                id="flf-o"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="h-9 text-[12px]"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-[12px] font-bold text-ink-700">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              فعال
            </label>
          </div>
        </div>
        <DialogFooter className="flex-row-reverse gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-5 text-[12.5px] font-black text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {isEdit ? 'ذخیره' : 'ایجاد'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-cream-200 px-4 text-[12px] font-bold text-ink-600 hover:bg-cream-100"
          >
            انصراف
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════ مشترک ═══════════════════

/** نوار داخلی هر بخش — دکمه ایجاد در راست (RTL) */
function SectionBar({ onCreate, createLabel }: { onCreate: () => void; createLabel: string }) {
  return (
    <div className="mb-3 flex justify-end">
      <button
        type="button"
        onClick={onCreate}
        className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white hover:bg-brand-700"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {createLabel}
      </button>
    </div>
  );
}
