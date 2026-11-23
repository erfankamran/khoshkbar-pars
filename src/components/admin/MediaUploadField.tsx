'use client';

import { useCallback, useRef, useState } from 'react';
import {
  CheckCircle2,
  ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiUpload } from '@/lib/api-client';
import { mutationError } from '@/components/admin/kit';
import { cn } from '@/lib/utils';

/**
 * فیلد آپلود تصویر — نسخه ۲ (درخواست کاربر: زیباتر و کاربردی‌تر)
 *
 * - Drag & Drop + کلیک برای انتخاب — با بازخورد بصری حالت کشیدن
 * - پیش‌نمایش بزرگ با نسبت مشخص (مربع برای دسته/محصول، عریض برای بنر)
 * - حین آپلود: لایه تار + اسپینر؛ پس از موفقیت: نشان تأیید کوتاه
 * - پوشه‌بندی دسته‌محور روی دیسک: storage/media/<kind>/<سال>/<ماه>/
 * - والد مقدار url را نگه می‌دارد و با «ذخیرهٔ تغییرات» همیشگی می‌شود
 * - حذف: فقط مقدار پاک می‌شود (فایل روی دیسک immutable است و ممکن است
 *   در جای دیگر مرجع باشد)
 */

interface UploadResp {
  media: { filePath: string; url: string; mime: string; bytes: number };
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const MAX_MB = 5;

export type UploadAspect = 'square' | 'wide' | 'avatar';

const ASPECT_CLASS: Record<UploadAspect, string> = {
  square: 'aspect-square w-full',
  wide: 'aspect-[2.4/1] w-full',
  avatar: 'aspect-square w-24',
};

export function MediaUploadField({
  value,
  onChange,
  ariaLabel,
  emptyHint,
  /** پوشهٔ ذخیره روی دیسک — پیش‌فرض general */
  kind = 'general',
  /** نسبت پیش‌نمایش — پیش‌فرض مربع */
  aspect = 'square',
  /** ارتفاع پیش‌نمایش عریض را محدود می‌کند (اختیاری) */
  compact = false,
}: {
  value: string;
  onChange: (url: string) => void;
  ariaLabel: string;
  emptyHint?: string;
  kind?: 'general' | 'products' | 'banners' | 'categories' | 'stories' | 'brand' | 'content';
  aspect?: UploadAspect;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const dragDepth = useRef(0);

  const openPicker = () => inputRef.current?.click();

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!ACCEPT.split(',').includes(file.type)) {
        toast.error('فرمت پذیرفته‌شده: PNG، JPG، WebP یا GIF');
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`حجم فایل بیش از ${MAX_MB} مگابایت است`);
        return;
      }
      setUploading(true);
      setJustDone(false);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('kind', kind);
        const data = await apiUpload<UploadResp>('/api/admin/media', form);
        onChange(data.media.url);
        setJustDone(true);
        toast.success(
          `تصویر در پوشه «${kind}» ذخیره شد — با «ذخیرهٔ تغییرات» همیشگی می‌شود`
        );
        setTimeout(() => setJustDone(false), 2200);
      } catch (e) {
        toast.error(mutationError(e));
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [kind, onChange]
  );

  // ——— Drag & Drop ———
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // لازم برای فعال‌ماندن رویداد drop
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    void onFile(e.dataTransfer.files?.[0]);
  };

  const showPreview = Boolean(value);

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
        aria-label={`انتخاب فایل ${ariaLabel}`}
      />

      {/* ——— ناحیه پیش‌نمایش / رهاکردن ——— */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && openPicker()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        aria-label={`${ariaLabel} — کلیک یا کشیدن فایل برای آپلود`}
        className={cn(
          'group relative w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition-all',
          ASPECT_CLASS[aspect],
          compact && aspect === 'wide' && 'max-h-36',
          dragOver
            ? 'border-brand-500 bg-brand-50/70 ring-4 ring-brand-100'
            : showPreview
              ? 'border-cream-200 bg-white hover:border-brand-300'
              : 'border-cream-300 bg-cream-50/60 hover:border-brand-300 hover:bg-brand-50/40',
          uploading && 'pointer-events-none opacity-80'
        )}
      >
        {showPreview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={ariaLabel}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* لایه آپلود — تاری روی تصویر */}
            {uploading && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden />
                <span className="text-[11px] font-black text-ink-700">
                  در حال آپلود…
                </span>
              </span>
            )}
            {/* نشان تأیید پس از آپلود */}
            {justDone && !uploading && (
              <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white shadow-card">
                <CheckCircle2 className="h-4.5 w-4.5" aria-hidden />
              </span>
            )}
            {/* بازتاب Hover — راهنمای تعویض */}
            {!uploading && !justDone && (
              <span className="absolute inset-0 flex items-center justify-center bg-ink-950/0 text-[11px] font-black text-white opacity-0 transition-all group-hover:bg-ink-950/35 group-hover:opacity-100">
                <RefreshCw className="ml-1.5 h-4 w-4" aria-hidden />
                کلیک برای تعویض تصویر
              </span>
            )}
          </>
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
            {uploading ? (
              <>
                <Loader2 className="h-7 w-7 animate-spin text-brand-500" aria-hidden />
                <span className="text-[11px] font-black text-ink-700">
                  در حال آپلود…
                </span>
              </>
            ) : (
              <>
                <span
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-2xl transition-colors',
                    dragOver
                      ? 'bg-brand-500 text-white'
                      : 'bg-white text-brand-500 shadow-card'
                  )}
                >
                  <UploadCloud className="h-5.5 w-5.5" aria-hidden />
                </span>
                <span className="text-[11.5px] font-black text-ink-700">
                  {dragOver ? 'فایل را رها کنید' : 'کلیک یا کشیدن تصویر'}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-ink-400">
                  <ImageIcon className="h-3 w-3" aria-hidden />
                  {emptyHint || `PNG / JPG / WebP — تا ${MAX_MB} مگابایت`}
                </span>
              </>
            )}
          </span>
        )}
      </div>

      {/* ——— ردیف عملیات ——— */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={openPicker}
          disabled={uploading}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 text-[11px] font-black text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : showPreview ? (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <UploadCloud className="h-3.5 w-3.5" aria-hidden />
          )}
          {showPreview ? 'تعویض تصویر' : 'انتخاب تصویر'}
        </button>
        {showPreview && (
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={uploading}
            aria-label={`حذف ${ariaLabel}`}
            className="flex h-8 items-center gap-1.5 rounded-xl bg-red-50 px-3 text-[11px] font-black text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            حذف
          </button>
        )}
      </div>

      {/* مسیر فعلی (برای شفافیت مدیر) */}
      {showPreview && (
        <p className="mt-1.5 truncate text-[9.5px] leading-4 text-ink-300" dir="ltr">
          {value}
        </p>
      )}
    </div>
  );
}
