'use client';

import { useState } from 'react';
import { Clapperboard, Pencil, Plus, RefreshCw } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * مدیریت استوری‌ها (فاز ۱۴) — آیتم‌های استوری گروه‌بندی‌شده + انقضا
 */

interface AdminStory {
  id: string;
  groupKey: string;
  groupTitle: string;
  thumbUrl: string;
  mediaType: string;
  mediaUrl: string;
  caption: string | null;
  linkView: string | null;
  linkParams: string | null;
  expiresAt: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

interface StoriesResp {
  groups: Array<{ groupKey: string; groupTitle: string; items: AdminStory[] }>;
  total: number;
}

export default function AdminStoriesPage() {
  return (
    <AdminShell>
      <StoriesContent />
    </AdminShell>
  );
}

function StoriesContent() {
  const { data, loading, error, reload } = useApi<StoriesResp>('/api/admin/stories');
  const [editing, setEditing] = useState<AdminStory | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleActive = async (s: AdminStory) => {
    try {
      await apiPatch(`/api/admin/stories/${s.id}`, { isActive: !s.isActive });
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="استوری‌ها"
        desc="دایره‌های استوری صفحه اصلی — هر گروه چند آیتم دارد"
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            آیتم استوری
          </button>
        }
      />

      {loading ? (
        <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={Clapperboard} title="دریافت استوری‌ها ناموفق بود" hint={error ?? undefined} />
      ) : data.groups.length === 0 ? (
        <EmptyState icon={Clapperboard} title="استوری‌ای ثبت نشده است" hint="اولین آیتم استوری را بسازید" />
      ) : (
        <div className="space-y-4">
          {data.groups.map((g) => (
            <section key={g.groupKey} className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-black text-ink-900">{g.groupTitle}</p>
                  <p dir="ltr" className="text-right font-mono text-[10px] text-ink-400">
                    group: {g.groupKey}
                  </p>
                </div>
                <Pill tone="brand">{toFaDigits(g.items.length)} آیتم</Pill>
              </div>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {g.items.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-cream-200 p-2.5">
                    { }
                    <img
                      src={s.thumbUrl}
                      alt={`استوری ${s.groupTitle}`}
                      className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Pill tone="ink">{s.mediaType === 'video' ? 'ویدیو' : 'تصویر'}</Pill>
                        <Pill tone={s.isActive ? 'green' : 'ink'}>{s.isActive ? 'فعال' : 'غیرفعال'}</Pill>
                        {s.expiresAt && new Date(s.expiresAt) < new Date() && (
                          <Pill tone="red">منقضی</Pill>
                        )}
                      </div>
                      {s.caption && <p className="mt-1 truncate text-[11px] text-ink-500">{s.caption}</p>}
                      <div className="mt-1.5 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void toggleActive(s)}
                          className="h-6 rounded-lg bg-cream-100 px-2 text-[10px] font-bold text-ink-600 hover:bg-cream-200"
                        >
                          {s.isActive ? 'خاموش کن' : 'روشن کن'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(s)}
                          className="h-6 rounded-lg bg-cream-100 px-2 text-[10px] font-bold text-ink-600 hover:bg-cream-200"
                        >
                          ویرایش
                        </button>
                        <DeleteButton
                          path={`/api/admin/stories/${s.id}`}
                          confirmText="این آیتم استوری حذف شود؟"
                          onDeleted={reload}
                          label="حذف"
                          className="h-6 px-2 text-[10px]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <StoryFormDialog
          story={editing ?? undefined}
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

function StoryFormDialog({
  story,
  onClose,
  onSaved,
}: {
  story?: AdminStory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!story;
  const [form, setForm] = useState({
    groupKey: story?.groupKey ?? '',
    groupTitle: story?.groupTitle ?? '',
    thumbUrl: story?.thumbUrl ?? '',
    mediaType: story?.mediaType ?? 'image',
    mediaUrl: story?.mediaUrl ?? '',
    caption: story?.caption ?? '',
    expiresAt: story?.expiresAt ? story.expiresAt.slice(0, 10) : '',
    sortOrder: story?.sortOrder ?? 0,
    isActive: story?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const canSave =
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.groupKey) &&
    form.groupTitle.trim().length >= 2 &&
    form.thumbUrl.trim().length > 0 &&
    form.mediaUrl.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        groupKey: form.groupKey,
        groupTitle: form.groupTitle,
        thumbUrl: form.thumbUrl,
        mediaType: form.mediaType as 'image' | 'video',
        mediaUrl: form.mediaUrl,
        caption: form.caption || null,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59+03:30`).toISOString() : null,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      if (isEdit) {
        await apiPatch(`/api/admin/stories/${story.id}`, payload);
        toast.success('استوری به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/stories', payload);
        toast.success('آیتم استوری ساخته شد');
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
            {isEdit ? 'ویرایش آیتم استوری' : 'آیتم استوری جدید'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sf-group">کلید گروه *</Label>
              <Input
                id="sf-group"
                dir="ltr"
                value={form.groupKey}
                onChange={(e) => setForm({ ...form, groupKey: e.target.value.toLowerCase() })}
                className="h-9 text-left font-mono text-[12px]"
                placeholder="nowruz-1405"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sf-title">عنوان گروه *</Label>
              <Input
                id="sf-title"
                value={form.groupTitle}
                onChange={(e) => setForm({ ...form, groupTitle: e.target.value })}
                className="h-9 text-[12.5px]"
                placeholder="جشنواره نوروزی"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sf-thumb">تصویر دایره *</Label>
              {/* آپلود — ذخیره در storage/media/stories/ */}
              <MediaUploadField
                value={form.thumbUrl}
                onChange={(url) => setForm({ ...form, thumbUrl: url })}
                ariaLabel="تصویر دایره استوری"
                kind="stories"
                aspect="square"
                emptyHint="تصویر مربع کوچک — PNG/JPG/WebP"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sf-media">آدرس رسانه (تصویر یا ویدیو) *</Label>
              {/* رسانه ممکن است ویدیو باشد — آپلود تصویر فقط برای نوع image */}
              {form.mediaType === 'image' ? (
                <MediaUploadField
                  value={form.mediaUrl}
                  onChange={(url) => setForm({ ...form, mediaUrl: url })}
                  ariaLabel="رسانه استوری"
                  kind="stories"
                  aspect="wide"
                  emptyHint="تصویر عریض استوری — PNG/JPG/WebP"
                />
              ) : (
                <Input
                  id="sf-media"
                  dir="ltr"
                  value={form.mediaUrl}
                  onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
                  className="h-9 text-left font-mono text-[11px]"
                />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label>نوع رسانه</Label>
              <Select value={form.mediaType} onValueChange={(v) => setForm({ ...form, mediaType: v })}>
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">تصویر</SelectItem>
                  <SelectItem value="video">ویدیو</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sf-exp">تاریخ انقضا (اختیاری)</Label>
              <Input
                id="sf-exp"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="h-9 text-[12px]"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-caption">کپشن</Label>
            <Input
              id="sf-caption"
              value={form.caption}
              onChange={(e) => setForm({ ...form, caption: e.target.value })}
              className="h-9 text-[12.5px]"
              placeholder="متن روی استوری"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] font-bold text-ink-700">
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            فعال
          </label>
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
