'use client';

import { useRef, useState } from 'react';
import {
  Check,
  Copy,
  FolderOpen,
  Images,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { EmptyState, PageHeader, Pill, Toolbar, mutationError } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { apiDelete, apiUpload } from '@/lib/api-client';
import { formatJalaliDate } from '@/lib/jalali';
import { toFaDigits } from '@/lib/fa';
import { cn } from '@/lib/utils';

/**
 * گالری رسانه (درخواست کاربر) — گردآوری و مدیریت همه تصاویر آپلودشده
 *
 * - فهرست کامل فایل‌های storage/media با بندانگشتی، حجم و تاریخ
 * - آپلود چندتایی با کشیدن/انتخاب فایل + انتخاب پوشهٔ مقصد (kind)
 * - کپی نشانی تصویر برای استفاده در متن‌ها و بلوک‌های صفحه‌ساز
 * - حذف با تأیید — اگر تصویر در بخشی در حال استفاده باشد سرور جلوی حذف را می‌گیرد (۴۰۹)
 */

interface MediaFileRow {
  url: string;
  filePath: string;
  kind: string;
  mime: string;
  bytes: number;
  mtime: string;
}

interface MediaResp {
  files: MediaFileRow[];
}

/** برچسب فارسی پوشه‌ها — هم‌راستا با MEDIA_KINDS سرور */
const KIND_LABELS: Record<string, string> = {
  general: 'عمومی',
  products: 'محصولات',
  banners: 'بنرها',
  categories: 'دسته‌بندی‌ها',
  stories: 'استوری‌ها',
  brand: 'برند',
  content: 'محتوا و وبلاگ',
};

const UPLOAD_KINDS = ['general', 'products', 'banners', 'categories', 'stories', 'brand', 'content'] as const;

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const MAX_MB = 5;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${toFaDigits((bytes / (1024 * 1024)).toFixed(1))} مگ`;
  return `${toFaDigits(Math.max(1, Math.round(bytes / 1024)))} کیلو`;
}

export default function AdminGalleryPage() {
  return (
    <AdminShell>
      <GalleryContent />
    </AdminShell>
  );
}

function GalleryContent() {
  const { data, loading, error, reload } = useApi<MediaResp>('/api/admin/media');
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadKind, setUploadKind] = useState<(typeof UPLOAD_KINDS)[number]>('content');
  const [filter, setFilter] = useState<string>('all');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const files = data?.files ?? [];
  const kinds = Array.from(new Set(files.map((f) => f.kind)));
  const visible = filter === 'all' ? files : files.filter((f) => f.kind === filter);

  // ——— آپلود چندتایی ———
  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    let okCount = 0;
    let failCount = 0;
    for (const file of Array.from(list)) {
      if (!ACCEPT.split(',').includes(file.type) || file.size > MAX_MB * 1024 * 1024) {
        failCount += 1;
        continue;
      }
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('kind', uploadKind);
        await apiUpload('/api/admin/media', form);
        okCount += 1;
      } catch {
        failCount += 1;
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    if (okCount > 0 && failCount === 0) {
      toast.success(`${toFaDigits(okCount)} تصویر در پوشهٔ «${KIND_LABELS[uploadKind] ?? uploadKind}» ذخیره شد`);
    } else if (okCount > 0) {
      toast.warning(`${toFaDigits(okCount)} موفق، ${toFaDigits(failCount)} ناموفق (فرمت یا حجم نامعتبر)`);
    } else {
      toast.error(`آپلود ناموفق — فرمت مجاز: PNG/JPG/WebP/GIF تا ${MAX_MB} مگابایت`);
    }
    reload();
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success('نشانی تصویر کپی شد');
      setTimeout(() => setCopiedUrl(null), 1800);
    } catch {
      toast.error('کپی نشد — نشانی از راهنمای زیر دستی انتخاب کنید');
    }
  };

  return (
    <div>
      <PageHeader
        title="گالری تصاویر"
        desc="همهٔ تصاویر آپلودشدهٔ فروشگاه — آپلود جدید، کپی نشانی و حذف ایمن"
      />

      <Toolbar>
        {/* انتخاب پوشهٔ مقصد آپلود */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-bold text-ink-400">آپلود به:</span>
          <select
            value={uploadKind}
            onChange={(e) => setUploadKind(e.target.value as (typeof UPLOAD_KINDS)[number])}
            className="h-9 rounded-xl border border-cream-200 bg-white px-2 text-[11.5px] font-bold text-ink-700 outline-none focus:border-brand-400"
            aria-label="پوشهٔ مقصد آپلود"
          >
            {UPLOAD_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k] ?? k}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-[12px] font-black text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UploadCloud className="h-4 w-4" aria-hidden />}
          آپلود تصویر
        </button>
        <button
          type="button"
          onClick={reload}
          className="mr-auto flex h-9 w-9 items-center justify-center rounded-lg bg-cream-100 text-ink-500 hover:bg-cream-200"
          aria-label="بازخوانی"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="text-[10.5px] text-ink-400">{toFaDigits(files.length)} تصویر</span>
      </Toolbar>

      {/* ناحیهٔ کشیدن فایل */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragOver(false);
          void onFiles(e.dataTransfer.files);
        }}
        aria-label="کشیدن فایل برای آپلود چندتایی"
        className={cn(
          'mb-3 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-3xl border-2 border-dashed px-4 py-6 text-center transition-all',
          dragOver
            ? 'border-brand-500 bg-brand-50/70 ring-4 ring-brand-100'
            : 'border-cream-300 bg-white/60 hover:border-brand-300 hover:bg-brand-50/40',
          uploading && 'pointer-events-none opacity-80'
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden />
            <p className="text-[12px] font-black text-ink-700">در حال آپلود…</p>
          </>
        ) : (
          <>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <UploadCloud className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-[12px] font-black text-ink-700">
              {dragOver ? 'فایل‌ها را همین‌جا رها کنید' : 'تصاویر را اینجا بکشید یا کلیک کنید — آپلود چندتایی پشتیبانی می‌شود'}
            </p>
            <p className="text-[10px] text-ink-400">مقصد: پوشهٔ «{KIND_LABELS[uploadKind] ?? uploadKind}» — تا {MAX_MB} مگابایت برای هر فایل</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
        aria-label="انتخاب فایل‌ها برای آپلود"
      />

      {/* فیلتر پوشه‌ها */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={cn(
            'rounded-full px-3 py-1.5 text-[11px] font-black transition-colors',
            filter === 'all' ? 'bg-brand-600 text-white' : 'bg-cream-100 text-ink-500 hover:bg-cream-200'
          )}
        >
          همه
        </button>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[11px] font-black transition-colors',
              filter === k ? 'bg-brand-600 text-white' : 'bg-cream-100 text-ink-500 hover:bg-cream-200'
            )}
          >
            {KIND_LABELS[k] ?? k}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="shimmer h-72 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={Images} title="دریافت گالری ناموفق بود" hint={error ?? undefined} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={filter === 'all' ? 'هنوز تصویری آپلود نشده' : 'در این پوشه تصویری نیست'}
          hint="از دکمهٔ «آپلود تصویر» یا کشیدن فایل استفاده کنید"
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((f) => (
            <figure
              key={f.url}
              className="group overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-card"
            >
              <div className="relative aspect-square overflow-hidden bg-cream-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={`تصویر آپلودی — ${KIND_LABELS[f.kind] ?? f.kind}`}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute right-1.5 top-1.5">
                  <Pill tone="brand">{KIND_LABELS[f.kind] ?? f.kind}</Pill>
                </span>
              </div>
              <figcaption className="space-y-1.5 p-2.5">
                <p dir="ltr" className="truncate text-right text-[9.5px] leading-4 text-ink-300" title={f.filePath}>
                  {f.filePath}
                </p>
                <p className="flex items-center justify-between text-[9.5px] text-ink-400">
                  <span>{formatBytes(f.bytes)}</span>
                  <span>{formatJalaliDate(f.mtime)}</span>
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copyUrl(f.url)}
                    className="flex h-8 flex-1 items-center justify-center gap-1 rounded-xl bg-cream-100 text-[10.5px] font-black text-ink-600 transition-colors hover:bg-cream-200"
                    aria-label={`کپی نشانی ${f.filePath}`}
                  >
                    {copiedUrl === f.url ? (
                      <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {copiedUrl === f.url ? 'کپی شد' : 'کپی نشانی'}
                  </button>
                  <DeleteButtonInline url={f.url} onDeleted={reload} />
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

/** دکمهٔ حذف ایمن فایل رسانه — پیام سرور برای «در حال استفاده» به toast می‌آید */
function DeleteButtonInline({ url, onDeleted }: { url: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const doDelete = async () => {
    setBusy(true);
    try {
      await apiDelete(`/api/admin/media?url=${encodeURIComponent(url)}`);
      toast.success('تصویر حذف شد');
      onDeleted();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy}
        aria-label="حذف تصویر"
        className="flex h-8 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
      </button>
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تأیید حذف تصویر"
          onClick={() => !busy && setConfirming(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[13px] font-black text-ink-900">تأیید حذف تصویر</p>
            <p className="mt-2 text-[11px] leading-5 text-ink-500">
              این فایل برای همیشه از گالری حذف می‌شود. اگر در محصول، بنر، وبلاگ یا صفحه‌ای در حال استفاده باشد،
              سرور جلوی حذف را می‌گیرد و بخش‌های مربوط را اعلام می‌کند.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void doDelete()}
                disabled={busy}
                className="h-9 flex-1 rounded-xl bg-red-600 text-[12px] font-black text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                حذف کن
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="h-9 rounded-xl bg-cream-100 px-4 text-[12px] font-black text-ink-500 transition-colors hover:bg-cream-200"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
