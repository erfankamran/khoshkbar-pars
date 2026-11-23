'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { readStoredSessionToken } from '@/lib/api-client';

/**
 * انتخابگر تصویر پنل مدیریت (فاز ۱۱.۵) — مشترک بنر و استوری
 *
 * - آپلود واقعی با POST /api/admin/upload (ماجیک‌نمبر + سقف ۲MB سمت سرور)
 * - چک حجم/پسوند در کلاینت فقط برای بازخورد فوری — ملاک، سمت سرور است
 * - خروجی: مسیر نسبی /uploads/… که مستقیماً در فیلد فرم والد می‌نشیند
 * - حذف تصویر: دکمهٔ X روی پیش‌نمایش → فیلد خالی می‌شود (تصویر سرور دست‌نخورده)
 */

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

interface Props {
  url: string;
  onChange: (url: string) => void;
  label: string;
  /** نسبت پیش‌نمایش — بنر عریض (16/7)، استوری/بندانگشتی (1/1) */
  aspect?: 'wide' | 'square';
  disabled?: boolean;
}

export function ImagePicker({ url, onChange, label, aspect = 'square', disabled }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      toast.error('فقط فایل JPG یا PNG یا WebP پذیرفته می‌شود');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('حجم فایل بیشتر از سقف ۲ مگابایت است');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = readStoredSessionToken();
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: form,
        headers: {
          // فال‌بک نشست همان api-client — در iframe بی‌کوکی هم ادمین می‌ماند
          ...(token ? { 'x-pars-session': token } : {}),
        },
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: { url: string };
        error?: { message?: string };
      } | null;
      if (!res.ok || !body?.ok || !body.data?.url) {
        throw new Error(body?.error?.message ?? 'آپلود ناموفق بود');
      }
      onChange(body.data.url);
      toast.success('تصویر آپلود شد');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'آپلود ناموفق بود');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <span className="mb-1 block text-[11px] font-bold text-ink-600">{label}</span>
      <div className="flex items-start gap-2.5">
        {url ? (
          <div
            className={`relative shrink-0 overflow-hidden rounded-xl border border-cream-200 bg-cream-100 ${
              aspect === 'wide' ? 'h-20 w-[180px]' : 'h-20 w-20'
            }`}
          >
            <img src={url} alt={label} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled || uploading}
              className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900/70 text-white"
              aria-label="حذف تصویر"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-cream-200 bg-cream-50 text-ink-300 transition-colors hover:border-brand-300 hover:text-brand-500 disabled:opacity-50 ${
              aspect === 'wide' ? 'h-20 w-[180px]' : 'h-20 w-20'
            }`}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="h-5 w-5" aria-hidden />
            )}
            <span className="text-[9.5px] font-bold">آپلود فایل</span>
          </button>
        )}

        <div className="min-w-0 flex-1">
          <input
            value={url}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || uploading}
            dir="ltr"
            placeholder="/uploads/…"
            className="h-10 w-full rounded-xl border border-cream-200 bg-cream-50 px-3 text-left text-[11px] font-bold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300 focus:border-brand-400 disabled:opacity-60"
            aria-label={`${label} — مسیر`}
          />
          <p className="mt-1 text-[9.5px] leading-4 text-ink-300">
            JPG / PNG / WebP — حداکثر ۲ مگابایت
          </p>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
        aria-hidden
      />
    </div>
  );
}
