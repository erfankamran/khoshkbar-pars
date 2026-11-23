'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  GalleryHorizontal,
  Images,
  LayoutGrid,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { MediaUploadField } from '@/components/admin/MediaUploadField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toFaDigits } from '@/lib/fa';
import { BLOCK_ICONS } from '@/lib/page-blocks';

/**
 * ادیتور بلوک‌های صفحه‌ساز (درخواست کاربر) — تمپلیت‌های آمادهٔ کامپوننتی
 *
 * پنج تمپلیت: نوشته / کارت‌ها / آیکون‌ها / اسلایدر / گالری
 * - هر بلوک یک کارت مستقل با دکمه‌های جابه‌جایی/حذف است
 * - تصاویر با MediaUploadField مستقیم از گالری آپلود می‌شوند (پوشهٔ content)
 * - خروجی onChange آرایهٔ JSON امن است — اعتبارسنجی نهایی سمت سرور با zod
 */

export type BlockType = 'text' | 'cards' | 'icons' | 'slider' | 'gallery';

/** ردیف آیتم مشترک — هر تمپلیت فیلدهای خودش را استفاده می‌کند */
export interface EditableItem {
  title: string;
  description: string;
  imageUrl: string;
  href: string;
  badge: string;
  icon: string;
  alt: string;
}

export interface EditableBlock {
  id: string;
  type: BlockType;
  markdown: string;
  columns: number;
  autoplay: boolean;
  items: EditableItem[];
}

const EMPTY_ITEM: EditableItem = {
  title: '',
  description: '',
  imageUrl: '',
  href: '',
  badge: '',
  icon: 'Sparkles',
  alt: '',
};

let localId = 0;
function nextId(): string {
  localId += 1;
  return `blk-${Date.now()}-${localId}`;
}

/** تمپلیت جدید با یک آیتم پیش‌فرض */
export function newBlock(type: BlockType): EditableBlock {
  const base: EditableBlock = {
    id: nextId(),
    type,
    markdown: '',
    columns: type === 'icons' ? 4 : 3,
    autoplay: true,
    items: [],
  };
  if (type === 'text') return base;
  if (type === 'cards') return { ...base, items: [{ ...EMPTY_ITEM, title: '', badge: '' }] };
  if (type === 'icons') return { ...base, columns: 4, items: [{ ...EMPTY_ITEM }] };
  if (type === 'slider') return { ...base, autoplay: true, items: [{ ...EMPTY_ITEM }] };
  return { ...base, items: [{ ...EMPTY_ITEM }] }; // gallery
}

export const BLOCK_TEMPLATES: Array<{ type: BlockType; label: string; icon: LucideIcon; hint: string }> = [
  { type: 'text', label: 'نوشته', icon: FileText, hint: 'متن مارک‌داون' },
  { type: 'cards', label: 'کارت‌ها', icon: LayoutGrid, hint: 'گرید کارت با تصویر' },
  { type: 'icons', label: 'آیکون‌ها', icon: Sparkles, hint: 'ردیف ویژگی‌ها' },
  { type: 'slider', label: 'اسلایدر', icon: Images, hint: 'اسلاید تصویری' },
  { type: 'gallery', label: 'گالری', icon: GalleryHorizontal, hint: 'شبکهٔ تصاویر' },
];

const TYPE_LABELS: Record<BlockType, string> = {
  text: 'نوشته',
  cards: 'کارت‌ها',
  icons: 'آیکون‌ها',
  slider: 'اسلایدر',
  gallery: 'گالری',
};

// ————— تبدیل فرم ← payload امن سرور —————
function cleanItem(it: EditableItem) {
  return {
    title: it.title.trim(),
    description: it.description.trim() || null,
    imageUrl: it.imageUrl.trim() || null,
    href: it.href.trim() || null,
    badge: it.badge.trim() || null,
    icon: it.icon,
    alt: it.alt.trim() || null,
  };
}

/** ساخت JSON بلوک‌ها برای ارسال به سرور (اعتبارسنجی نهایی با zod سرور) */
export function toPayloadBlocks(blocks: EditableBlock[]): unknown[] {
  return blocks.map((b) => {
    switch (b.type) {
      case 'text':
        return { type: 'text', markdown: b.markdown.trim() };
      case 'cards':
        return {
          type: 'cards',
          columns: b.columns,
          items: b.items.map((it) => ({
            title: it.title,
            description: it.description.trim() || null,
            imageUrl: it.imageUrl.trim() || null,
            href: it.href.trim() || null,
            badge: it.badge.trim() || null,
          })),
        };
      case 'icons':
        return {
          type: 'icons',
          columns: b.columns,
          items: b.items.map((it) => ({
            icon: it.icon,
            title: it.title,
            description: it.description.trim() || null,
          })),
        };
      case 'slider':
        return {
          type: 'slider',
          autoplay: b.autoplay,
          slides: b.items.map((it) => ({
            imageUrl: it.imageUrl.trim(),
            title: it.title.trim() || null,
            subtitle: it.description.trim() || null,
            href: it.href.trim() || null,
          })),
        };
      case 'gallery':
        return {
          type: 'gallery',
          columns: b.columns,
          images: b.items.map((it) => ({ url: it.imageUrl.trim(), alt: it.alt.trim() || null })),
        };
    }
  });
}

