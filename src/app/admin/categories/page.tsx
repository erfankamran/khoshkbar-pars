'use client';

import { useState } from 'react';
import { FolderTree, Pencil, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { MediaUploadField } from '@/components/admin/MediaUploadField';
import { DeleteButton, EmptyState, PageHeader, Pill, mutationError } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { apiPatch, apiPost } from '@/lib/api-client';
import { toFaDigits } from '@/lib/fa';
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

/**
 * مدیریت دسته‌بندی‌ها (فاز ۱۴) — ایجاد/ویرایش/حذف با شمارش محصولات
 */

interface AdminCategory {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number };
}

export default function AdminCategoriesPage() {
  return (
    <AdminShell>
      <CategoriesContent />
    </AdminShell>
  );
}

function CategoriesContent() {
  const { data, loading, error, reload } = useApi<{ categories: AdminCategory[]; total: number }>(
    '/api/admin/categories'
  );
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleActive = async (c: AdminCategory) => {
    try {
      await apiPatch(`/api/admin/categories/${c.id}`, { isActive: !c.isActive });
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="دسته‌بندی‌ها"
        desc="ساختار طبقه‌بندی محصولات فروشگاه"
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            دسته جدید
          </button>
        }
      />

      {loading ? (
        <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={FolderTree} title="دریافت دسته‌ها ناموفق بود" hint={error ?? undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.categories.map((c) => (
            <div key={c.id} className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  {c.imageUrl ? (
                     
                    <img
                      src={c.imageUrl}
                      alt={`دسته ${c.title}`}
                      className="h-12 w-12 rounded-2xl object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-100 text-ink-400">
                      <FolderTree className="h-5 w-5" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-black text-ink-900">{c.title}</p>
                    <p dir="ltr" className="text-right font-mono text-[10px] text-ink-400">
                      /{c.slug}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Pill tone={c.isActive ? 'green' : 'ink'}>{c.isActive ? 'فعال' : 'غیرفعال'}</Pill>
                  <Pill tone="brand">{toFaDigits(c._count.products)} محصول</Pill>
                </div>
              </div>
              {c.description && (
                <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-ink-500">{c.description}</p>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-dashed border-cream-200 pt-3">
                <label className="flex items-center gap-2 text-[11px] font-bold text-ink-600">
                  <Switch checked={c.isActive} onCheckedChange={() => void toggleActive(c)} />
                  فعال
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600 hover:bg-cream-200"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                    ویرایش
                  </button>
                  <DeleteButton
                    path={`/api/admin/categories/${c.id}`}
                    confirmText={`دسته «${c.title}» حذف شود؟ اگر محصول داشته باشد حذف رد می‌شود.`}
                    onDeleted={reload}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <CategoryFormDialog
          category={editing ?? undefined}
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

function CategoryFormDialog({
  category,
  onClose,
  onSaved,
}: {
  category?: AdminCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!category;
  const [form, setForm] = useState({
    slug: category?.slug ?? '',
    title: category?.title ?? '',
    description: category?.description ?? '',
    imageUrl: category?.imageUrl ?? '',
    icon: category?.icon ?? '',
    sortOrder: category?.sortOrder ?? 0,
    isActive: category?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const canSave = form.title.trim().length >= 2 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        slug: form.slug,
        title: form.title,
        description: form.description || null,
        imageUrl: form.imageUrl || null,
        icon: form.icon || null,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      if (isEdit) {
        await apiPatch(`/api/admin/categories/${category.id}`, payload);
        toast.success('دسته‌بندی به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/categories', payload);
        toast.success('دسته‌بندی ساخته شد');
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
            {isEdit ? `ویرایش «${category.title}»` : 'دسته‌بندی جدید'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-title">عنوان *</Label>
              <Input
                id="cf-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-9 text-[12.5px]"
                placeholder="مثلاً پسته"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-slug">اسلاگ *</Label>
              <Input
                id="cf-slug"
                dir="ltr"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                className="h-9 text-left font-mono text-[12px]"
                placeholder="pistachio"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-img">تصویر دسته‌بندی</Label>
            {/* آپلود با کشیدن/کلیک — ذخیره در storage/media/categories/ */}
            <MediaUploadField
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
              ariaLabel="تصویر دسته‌بندی"
              kind="categories"
              aspect="square"
              emptyHint="تصویر مربع دسته — PNG/JPG/WebP تا ۵ مگابایت"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-desc">توضیح</Label>
            <Textarea
              id="cf-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="min-h-16 text-[12px]"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-order">ترتیب نمایش</Label>
              <Input
                id="cf-order"
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
