'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  Bold,
  ChevronDown,
  CircleHelp,
  Eye,
  FileCode,
  FileText,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Newspaper,
  PenLine,
  Plus,
  Quote,
  RefreshCw,
  Strikethrough,
  Table,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { DeleteButton, EmptyState, PageHeader, Pill, Toolbar, mutationError } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { apiPatch, apiPost } from '@/lib/api-client';
import { formatJalaliDate } from '@/lib/jalali';
import { toFaDigits } from '@/lib/fa';
import { mdToPlain } from '@/lib/markdown';
import { MarkdownContent } from '@/components/shared/MarkdownContent';
import { MediaUploadField } from '@/components/admin/MediaUploadField';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * مدیریت وبلاگ (درخواست کاربر) — جایگزین علاقه‌مندی در منوی موبایل + ورودی سئو
 *
 * - نوشته‌ها با مارک‌داون امن نوشته می‌شوند (همان ادیتور صفحات)
 * - تصویر شاخص + خلاصه + برچسب‌ها + فیلدهای سئو (عنوان و توضیحات متا)
 * - فقط نوشته‌های منتشرشده در /blog و sitemap و RSS می‌آیند
 * - تاریخ انتشار در اولین انتشار ثبت می‌شود و بعد از آن جابه‌جا نمی‌شود
 */

/** راهنمای سریع مارک‌داون — زیر ادیتور */
const MD_GUIDE: { syntax: string; desc: string }[] = [
  { syntax: '**متن**', desc: 'درشت' },
  { syntax: '*متن*', desc: 'ایتالیک' },
  { syntax: '## تیتر', desc: 'تیتر بخش' },
  { syntax: '- مورد', desc: 'فهرست نقطه‌ای' },
  { syntax: '[متن](آدرس)', desc: 'لینک' },
  { syntax: '![توضیح](آدرس)', desc: 'تصویر' },
  { syntax: '> متن', desc: 'نقل‌قول' },
  { syntax: '---', desc: 'خط جداکننده' },
];