/** تبدیل فرم به بلوک‌های تایپ‌دار برای پیش‌نمایش زندهٔ PageBlocks */
export function toPreviewBlocks(blocks: EditableBlock[]): import('@/lib/page-blocks').PageBlock[] {
  return toPayloadBlocks(blocks) as import('@/lib/page-blocks').PageBlock[];
}

/** تبدیل JSON ذخیره‌شدهٔ سرور به فرم ادیتور — خرابی → آرایهٔ خالی */
export function toEditableBlocks(json: string | null | undefined): EditableBlock[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const type = (
        ['text', 'cards', 'icons', 'slider', 'gallery'].includes(String(r.type))
          ? String(r.type)
          : 'text'
      ) as BlockType;
      const items = Array.isArray(r.items) ? r.items : Array.isArray(r.slides) ? r.slides : Array.isArray(r.images) ? r.images : [];
      const base = newBlock(type);
      return {
        ...base,
        markdown: typeof r.markdown === 'string' ? r.markdown : '',
        columns:
          typeof r.columns === 'number' && r.columns >= 2 && r.columns <= 4
            ? r.columns
            : base.columns,
        autoplay: typeof r.autoplay === 'boolean' ? r.autoplay : true,
        items:
          items.length > 0
            ? items.map((rawItem) => {
                const it = (rawItem ?? {}) as Record<string, unknown>;
                return {
                  title: typeof it.title === 'string' ? it.title : '',
                  description:
                    typeof it.description === 'string'
                      ? it.description
                      : typeof it.subtitle === 'string'
                        ? it.subtitle
                        : '',
                  imageUrl:
                    typeof it.imageUrl === 'string'
                      ? it.imageUrl
                      : typeof it.url === 'string'
                        ? it.url
                        : '',
                  href: typeof it.href === 'string' ? it.href : '',
                  badge: typeof it.badge === 'string' ? it.badge : '',
                  icon: typeof it.icon === 'string' ? it.icon : 'Sparkles',
                  alt: typeof it.alt === 'string' ? it.alt : '',
                };
              })
            : base.items,
      };
    });
  } catch {
    return [];
  }
}

/** ستون‌ها — دکمه‌های ۲/۳/۴ */
function ColumnsPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="تعداد ستون‌ها">
      <span className="text-[10px] text-ink-400">ستون‌ها:</span>
      {[2, 3, 4].map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-black transition-colors',
            value === c ? 'bg-brand-600 text-white' : 'bg-cream-100 text-ink-500 hover:bg-cream-200'
          )}
        >
          {toFaDigits(c)}
        </button>
      ))}
    </div>
  );
}

/** فیلد متن کوچک با برچسب */
function Field({
  label,
  value,
  onChange,
  placeholder,
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <div>
      <Label className="text-[10px] text-ink-400">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={dir}
        className="mt-0.5 h-9 text-[12px]"
      />
    </div>
  );
}

