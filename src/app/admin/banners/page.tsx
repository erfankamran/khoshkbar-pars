'use client';

import { useState } from 'react';
import { Image as ImageIcon, Pencil, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { MediaUploadField } from '@/components/admin/MediaUploadField';
import { DeleteButton, EmptyState, PageHeader, Pill, mutationError } from '@/components/admin/kit';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * مدیریت بنرهای صفحه اصلی (فاز ۱۴) — ایجاد/ویرایش/حذف + مقصد ناوبری
 */

interface AdminBanner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkView: string | null;
  linkParams: string | null;
  sortOrder: number;
  isActive: boolean;
}

const LINK_VIEWS = [
  { value: 'none', label: 'بدون لینک' },
  { value: 'category', label: 'دسته‌بندی' },
  { value: 'product', label: 'محصول' },
  { value: 'search', label: 'جستجو' },
  { value: 'favorites', label: 'علاقه‌مندی‌ها' },
  { value: 'orders', label: 'سفارش‌ها' },
];

function parseParams(raw: string | null): { slug?: string; q?: string } {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { slug?: string; q?: string };
  } catch {
    return {};
  }
}

export default function AdminBannersPage() {
  return (
    <AdminShell>
      <BannersContent />
    </AdminShell>
  );
}

function BannersContent() {
  const { data, loading, error, reload } = useApi<{ banners: AdminBanner[] }>('/api/admin/banners');
  const [editing, setEditing] = useState<AdminBanner | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleActive = async (b: AdminBanner) => {
    try {
      await apiPatch(`/api/admin/banners/${b.id}`, { isActive: !b.isActive });
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="بنرها"
        desc="بنرهای تبلیغاتی اسلایدر صفحه اصلی"
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            بنر جدید
          </button>
        }
      />

      {loading ? (
        <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={ImageIcon} title="دریافت بنرها ناموفق بود" hint={error ?? undefined} />
      ) : data.banners.length === 0 ? (
        <EmptyState icon={ImageIcon} title="بنری ثبت نشده است" hint="اولین بنر صفحه اصلی را بسازید" />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.banners.map((b) => (
            <div key={b.id} className="overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-card">
              <div className="flex items-center gap-4 p-4">
                { }
                <img
                  src={b.imageUrl}
                  alt={`بنر ${b.title}`}
                  className="h-20 w-32 shrink-0 rounded-2xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-black text-ink-900">{b.title}</p>
                    <Pill tone={b.isActive ? 'green' : 'ink'}>{b.isActive ? 'فعال' : 'غیرفعال'}</Pill>
                  </div>
                  {b.subtitle && <p className="mt-0.5 truncate text-[11px] text-ink-500">{b.subtitle}</p>}
                  <p className="mt-1 text-[10.5px] text-ink-400">
                    مقصد: {LINK_VIEWS.find((v) => v.value === b.linkView)?.label ?? '—'}
                    {parseParams(b.linkParams).slug ? ` (${parseParams(b.linkParams).slug})` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-cream-200 px-4 py-3">
                <label className="flex items-center gap-2 text-[11px] font-bold text-ink-600">
                  <Switch checked={b.isActive} onCheckedChange={() => void toggleActive(b)} />
                  نمایش در فروشگاه
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(b)}
                    className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600 hover:bg-cream-200"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                    ویرایش
                  </button>
                  <DeleteButton
                    path={`/api/admin/banners/${b.id}`}
                    confirmText={`بنر «${b.title}» حذف شود؟`}
                    onDeleted={reload}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <BannerFormDialog
          banner={editing ?? undefined}
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

function BannerFormDialog({
  banner,
  onClose,
  onSaved,
}: {
  banner?: AdminBanner;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!banner;
  const params = parseParams(banner?.linkParams ?? null);
  const [form, setForm] = useState({
    title: banner?.title ?? '',
    subtitle: banner?.subtitle ?? '',
    imageUrl: banner?.imageUrl ?? '',
    linkView: banner?.linkView ?? 'none',
    paramSlug: params.slug ?? params.q ?? '',
    sortOrder: banner?.sortOrder ?? 0,
    isActive: banner?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const canSave = form.title.trim().length >= 2 && form.imageUrl.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const linkParams =
        form.linkView === 'category' || form.linkView === 'product'
          ? { slug: form.paramSlug }
          : form.linkView === 'search'
            ? { q: form.paramSlug }
            : undefined;
      const payload = {
        title: form.title,
        subtitle: form.subtitle || null,
        imageUrl: form.imageUrl,
        linkView: form.linkView === 'none' ? null : form.linkView,
        linkParams,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      if (isEdit) {
        await apiPatch(`/api/admin/banners/${banner.id}`, payload);
        toast.success('بنر به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/banners', payload);
        toast.success('بنر ساخته شد');
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
            {isEdit ? `ویرایش «${banner.title}»` : 'بنر جدید'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bf-title">عنوان *</Label>
            <Input
              id="bf-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="h-9 text-[12.5px]"
              placeholder="مثلاً جشنواره پسته"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-sub">زیرعنوان</Label>
            <Input
              id="bf-sub"
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              className="h-9 text-[12.5px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-img">تصویر بنر *</Label>
            {/* آپلود با کشیدن/کلیک — ذخیره در storage/media/banners/ */}
            <MediaUploadField
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
              ariaLabel="تصویر بنر"
              kind="banners"
              aspect="wide"
              emptyHint="تصویر عریض بنر — PNG/JPG/WebP تا ۵ مگابایت"
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label>مقصد کلیک</Label>
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
                <Label htmlFor="bf-param">
                  {form.linkView === 'search' ? 'عبارت جستجو' : 'اسلاگ مقصد'}
                </Label>
                <Input
                  id="bf-param"
                  dir="ltr"
                  value={form.paramSlug}
                  onChange={(e) => setForm({ ...form, paramSlug: e.target.value.toLowerCase() })}
                  className="h-9 text-left font-mono text-[11px]"
                  placeholder="pistachio"
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bf-order">ترتیب</Label>
              <Input
                id="bf-order"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="h-9 text-[12px]"
                min={0}
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
