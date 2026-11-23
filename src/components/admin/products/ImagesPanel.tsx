'use client';

import { useRef, useState } from 'react';
import { FileUp, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  apiDelete,
  apiPatch,
  apiPost,
  ApiClientError,
  readStoredSessionToken,
} from '@/lib/api-client';
import { toFaDigits } from '@/lib/fa';
import type { AdminProductDetailDTO } from '@/server/services/admin/catalog-admin.service';

/**
 * پنل مدیریت تصاویر محصول (فاز ۱۱.۲)
 *
 * - آپلود واقعی فایل (POST /api/admin/upload — ماجیک‌نمبر + سقف ۲MB سمت سرور)
 *   و URL دستی از فایل‌های موجود /public (با بررسی وجود فایل سمت سرور)
 * - پس از آپلود موفق، مسیر برگشتی در فیلد «مسیر تصویر» می‌نشیند تا ادمین
 *   متن جایگزین/ترتیب را تعیین و «افزودن» را بزند
 * - ترتیب نمایش با sortOrder (کوچک‌تر جلوتر) — همان ترتیب گالری فروشگاه
 */

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // هم‌سقف با سرور — بازخورد فوری بدون رفت‌وبرگشت

interface Props {
  product: AdminProductDetailDTO;
  onChanged: (p: AdminProductDetailDTO) => void;
}

const inputCls =
  'h-10 w-full rounded-lg border border-cream-200 bg-white px-2.5 text-[12px] font-bold text-ink-900 outline-none focus:border-brand-400';

export function ImagesPanel({ product, onChanged }: Props) {
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // آپلود فایل از سیستم کاربر — اعتبارسنجی واقعی (ماجیک‌نمبر) سمت سرور است؛
  // چک حجم/پسوند اینجا فقط برای بازخورد فوری و جلوگیری از آپلود بیهوده است
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
      setUrl(body.data.url);
      toast.success('فایل آپلود شد — اکنون «افزودن» را بزنید');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'آپلود ناموفق بود');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const add = async () => {
    const cleanUrl = url.trim();
    if (!/^\/[A-Za-z0-9._\-/]+\.(webp|png|jpg|jpeg)$/i.test(cleanUrl)) {
      toast.error('مسیر تصویر باید نسبی باشد — مثال: /images/products/pistachio.webp');
      return;
    }
    setBusy(true);
    try {
      const updated = await apiPost<AdminProductDetailDTO>(
        `/api/admin/products/${product.id}/images`,
        {
          url: cleanUrl,
          alt: alt.trim() || undefined,
          sortOrder: sortOrder ? parseInt(sortOrder, 10) : 0,
        }
      );
      onChanged(updated);
      setUrl('');
      setAlt('');
      setSortOrder('');
      toast.success('تصویر اضافه شد');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'افزودن تصویر ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (imageId: string) => {
    setBusy(true);
    try {
      await apiDelete(`/api/admin/images/${imageId}`);
      onChanged({ ...product, images: product.images.filter((i) => i.id !== imageId) });
      toast.success('تصویر حذف شد');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'حذف ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const patch = async (
    imageId: string,
    data: { alt?: string; sortOrder?: number }
  ) => {
    setBusy(true);
    try {
      const updated = await apiPatch<AdminProductDetailDTO>(
        `/api/admin/images/${imageId}`,
        data
      );
      onChanged(updated);
      toast.success('تصویر بروزرسانی شد');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'ذخیره ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
      aria-label="تصاویر محصول"
    >
      <h2 className="mb-3 text-[13px] font-black text-ink-900">
        تصاویر ({toFaDigits(product.images.length)}) — تصویر اول، تصویر کارت محصول است
      </h2>

      {/* ——— فرم افزودن ——— */}
      <div className="mb-4 rounded-2xl border border-brand-100 bg-brand-50/50 p-3">
        {/* آپلود فایل از سیستم */}
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
            aria-label="انتخاب فایل تصویر"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || busy}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 text-[11.5px] font-black text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <FileUp className="h-3.5 w-3.5" aria-hidden />
            )}
            {uploading ? 'در حال آپلود…' : 'آپلود فایل جدید'}
          </button>
          <span className="text-[10px] text-ink-400">
            JPG / PNG / WebP — حداکثر {toFaDigits(2)} مگابایت
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_100px_auto]">
          <div>
            <span className="mb-1 block text-[10px] font-bold text-ink-500">
              مسیر تصویر (نسبی از /public) *
            </span>
            <input
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/uploads/… یا /images/products/pistachio.webp"
              className={`${inputCls} text-left`}
            />
          </div>
          <div>
            <span className="mb-1 block text-[10px] font-bold text-ink-500">متن جایگزین</span>
            <input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              maxLength={120}
              placeholder="پسته اکبری"
              className={inputCls}
            />
          </div>
          <div>
            <span className="mb-1 block text-[10px] font-bold text-ink-500">ترتیب</span>
            <input
              dir="ltr"
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="0"
              className={`${inputCls} text-center`}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void add()}
              disabled={busy}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-[11.5px] font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              )}
              افزودن
            </button>
          </div>
        </div>
      </div>

      {/* ——— شبکه تصاویر ——— */}
      {product.images.length === 0 ? (
        <p className="rounded-2xl bg-cream-50 px-3 py-4 text-center text-[11.5px] text-ink-400">
          تصویری ثبت نشده — کارت محصول بدون تصویر نمایش داده می‌شود
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {product.images.map((img, idx) => (
            <figure
              key={img.id}
              className="overflow-hidden rounded-2xl border border-cream-200 bg-cream-50"
            >
              <div className="relative aspect-square">
                <img
                  src={img.url}
                  alt={img.alt ?? 'تصویر محصول'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {idx === 0 && (
                  <span className="absolute right-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-black text-white">
                    تصویر اصلی
                  </span>
                )}
              </div>
              <figcaption className="space-y-1.5 p-2">
                <input
                  defaultValue={img.alt ?? ''}
                  onBlur={(e) => {
                    if (e.target.value !== (img.alt ?? '')) {
                      void patch(img.id, { alt: e.target.value });
                    }
                  }}
                  placeholder="متن جایگزین"
                  className={inputCls}
                  aria-label="متن جایگزین تصویر"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    dir="ltr"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={img.sortOrder}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (Number.isFinite(v) && v !== img.sortOrder) {
                        void patch(img.id, { sortOrder: Math.min(100, Math.max(0, v)) });
                      }
                    }}
                    className={`${inputCls} text-center`}
                    aria-label="ترتیب تصویر"
                  />
                  <button
                    type="button"
                    onClick={() => void remove(img.id)}
                    disabled={busy}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                    aria-label="حذف تصویر"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