export function PageBlockEditor({
  blocks,
  onChange,
}: {
  blocks: EditableBlock[];
  onChange: (blocks: EditableBlock[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(blocks[0]?.id ?? null);
  const [adding, setAdding] = useState(false);

  const update = (id: string, patch: Partial<EditableBlock>) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const updateItem = (id: string, idx: number, patch: Partial<EditableItem>) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    update(id, { items: b.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  };
  const move = (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  const remove = (id: string) => {
    if (blocks.length <= 1) {
      toast.error('حداقل یک بلوک لازم است — برای حذف همه، حالت مارک‌داون را انتخاب کنید');
      return;
    }
    onChange(blocks.filter((b) => b.id !== id));
  };
  const addItem = (id: string) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    if (b.items.length >= (b.type === 'cards' ? 12 : b.type === 'gallery' ? 24 : 8)) {
      toast.error('سقف تعداد آیتم‌های این تمپلیت پر است');
      return;
    }
    update(id, { items: [...b.items, { ...EMPTY_ITEM }] });
  };
  const removeItem = (id: string, idx: number) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    if (b.items.length <= 1) {
      toast.error('حداقل یک آیتم لازم است');
      return;
    }
    update(id, { items: b.items.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      {/* ——— منوی تمپلیت‌های آماده ——— */}
      <div className="rounded-2xl border border-cream-200 bg-cream-50/70 p-2.5">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-ink-600">
          <Plus className="h-3.5 w-3.5 text-brand-600" aria-hidden />
          افزودن تمپلیت آماده
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {BLOCK_TEMPLATES.map((t) => (
            <button
              key={t.type}
              type="button"
              title={t.hint}
              onClick={() => {
                const nb = newBlock(t.type);
                onChange([...blocks, nb]);
                setOpenId(nb.id);
                setAdding(false);
              }}
              className="flex flex-col items-center gap-1 rounded-xl border border-cream-200 bg-white px-1 py-2.5 text-center transition-all hover:border-brand-400 hover:shadow-card"
            >
              <t.icon className="h-4.5 w-4.5 text-brand-600" aria-hidden />
              <span className="text-[10px] font-black text-ink-700">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ——— کارت هر بلوک ——— */}
      {blocks.map((b, i) => {
        const open = openId === b.id;
        const itemNoun = b.type === 'slider' ? 'اسلاید' : b.type === 'gallery' ? 'تصویر' : 'آیتم';
        return (
          <div key={b.id} className="overflow-hidden rounded-2xl border border-cream-200 bg-white">
            <div className="flex items-center gap-2 border-b border-cream-100 bg-cream-50/60 px-3 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-[10px] font-black text-brand-700">
                {toFaDigits(i + 1)}
              </span>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : b.id)}
                className="flex-1 text-right text-[12px] font-black text-ink-800"
              >
                {TYPE_LABELS[b.type]}
                <span className="mr-1.5 text-[10px] font-bold text-ink-300">
                  ({toFaDigits(b.items.length)} {itemNoun})
                </span>
              </button>
              <button
                type="button"
                onClick={() => move(b.id, -1)}
                disabled={i === 0}
                aria-label="انتقال به بالا"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-white hover:text-ink-700 disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(b.id, 1)}
                disabled={i === blocks.length - 1}
                aria-label="انتقال به پایین"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-white hover:text-ink-700 disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => remove(b.id)}
                aria-label="حذف بلوک"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {open && (
              <div className="space-y-3 p-3">
                {/* ——— نوشته ——— */}
                {b.type === 'text' && (
                  <textarea
                    value={b.markdown}
                    onChange={(e) => update(b.id, { markdown: e.target.value })}
                    placeholder={'## تیتر بخش\nمتن بلوک با **مارک‌داون** — فهرست، جدول و لینک هم پشتیبانی می‌شود'}
                    rows={6}
                    className="w-full rounded-xl border border-cream-200 bg-white px-3 py-2.5 text-[12px] leading-6 text-ink-700 outline-none transition-colors placeholder:text-ink-300 focus:border-brand-400"
                  />
                )}

                {/* ——— کارت‌ها ——— */}
                {b.type === 'cards' && (
                  <>
                    <div className="flex items-center justify-between">
                      <ColumnsPicker value={b.columns} onChange={(v) => update(b.id, { columns: v })} />
                    </div>
                    {b.items.map((it, idx) => (
                      <div key={idx} className="space-y-2 rounded-xl border border-cream-200 bg-cream-50/50 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-black text-ink-500">کارت {toFaDigits(idx + 1)}</span>
                          <button
                            type="button"
                            onClick={() => removeItem(b.id, idx)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`حذف کارت ${idx + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                        <MediaUploadField
                          value={it.imageUrl}
                          onChange={(url) => updateItem(b.id, idx, { imageUrl: url })}
                          kind="content"
                          aspect="wide"
                          compact
                          ariaLabel={`تصویر کارت ${idx + 1}`}
                        />
                        <Field label="عنوان *" value={it.title} onChange={(v) => updateItem(b.id, idx, { title: v })} placeholder="مثلاً پستهٔ اکبری" />
                        <Field label="توضیح" value={it.description} onChange={(v) => updateItem(b.id, idx, { description: v })} placeholder="توضیح کوتاه کارت" />
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="لینک (اختیاری)" value={it.href} onChange={(v) => updateItem(b.id, idx, { href: v })} placeholder="/p/products" dir="ltr" />
                          <Field label="نشان (اختیاری)" value={it.badge} onChange={(v) => updateItem(b.id, idx, { badge: v })} placeholder="پیشنهاد شف" />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addItem(b.id)}
                      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-cream-100 text-[11px] font-black text-ink-600 hover:bg-cream-200"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      کارت جدید
                    </button>
                  </>
                )}

                {/* ——— آیکون‌ها ——— */}
                {b.type === 'icons' && (
                  <>
                    <div className="flex items-center justify-between">
                      <ColumnsPicker value={b.columns} onChange={(v) => update(b.id, { columns: v })} />
                    </div>
                    {b.items.map((it, idx) => (
                      <div key={idx} className="space-y-2 rounded-xl border border-cream-200 bg-cream-50/50 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-black text-ink-500">آیکون {toFaDigits(idx + 1)}</span>
                          <button
                            type="button"
                            onClick={() => removeItem(b.id, idx)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`حذف آیکون ${idx + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-ink-400">آیکون</Label>
                            <select
                              value={it.icon}
                              onChange={(e) => updateItem(b.id, idx, { icon: e.target.value })}
                              className="mt-0.5 h-9 w-full rounded-xl border border-cream-200 bg-white px-2 text-[12px] text-ink-700 outline-none focus:border-brand-400"
                              aria-label="انتخاب آیکون"
                            >
                              {BLOCK_ICONS.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Field label="عنوان *" value={it.title} onChange={(v) => updateItem(b.id, idx, { title: v })} placeholder="ارسال سریع" />
                        </div>
                        <Field label="توضیح" value={it.description} onChange={(v) => updateItem(b.id, idx, { description: v })} placeholder="توضیح کوتاه زیر آیکون" />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addItem(b.id)}
                      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-cream-100 text-[11px] font-black text-ink-600 hover:bg-cream-200"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      آیکون جدید
                    </button>
                  </>
                )}

                {/* ——— اسلایدر ——— */}
                {b.type === 'slider' && (
                  <>
                    <div className="flex items-center justify-between rounded-xl border border-cream-200 bg-cream-50/50 px-3 py-2">
                      <span className="text-[11px] font-bold text-ink-600">پخش خودکار اسلایدها</span>
                      <Switch
                        checked={b.autoplay}
                        onCheckedChange={(v) => update(b.id, { autoplay: v })}
                        aria-label="پخش خودکار"
                      />
                    </div>
                    {b.items.map((it, idx) => (
                      <div key={idx} className="space-y-2 rounded-xl border border-cream-200 bg-cream-50/50 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-black text-ink-500">اسلاید {toFaDigits(idx + 1)}</span>
                          <button
                            type="button"
                            onClick={() => removeItem(b.id, idx)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`حذف اسلاید ${idx + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                        <MediaUploadField
                          value={it.imageUrl}
                          onChange={(url) => updateItem(b.id, idx, { imageUrl: url })}
                          kind="content"
                          aspect="wide"
                          compact
                          ariaLabel={`تصویر اسلاید ${idx + 1}`}
                          emptyHint="تصویر عریض اسلاید — تا ۵ مگابایت"
                        />
                        <Field label="عنوان" value={it.title} onChange={(v) => updateItem(b.id, idx, { title: v })} placeholder="عنوان روی اسلاید" />
                        <Field label="زیرعنوان" value={it.description} onChange={(v) => updateItem(b.id, idx, { description: v })} placeholder="زیرعنوان اسلاید" />
                        <Field label="لینک (اختیاری)" value={it.href} onChange={(v) => updateItem(b.id, idx, { href: v })} placeholder="/c/pistachio" dir="ltr" />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addItem(b.id)}
                      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-cream-100 text-[11px] font-black text-ink-600 hover:bg-cream-200"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      اسلاید جدید
                    </button>
                  </>
                )}

                {/* ——— گالری ——— */}
                {b.type === 'gallery' && (
                  <>
                    <div className="flex items-center justify-between">
                      <ColumnsPicker value={b.columns} onChange={(v) => update(b.id, { columns: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {b.items.map((it, idx) => (
                        <div key={idx} className="relative rounded-xl border border-cream-200 bg-cream-50/50 p-2">
                          <button
                            type="button"
                            onClick={() => removeItem(b.id, idx)}
                            className="absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-lg bg-white/90 text-red-400 shadow-card hover:text-red-600"
                            aria-label={`حذف تصویر ${idx + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <MediaUploadField
                            value={it.imageUrl}
                            onChange={(url) => updateItem(b.id, idx, { imageUrl: url })}
                            kind="content"
                            aspect="square"
                            compact
                            ariaLabel={`تصویر ${idx + 1} گالری`}
                          />
                          <Input
                            value={it.alt}
                            onChange={(e) => updateItem(b.id, idx, { alt: e.target.value })}
                            placeholder="متن جایگزین (سئو)"
                            className="mt-1.5 h-8 text-[11px]"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addItem(b.id)}
                      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-cream-100 text-[11px] font-black text-ink-600 hover:bg-cream-200"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      تصویر جدید
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {blocks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-cream-300 bg-white/60 px-4 py-8 text-center">
          <Loader2 className="mx-auto hidden h-5 w-5" aria-hidden />
          <p className="text-[12px] font-black text-ink-500">هنوز بلوکی اضافه نشده</p>
          <p className="mt-1 text-[10.5px] text-ink-400">از منوی بالا یکی از تمپلیت‌های آماده را انتخاب کنید</p>
        </div>
      )}
    </div>
  );
}