function ToolBtn({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-white hover:text-brand-700 hover:shadow-sm"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

function ToolSep() {
  return <span className="mx-1 h-4 w-px shrink-0 bg-cream-200" aria-hidden />;
}

interface AdminPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  tags: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PostsResp {
  posts: AdminPostRow[];
}

/** ساخت slug از عنوان — فقط حروف انگلیسی کوچک/عدد/خط تیره */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const EMPTY_FORM = {
  id: '',
  slug: '',
  title: '',
  excerpt: '',
  content: '',
  coverUrl: '',
  metaTitle: '',
  metaDescription: '',
  tags: '',
  isPublished: false,
};

export default function AdminBlogPage() {
  return (
    <AdminShell>
      <BlogContent />
    </AdminShell>
  );
}

function BlogContent() {
  const { data, loading, error, reload } = useApi<PostsResp>('/api/admin/posts');
  const [form, setForm] = useState<typeof EMPTY_FORM | null>(null); // null = بسته
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const posts = data?.posts ?? [];

  const openCreate = () => {
    setSlugTouched(false);
    setTab('write');
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (p: AdminPostRow) => {
    setSlugTouched(true);
    setTab('write');
    setForm({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt ?? '',
      content: p.content,
      coverUrl: p.coverUrl ?? '',
      metaTitle: p.metaTitle ?? '',
      metaDescription: p.metaDescription ?? '',
      tags: p.tags ?? '',
      isPublished: p.isPublished,
    });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        slug: form.slug.trim().toLowerCase(),
        title: form.title.trim(),
        excerpt: form.excerpt.trim() || null,
        content: form.content.trim(),
        coverUrl: form.coverUrl.trim() || null,
        metaTitle: form.metaTitle.trim() || null,
        metaDescription: form.metaDescription.trim() || null,
        tags: form.tags.trim() || null,
        isPublished: form.isPublished,
      };
      if (form.id) {
        await apiPatch(`/api/admin/posts/${form.id}`, payload);
        toast.success(form.isPublished ? 'نوشته به‌روزرسانی و منتشر شد' : 'نوشته به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/posts', payload);
        toast.success(
          form.isPublished
            ? 'نوشته منتشر شد — در /blog و نقشه سایت دیده می‌شود'
            : 'پیش‌نویس ذخیره شد — برای انتشار، کلید «منتشرشده» را روشن کنید'
        );
      }
      setForm(null);
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setSaving(false);
    }
  };

  // slug پیشنهادی از عنوان — فقط در ایجاد و وقتی کاربر دستی وارد نکرده
  useEffect(() => {
    if (!form || form.id || slugTouched) return;
    const suggested = slugify(form.title);
    if (suggested && suggested !== form.slug) setForm({ ...form, slug: suggested });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.title]);

  // ——— ابزارهای ادیتور مارک‌داون ———
  const applyWrap = (before: string, after: string, placeholder: string) => {
    const ta = taRef.current;
    if (!ta || !form) return;
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? s;
    const inner = ta.value.slice(s, e) || placeholder;
    const next = ta.value.slice(0, s) + before + inner + after + ta.value.slice(e);
    setForm({ ...form, content: next });
    const start = s + before.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start, start + inner.length);
    });
  };
  const prefixLines = (prefix: string, numbered = false) => {
    const ta = taRef.current;
    if (!ta || !form) return;
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? s;
    const value = ta.value;
    const ls = value.lastIndexOf('\n', s - 1) + 1;
    const leRaw = value.indexOf('\n', e);
    const le = leRaw === -1 ? value.length : leRaw;
    const lines = value.slice(ls, le).split('\n');
    const esc = prefix.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const all = lines.every((l) => l.trimStart().startsWith(prefix.trim()));
    let k = 1;
    const mapped = lines
      .map((l) => (all ? l.replace(new RegExp(`^\\s*${esc}`), '') : numbered ? `${k++}. ${l}` : prefix + l))
      .join('\n');
    const next = value.slice(0, ls) + mapped + value.slice(le);
    setForm({ ...form, content: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ls, ls + mapped.length);
    });
  };
  const insertBlock = (text: string) => {
    const ta = taRef.current;
    if (!ta || !form) return;
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? s;
    const before = ta.value.slice(0, s);
    const after = ta.value.slice(e);
    const padBefore = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const padAfter = after.startsWith('\n') ? '' : '\n\n';
    const next = before + padBefore + text + padAfter + after;
    setForm({ ...form, content: next });
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length + padBefore.length + text.length;
      ta.setSelectionRange(pos, pos);
    });
  };
  const insertLink = () => {
    const ta = taRef.current;
    if (!ta || !form) return;
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? s;
    const text = ta.value.slice(s, e) || 'متن لینک';
    const next = ta.value.slice(0, s) + `[${text}](آدرس)` + ta.value.slice(e);
    setForm({ ...form, content: next });
    const urlStart = s + text.length + 3;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(urlStart, urlStart + 'آدرس'.length);
    });
  };
  const insertImage = () => {
    const ta = taRef.current;
    if (!ta || !form) return;
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? s;
    const alt = ta.value.slice(s, e) || 'توضیح تصویر';
    const url = 'آدرس-تصویر';
    const next = ta.value.slice(0, s) + `![${alt}](${url})` + ta.value.slice(e);
    setForm({ ...form, content: next });
    const urlStart = s + alt.length + 4;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(urlStart, urlStart + url.length);
    });
  };
  const onContentKeyDown = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const key = ev.key.toLowerCase();
    if (key === 'b') {
      ev.preventDefault();
      applyWrap('**', '**', 'متن درشت');
    } else if (key === 'i') {
      ev.preventDefault();
      applyWrap('*', '*', 'متن ایتالیک');
    }
  };

  return (
    <div>
      <PageHeader
        title="وبلاگ فروشگاه"
        desc="نوشته‌های منتشرشده در /blog، نقشه سایت و فید RSS می‌آیند — جایگزین علاقه‌مندی در منوی موبایل"
      />

      <Toolbar>
        <button
          type="button"
          onClick={openCreate}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-[12px] font-black text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          نوشتهٔ جدید
        </button>
        <button
          type="button"
          onClick={reload}
          className="mr-auto flex h-9 w-9 items-center justify-center rounded-lg bg-cream-100 text-ink-500 hover:bg-cream-200"
          aria-label="بازخوانی"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>
      </Toolbar>

      {loading ? (
        <div className="shimmer h-72 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={Newspaper} title="دریافت نوشته‌ها ناموفق بود" hint={error ?? undefined} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="هنوز نوشته‌ای منتشر نشده"
          hint="مثلاً «خواص آجیل برای سلامتی» بنویسید — وبلاگ مسیر اصلی ورود از گوگل است"
        />
      ) : (
        <>
          {/* موبایل — کارت‌ها */}
          <div className="space-y-2.5 md:hidden">
            {posts.map((p) => (
              <div key={p.id} className="rounded-2xl border border-cream-200 bg-white p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-black text-ink-900">{p.title}</p>
                    <p dir="ltr" className="text-right text-[10.5px] font-mono text-brand-600">
                      /blog/{p.slug}
                    </p>
                  </div>
                  <Pill tone={p.isPublished ? 'green' : 'ink'}>
                    {p.isPublished ? 'منتشرشده' : 'پیش‌نویس'}
                  </Pill>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-4 text-ink-400">
                  {(p.excerpt ?? mdToPlain(p.content)).trim().slice(0, 120)}…
                </p>
                <div className="mt-2.5 flex items-center justify-between border-t border-cream-100 pt-2.5">
                  <span className="flex items-center gap-2 text-[10px] text-ink-400">
                    <span>{toFaDigits(p.viewCount)} بازدید</span>
                    {p.publishedAt && <span>{formatJalaliDate(p.publishedAt)}</span>}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-3 text-[11px] font-black text-ink-600 hover:bg-cream-200"
                    >
                      <FileText className="h-3.5 w-3.5" aria-hidden />
                      ویرایش
                    </button>
                    <DeleteButton
                      path={`/api/admin/posts/${p.id}`}
                      confirmText={`نوشتهٔ «${p.title}» برای همیشه حذف می‌شود.`}
                      onDeleted={reload}
                      label=""
                      icon={Trash2}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* دسکتاپ — جدول */}
          <div className="hidden overflow-hidden rounded-3xl border border-cream-200 bg-white md:block">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50/70 text-[10.5px] text-ink-400">
                  <th className="px-4 py-3 font-bold">عنوان</th>
                  <th className="px-3 py-3 font-bold">آدرس</th>
                  <th className="px-3 py-3 font-bold">وضعیت</th>
                  <th className="px-3 py-3 font-bold">بازدید</th>
                  <th className="px-3 py-3 font-bold">انتشار</th>
                  <th className="px-3 py-3 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-b border-cream-100 last:border-0 hover:bg-cream-50/50">
                    <td className="px-4 py-3 text-[12.5px] font-black text-ink-900">{p.title}</td>
                    <td className="px-3 py-3">
                      <span dir="ltr" className="rounded-lg bg-cream-50 px-2 py-1 font-mono text-[10.5px] text-brand-600">
                        /blog/{p.slug}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone={p.isPublished ? 'green' : 'ink'}>
                        {p.isPublished ? 'منتشرشده' : 'پیش‌نویس'}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-ink-500">{toFaDigits(p.viewCount)}</td>
                    <td className="px-3 py-3 text-[10.5px] text-ink-400">
                      {p.publishedAt ? formatJalaliDate(p.publishedAt) : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-3 text-[11px] font-black text-ink-600 hover:bg-cream-200"
                        >
                          <FileText className="h-3.5 w-3.5" aria-hidden />
                          ویرایش
                        </button>
                        <DeleteButton
                          path={`/api/admin/posts/${p.id}`}
                          confirmText={`نوشتهٔ «${p.title}» برای همیشه حذف می‌شود.`}
                          onDeleted={reload}
                          label=""
                          icon={Trash2}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ——— دیالوگ ایجاد/ویرایش ——— */}
      {form && (
        <Dialog open onOpenChange={(o) => !o && setForm(null)}>
          <DialogContent dir="rtl" className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-right">
                {form.id ? 'ویرایش نوشته' : 'نوشتهٔ جدید وبلاگ'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <Label htmlFor="bp-title" className="text-[11px] text-ink-500">
                  عنوان نوشته *
                </Label>
                <Input
                  id="bp-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="خواص شگفت‌انگیز آجیل برای سلامتی"
                  className="mt-1 h-10 text-[13px]"
                />
              </div>

              <div>
                <Label htmlFor="bp-slug" className="text-[11px] text-ink-500">
                  اسلاگ (آدرس) * — فقط حروف انگلیسی کوچک، عدد و خط تیره
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <span dir="ltr" className="shrink-0 rounded-lg bg-cream-100 px-2 py-2 font-mono text-[11px] text-ink-400">
                    /blog/
                  </span>
                  <Input
                    id="bp-slug"
                    dir="ltr"
                    value={form.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setForm({ ...form, slug: e.target.value.toLowerCase() });
                    }}
                    placeholder="nuts-health-benefits"
                    className="h-10 flex-1 font-mono text-[13px]"
                  />
                </div>
              </div>

              {/* ——— تصویر شاخص ——— */}
              <div>
                <Label className="text-[11px] text-ink-500">تصویر شاخص</Label>
                <div className="mt-1">
                  <MediaUploadField
                    value={form.coverUrl}
                    onChange={(url) => setForm({ ...form, coverUrl: url })}
                    kind="content"
                    aspect="wide"
                    compact
                    ariaLabel="تصویر شاخص نوشته"
                  />
                </div>
              </div>

              {/* ——— خلاصه ——— */}
              <div>
                <Label htmlFor="bp-excerpt" className="text-[11px] text-ink-500">
                  خلاصهٔ کوتاه — نمایش در لیست وبلاگ و fallback سئو
                </Label>
                <textarea
                  id="bp-excerpt"
                  value={form.excerpt}
                  onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                  placeholder="دو سه خط خلاصهٔ جذاب از نوشته…"
                  rows={2}
                  className="mt-1 w-full rounded-2xl border border-cream-200 bg-white px-3.5 py-2.5 text-[12.5px] leading-6 text-ink-700 outline-none transition-colors placeholder:text-ink-300 focus:border-brand-400"
                />
                <p className="mt-0.5 text-left text-[9.5px] text-ink-300">
                  {toFaDigits(form.excerpt.length)} نویسه — پیشنهاد: حداکثر ۱۶۰
                </p>
              </div>

              {/* ——— متن نوشته — ادیتور مارک‌داون ——— */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="bp-content" className="text-[11px] text-ink-500">
                    متن نوشته (مارک‌داون) *
                  </Label>
                  <div className="flex items-center gap-0.5 rounded-xl border border-cream-200 bg-cream-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setTab('write')}
                      className={cn(
                        'flex h-7 items-center gap-1 rounded-lg px-2.5 text-[10.5px] font-black transition-colors',
                        tab === 'write' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-400 hover:text-ink-600'
                      )}
                    >
                      <PenLine className="h-3 w-3" aria-hidden />
                      نوشتن
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('preview')}
                      className={cn(
                        'flex h-7 items-center gap-1 rounded-lg px-2.5 text-[10.5px] font-black transition-colors',
                        tab === 'preview' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-400 hover:text-ink-600'
                      )}
                    >
                      <Eye className="h-3 w-3" aria-hidden />
                      پیش‌نمایش
                    </button>
                  </div>
                </div>

                {tab === 'write' ? (
                  <>
                    <div className="mt-1.5 flex flex-wrap items-center gap-0.5 rounded-2xl border border-cream-200 bg-cream-50/70 px-1.5 py-1.5">
                      <ToolBtn icon={Bold} label="درشت — Ctrl+B" onClick={() => applyWrap('**', '**', 'متن درشت')} />
                      <ToolBtn icon={Italic} label="ایتالیک — Ctrl+I" onClick={() => applyWrap('*', '*', 'متن ایتالیک')} />
                      <ToolBtn icon={Strikethrough} label="خط‌خورده" onClick={() => applyWrap('~~', '~~', 'متن حذف‌شده')} />
                      <ToolSep />
                      <ToolBtn icon={Heading2} label="تیتر بخش" onClick={() => prefixLines('## ')} />
                      <ToolBtn icon={List} label="فهرست نقطه‌ای" onClick={() => prefixLines('- ')} />
                      <ToolBtn icon={ListOrdered} label="فهرست شماره‌دار" onClick={() => prefixLines('1. ', true)} />
                      <ToolBtn icon={Quote} label="نقل‌قول" onClick={() => prefixLines('> ')} />
                      <ToolSep />
                      <ToolBtn icon={Link2} label="لینک" onClick={insertLink} />
                      <ToolBtn icon={ImageIcon} label="تصویر" onClick={insertImage} />
                      <ToolBtn
                        icon={Table}
                        label="جدول"
                        onClick={() => insertBlock('| ستون اول | ستون دوم |\n| --- | --- |\n| مقدار اول | مقدار دوم |')}
                      />
                      <ToolBtn icon={FileCode} label="بلوک کد" onClick={() => insertBlock('```\nکد اینجا\n```')} />
                      <ToolBtn icon={Minus} label="خط جداکننده" onClick={() => insertBlock('---')} />
                    </div>
                    <textarea
                      ref={taRef}
                      id="bp-content"
                      value={form.content}
                      onChange={(e) => setForm({ ...form, content: e.target.value })}
                      onKeyDown={onContentKeyDown}
                      placeholder={'## مزایای آجیل\nآجیل سرشار از **پروتئین و چربی سالم** است.\n\n- انرژی‌بخش\n- سرشار از فیبر\n\n> روزانه یک مشت آجیل — سلامتی گارانتی'}
                      rows={11}
                      className="mt-1.5 w-full rounded-2xl border border-cream-200 bg-white px-3.5 py-3 text-[12.5px] leading-6 text-ink-700 shadow-card outline-none transition-colors placeholder:text-ink-300 focus:border-brand-400"
                    />
                  </>
                ) : (
                  <div className="mt-1.5 min-h-[280px] rounded-2xl border border-cream-200 bg-white px-3.5 py-3 shadow-card">
                    {form.content.trim() ? (
                      <MarkdownContent source={form.content} variant="spa" />
                    ) : (
                      <p className="py-10 text-center text-[11px] text-ink-300">چیزی برای پیش‌نمایش نیست</p>
                    )}
                  </div>
                )}

                <p className="mt-1 text-left text-[9.5px] text-ink-300">
                  {toFaDigits(form.content.length)} کاراکتر — حداکثر ۵۰٬۰۰۰
                </p>
              </div>

              {/* ——— برچسب‌ها ——— */}
              <div>
                <Label htmlFor="bp-tags" className="text-[11px] text-ink-500">
                  برچسب‌ها — با ویرگول جدا کنید (حداکثر ۶ مورد)
                </Label>
                <Input
                  id="bp-tags"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="آجیل, سلامتی, تغذیه"
                  className="mt-1 h-10 text-[13px]"
                />
              </div>

              {/* ——— سئو ——— */}
              <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-3">
                <p className="flex items-center gap-1.5 text-[11.5px] font-black text-brand-700">
                  <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                  فیلدهای سئو — خالی بماند تا از عنوان و خلاصه ساخته شود
                </p>
                <div className="mt-2.5 space-y-2.5">
                  <div>
                    <Label htmlFor="bp-meta-title" className="text-[10.5px] text-ink-500">
                      عنوان متا (پیشنهاد: تا ۶۰ نویسه)
                    </Label>
                    <Input
                      id="bp-meta-title"
                      value={form.metaTitle}
                      onChange={(e) => setForm({ ...form, metaTitle: e.target.value })}
                      className="mt-0.5 h-9 text-[12px]"
                    />
                    <p className={cn('mt-0.5 text-left text-[9.5px]', form.metaTitle.length > 60 ? 'text-red-500' : 'text-ink-300')}>
                      {toFaDigits(form.metaTitle.length)} نویسه
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="bp-meta-desc" className="text-[10.5px] text-ink-500">
                      توضیحات متا (پیشنهاد: تا ۱۶۰ نویسه)
                    </Label>
                    <textarea
                      id="bp-meta-desc"
                      value={form.metaDescription}
                      onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
                      rows={2}
                      className="w-full rounded-xl border border-cream-200 bg-white px-3 py-2 text-[12px] leading-5 outline-none transition-colors focus:border-brand-400"
                    />
                    <p className={cn('mt-0.5 text-left text-[9.5px]', form.metaDescription.length > 160 ? 'text-red-500' : 'text-ink-300')}>
                      {toFaDigits(form.metaDescription.length)} نویسه
                    </p>
                  </div>
                </div>
              </div>

              {/* ——— انتشار ——— */}
              <div className="flex items-center justify-between rounded-2xl border border-cream-200 bg-cream-50/60 px-3 py-2.5">
                <div>
                  <span className="text-[11.5px] font-bold text-ink-600">منتشرشده</span>
                  <p className="text-[9.5px] text-ink-300">روشنايی = نمایش در /blog و نقشهٔ سایت</p>
                </div>
                <Switch
                  checked={form.isPublished}
                  onCheckedChange={(v) => setForm({ ...form, isPublished: v })}
                  aria-label="انتشار نوشته"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || form.title.trim().length < 3 || form.content.trim().length < 10 || form.slug.trim().length < 2}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-600 text-[12.5px] font-black text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {form.isPublished ? 'انتشار نوشته' : 'ذخیرهٔ پیش‌نویس'}
              </button>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="h-10 rounded-2xl bg-cream-100 px-4 text-[12.5px] font-black text-ink-500 transition-colors hover:bg-cream-200"
              >
                انصراف
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
