'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  Bold,
  ChevronDown,
  CircleHelp,
  Eye,
  FileCode,
  FileStack,
  FileText,
  Heading2,
  Image as ImageIcon,
  Italic,
  LayoutGrid,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  PenLine,
  Plus,
  Quote,
  RefreshCw,
  ScrollText,
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
import { blocksToPlain, parsePageBlocks } from '@/lib/page-blocks';
import { MarkdownContent } from '@/components/shared/MarkdownContent';
import { PageBlocks } from '@/components/shared/PageBlocks';
import {
  PageBlockEditor,
  newBlock,
  toEditableBlocks,
  toPayloadBlocks,
  toPreviewBlocks,
  type EditableBlock,
} from '@/components/admin/PageBlockEditor';
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
 * مدیریت صفحات اختصاصی (درخواست کاربر) — قوانین و شرایط، حریم خصوصی و ...
 * ایجاد/ویرایش/حذف صفحه با مارک‌داون پیشرفته (درشت، فهرست، جدول، لینک و ...)
 * با نوار ابزار، پیش‌نمایش زنده و میانبر — نمایش خودکار در فوتر
 * گاردها سمت سرور: دسترسی فقط مدیر؛ slug یکتا → 409
 */

/** راهنمای سریع مارک‌داون — زیر ادیتور */
const MD_GUIDE: { syntax: string; desc: string }[] = [
  { syntax: '**متن**', desc: 'درشت' },
  { syntax: '*متن*', desc: 'ایتالیک' },
  { syntax: '~~متن~~', desc: 'خط‌خورده' },
  { syntax: '`کد`', desc: 'کد درون‌خطی' },
  { syntax: '## تیتر', desc: 'تیتر بخش (کارت)' },
  { syntax: '### تیتر', desc: 'تیتر فرعی' },
  { syntax: '- مورد', desc: 'فهرست نقطه‌ای' },
  { syntax: '1. مورد', desc: 'فهرست شماره‌دار' },
  { syntax: '> متن', desc: 'نقل‌قول' },
  { syntax: '[متن](آدرس)', desc: 'لینک' },
  { syntax: '![توضیح](آدرس)', desc: 'تصویر' },
  { syntax: '| الف | ب |', desc: 'جدول (با خط ---)' },
  { syntax: '```', desc: 'بلوک کد' },
  { syntax: '---', desc: 'خط جداکننده' },
];

/** دکمهٔ نوار ابزار مارک‌داون — preventDefault تا انتخاب متن textarea از بین نرود */
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

interface AdminPageRow {
  id: string;
  slug: string;
  title: string;
  body: string;
  editorMode: string;
  blocks: string | null;
  isActive: boolean;
  showInFooter: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface PagesResp {
  pages: AdminPageRow[];
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
  body: '',
  editorMode: 'markdown' as 'markdown' | 'blocks',
  blocks: [] as EditableBlock[],
  isActive: true,
  showInFooter: true,
  sortOrder: 0,
};

export default function AdminPagesPage() {
  return (
    <AdminShell>
      <PagesContent />
    </AdminShell>
  );
}

function PagesContent() {
  const { data, loading, error, reload } = useApi<PagesResp>('/api/admin/pages');
  const [form, setForm] = useState<typeof EMPTY_FORM | null>(null); // null = بسته
  const [saving, setSaving] = useState(false);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const pages = data?.pages ?? [];

  const openCreate = () => {
    setBodyTouched(false);
    setTab('write');
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (p: AdminPageRow) => {
    setBodyTouched(true);
    setTab('write');
    setForm({
      id: p.id,
      slug: p.slug,
      title: p.title,
      body: p.body,
      editorMode: p.editorMode === 'blocks' ? 'blocks' : 'markdown',
      blocks: toEditableBlocks(p.blocks),
      isActive: p.isActive,
      showInFooter: p.showInFooter,
      sortOrder: p.sortOrder,
    });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const isBlocks = form.editorMode === 'blocks';
      const payload = {
        slug: form.slug.trim().toLowerCase(),
        title: form.title.trim(),
        body: isBlocks ? '' : form.body.trim(),
        editorMode: form.editorMode,
        blocks: isBlocks ? toPayloadBlocks(form.blocks) : null,
        isActive: form.isActive,
        showInFooter: form.showInFooter,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (form.id) {
        await apiPatch(`/api/admin/pages/${form.id}`, payload);
        toast.success('صفحه به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/pages', payload);
        toast.success('صفحه ایجاد شد — به‌طور خودکار در فوتر نمایش داده می‌شود');
      }
      setForm(null);
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setSaving(false);
    }
  };

  // slug پیشنهادی از عنوان — فقط در ایجاد و وقتی کاربر slug را دستی وارد نکرده
  useEffect(() => {
    if (!form || form.id || bodyTouched) return;
    const suggested = slugify(form.title);
    if (suggested && suggested !== form.slug) setForm({ ...form, slug: suggested });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.title]);

  // ————————————————— ابزارهای ادیتور مارک‌داون (درخواست کاربر) —————————————————

  /** متن انتخابی را بین دو علامت می‌پیچد (درشت/ایتالیک/کد/خط‌خورده) */
  const applyWrap = (before: string, after: string, placeholder: string) => {
    const ta = taRef.current;
    if (!ta || !form) return;
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? s;
    const inner = ta.value.slice(s, e) || placeholder;
    const next = ta.value.slice(0, s) + before + inner + after + ta.value.slice(e);
    setForm({ ...form, body: next });
    const start = s + before.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start, start + inner.length);
    });
  };

  /** پیشوند خطوط انتخاب‌شده را می‌گذارد/برمی‌دارد (تیتر، فهرست، نقل‌قول) */
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
    setForm({ ...form, body: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ls, ls + mapped.length);
    });
  };

  /** درج یک بلوک کامل (جدول/بلوک کد/خط جداکننده) در مکان نشانگر */
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
    setForm({ ...form, body: next });
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length + padBefore.length + text.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  /** درج لینک [متن](آدرس) — آدرس انتخاب می‌شود تا مستقیم جایگزین شود */
  const insertLink = () => {
    const ta = taRef.current;
    if (!ta || !form) return;
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? s;
    const text = ta.value.slice(s, e) || 'متن لینک';
    const next = ta.value.slice(0, s) + `[${text}](آدرس)` + ta.value.slice(e);
    setForm({ ...form, body: next });
    const urlStart = s + text.length + 3;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(urlStart, urlStart + 'آدرس'.length);
    });
  };

  /** درج تصویر ![توضیح](آدرس) — آدرس انتخاب می‌شود */
  const insertImage = () => {
    const ta = taRef.current;
    if (!ta || !form) return;
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? s;
    const alt = ta.value.slice(s, e) || 'توضیح تصویر';
    const url = 'آدرس-تصویر';
    const next = ta.value.slice(0, s) + `![${alt}](${url})` + ta.value.slice(e);
    setForm({ ...form, body: next });
    const urlStart = s + alt.length + 4;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(urlStart, urlStart + url.length);
    });
  };

  /** میانبرهای کیبورد: Ctrl+B درشت، Ctrl+I ایتالیک */
  const onBodyKeyDown = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
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
        title="صفحات فروشگاه"
        desc="ایجاد صفحات اختصاصی با مارک‌داون پیشرفته (درشت، فهرست، جدول، لینک و ...) — نمایش خودکار در فوتر"
      />

      <Toolbar>
        <button
          type="button"
          onClick={openCreate}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-[12px] font-black text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          صفحهٔ جدید
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
        <EmptyState icon={FileStack} title="دریافت صفحات ناموفق بود" hint={error ?? undefined} />
      ) : pages.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="هنوز صفحه‌ای ساخته نشده"
          hint="مثلاً «قوانین و شرایط» بسازید — به‌طور خودکار در فوتر و صفحهٔ ورود لینک می‌شود"
        />
      ) : (
        <>
          {/* موبایل — کارت‌ها */}
          <div className="space-y-2.5 md:hidden">
            {pages.map((p) => (
              <div key={p.id} className="rounded-2xl border border-cream-200 bg-white p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-black text-ink-900">
                      {p.title}
                      {p.editorMode === 'blocks' && (
                        <Pill tone="gold">صفحه‌ساز</Pill>
                      )}
                    </p>
                    <p dir="ltr" className="text-right text-[10.5px] font-mono text-brand-600">
                      /p/{p.slug}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Pill tone={p.isActive ? 'green' : 'ink'}>{p.isActive ? 'فعال' : 'غیرفعال'}</Pill>
                  </div>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-4 text-ink-400">
                  {(p.editorMode === 'blocks'
                    ? blocksToPlain(parsePageBlocks(p.blocks) ?? [])
                    : mdToPlain(p.body)
                  )
                    .trim()
                    .slice(0, 120)}…
                </p>
                <div className="mt-2.5 flex items-center justify-between border-t border-cream-100 pt-2.5">
                  <span className="flex items-center gap-2 text-[10px] text-ink-400">
                    {p.showInFooter && <Pill tone="brand">فوتر</Pill>}
                    <span>ویرایش {formatJalaliDate(p.updatedAt)}</span>
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
                      path={`/api/admin/pages/${p.id}`}
                      confirmText={`صفحهٔ «${p.title}» برای همیشه حذف می‌شود.`}
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
                  <th className="px-3 py-3 font-bold">شناسه</th>
                  <th className="px-3 py-3 font-bold">وضعیت</th>
                  <th className="px-3 py-3 font-bold">فوتر</th>
                  <th className="px-3 py-3 font-bold">آخرین ویرایش</th>
                  <th className="px-3 py-3 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id} className="border-b border-cream-100 last:border-0 hover:bg-cream-50/50">
                    <td className="px-4 py-3 text-[12.5px] font-black text-ink-900">
                      {p.title}
                      {p.editorMode === 'blocks' && (
                        <span className="mr-2 inline-flex align-middle">
                          <Pill tone="gold">صفحه‌ساز</Pill>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span dir="ltr" className="rounded-lg bg-cream-50 px-2 py-1 font-mono text-[10.5px] text-brand-600">
                        /p/{p.slug}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone={p.isActive ? 'green' : 'ink'}>{p.isActive ? 'فعال' : 'غیرفعال'}</Pill>
                    </td>
                    <td className="px-3 py-3">
                      {p.showInFooter ? <Pill tone="brand">نمایش</Pill> : <span className="text-[10.5px] text-ink-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-[10.5px] text-ink-400">{formatJalaliDate(p.updatedAt)}</td>
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
                          path={`/api/admin/pages/${p.id}`}
                          confirmText={`صفحهٔ «${p.title}» برای همیشه حذف می‌شود.`}
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
                {form.id ? 'ویرایش صفحه' : 'ایجاد صفحهٔ جدید'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <Label htmlFor="pg-title" className="text-[11px] text-ink-500">
                  عنوان صفحه *
                </Label>
                <Input
                  id="pg-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="قوانین و شرایط استفاده"
                  className="mt-1 h-10 text-[13px]"
                />
              </div>

              <div>
                <Label htmlFor="pg-slug" className="text-[11px] text-ink-500">
                  شناسهٔ صفحه (آدرس) * — فقط حروف انگلیسی کوچک، عدد و خط تیره
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <span dir="ltr" className="shrink-0 rounded-lg bg-cream-100 px-2 py-2 font-mono text-[11px] text-ink-400">
                    /p/
                  </span>
                  <Input
                    id="pg-slug"
                    dir="ltr"
                    value={form.slug}
                    onChange={(e) => {
                      setBodyTouched(true);
                      setForm({ ...form, slug: e.target.value.toLowerCase() });
                    }}
                    placeholder="terms"
                    className="h-10 flex-1 font-mono text-[13px]"
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {['terms', 'privacy', 'guide'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setBodyTouched(true);
                        setForm({ ...form, slug: s });
                      }}
                      disabled={!!form.id}
                      className={cn(
                        'rounded-full bg-cream-100 px-2.5 py-1 text-[10px] font-bold text-ink-500 transition-colors hover:bg-cream-200',
                        form.slug === s && 'bg-brand-100 text-brand-700'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* ——— محتوای صفحه: مارک‌داون یا صفحه‌ساز بلوکی (درخواست کاربر) ——— */}
              <div>
                {/* انتخاب حالت ویرایش */}
                <div className="flex items-center justify-between rounded-2xl border border-cream-200 bg-cream-50/70 p-1">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, editorMode: 'markdown' })}
                    className={cn(
                      'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl text-[11px] font-black transition-colors',
                      form.editorMode === 'markdown'
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-ink-400 hover:text-ink-600'
                    )}
                  >
                    <PenLine className="h-3.5 w-3.5" aria-hidden />
                    متن (مارک‌داون)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        editorMode: 'blocks',
                        blocks: form.blocks.length ? form.blocks : [newBlock('text')],
                      })
                    }
                    className={cn(
                      'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl text-[11px] font-black transition-colors',
                      form.editorMode === 'blocks'
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-ink-400 hover:text-ink-600'
                    )}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                    صفحه‌ساز (تمپلیت‌ها)
                  </button>
                </div>

                {/* ——— حالت مارک‌داون ——— */}
                {form.editorMode === 'markdown' && (
                  <>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Label htmlFor="pg-body" className="text-[11px] text-ink-500">
                        متن صفحه (مارک‌داون) *
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
                        {/* نوار ابزار مارک‌داون */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-0.5 rounded-2xl border border-cream-200 bg-cream-50/70 px-1.5 py-1.5">
                          <ToolBtn icon={Bold} label="درشت — Ctrl+B" onClick={() => applyWrap('**', '**', 'متن درشت')} />
                          <ToolBtn icon={Italic} label="ایتالیک — Ctrl+I" onClick={() => applyWrap('*', '*', 'متن ایتالیک')} />
                          <ToolBtn icon={Strikethrough} label="خط‌خورده" onClick={() => applyWrap('~~', '~~', 'متن حذف‌شده')} />
                          <ToolBtn icon={FileText} label="کد درون‌خطی" onClick={() => applyWrap('`', '`', 'کد')} />
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
                          id="pg-body"
                          value={form.body}
                          onChange={(e) => setForm({ ...form, body: e.target.value })}
                          onKeyDown={onBodyKeyDown}
                          placeholder={'## پذیرش قوانین\nبا استفاده از فروشگاه پارس، تمام **قوانین زیر** را می‌پذیرید.\n\n## ثبت سفارش\n- ثبت سفارش یعنی پذیرش کامل قوانین\n- پرداخت پیش از ارسال انجام می‌شود\n\n> پشتیبانی: [تماس با ما](/p/contact)'}
                          rows={12}
                          className="mt-1.5 w-full rounded-2xl border border-cream-200 bg-white px-3.5 py-3 text-[12.5px] leading-6 text-ink-700 shadow-card outline-none transition-colors placeholder:text-ink-300 focus:border-brand-400"
                        />
                      </>
                    ) : (
                      <div className="mt-1.5 min-h-[296px] rounded-2xl border border-cream-200 bg-white px-3.5 py-3 shadow-card">
                        {form.body.trim() ? (
                          <MarkdownContent source={form.body} variant="spa" />
                        ) : (
                          <p className="py-10 text-center text-[11px] text-ink-300">چیزی برای پیش‌نمایش نیست</p>
                        )}
                      </div>
                    )}

                    {/* راهنمای مارک‌داون */}
                    <details className="group mt-1.5 rounded-2xl border border-cream-200 bg-cream-50/60">
                      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3 py-2 text-[11px] font-bold text-ink-500 transition-colors hover:text-brand-700">
                        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                        راهنمای مارک‌داون
                        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-cream-100 px-3 py-2.5">
                        {MD_GUIDE.map((g) => (
                          <div key={g.syntax} className="flex items-center gap-2">
                            <code
                              dir="ltr"
                              className="shrink-0 rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] text-brand-700 shadow-sm"
                            >
                              {g.syntax}
                            </code>
                            <span className="text-[10px] text-ink-400">{g.desc}</span>
                          </div>
                        ))}
                      </div>
                    </details>

                    <p className="mt-1 text-left text-[9.5px] text-ink-300">
                      {toFaDigits(form.body.length)} کاراکتر — حداکثر ۵۰٬۰۰۰
                    </p>
                  </>
                )}

                {/* ——— حالت صفحه‌ساز بلوکی (درخواست کاربر) ——— */}
                {form.editorMode === 'blocks' && (
                  <>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Label className="text-[11px] text-ink-500">
                        بلوک‌های صفحه (تمپلیت‌های آماده) *
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
                          ساخت
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
                      <div className="mt-1.5">
                        <PageBlockEditor
                          blocks={form.blocks}
                          onChange={(blocks) => setForm({ ...form, blocks })}
                        />
                      </div>
                    ) : (
                      <div className="mt-1.5 min-h-[296px] rounded-2xl border border-cream-200 bg-cream-50/60 px-3.5 py-3 shadow-card">
                        {form.blocks.length ? (
                          <PageBlocks blocks={toPreviewBlocks(form.blocks)} />
                        ) : (
                          <p className="py-10 text-center text-[11px] text-ink-300">چیزی برای پیش‌نمایش نیست</p>
                        )}
                      </div>
                    )}

                    <p className="mt-1.5 text-[10px] leading-4 text-ink-400">
                      با تمپلیت‌های آمادهٔ «نوشته، کارت‌ها، آیکون‌ها، اسلایدر و گالری» صفحه بسازید —
                      تصاویر مستقیم از گالری آپلود می‌شوند و خروجی کاملاً واکنش‌گرا است.
                    </p>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex items-center justify-between rounded-2xl border border-cream-200 bg-cream-50/60 px-3 py-2.5">
                  <span className="text-[11.5px] font-bold text-ink-600">فعال</span>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                    aria-label="فعال بودن صفحه"
                  />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-cream-200 bg-cream-50/60 px-3 py-2.5">
                  <span className="text-[11.5px] font-bold text-ink-600">نمایش در فوتر</span>
                  <Switch
                    checked={form.showInFooter}
                    onCheckedChange={(v) => setForm({ ...form, showInFooter: v })}
                    aria-label="نمایش در فوتر"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="pg-order" className="text-[11px] text-ink-500">
                  ترتیب نمایش (عدد کوچک‌تر = بالاتر)
                </Label>
                <Input
                  id="pg-order"
                  type="number"
                  min={0}
                  max={999}
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                  className="mt-1 h-10 text-[13px]"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={
                  saving ||
                  form.title.trim().length < 2 ||
                  form.slug.trim().length < 2 ||
                  (form.editorMode === 'markdown' ? form.body.trim().length < 10 : form.blocks.length < 1)
                }
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-600 text-[12.5px] font-black text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                ذخیرهٔ صفحه
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
