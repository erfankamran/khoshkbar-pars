'use client';

import { useState } from 'react';
import { CheckCircle2, ExternalLink, Info, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { copyText } from '@/lib/clipboard';
import { toFaDigits } from '@/lib/fa';

/**
 * دیالوگ «بررسی وضعیت بسته پست» (درخواست کاربر) — تجربه رهگیری یکپارچه
 *
 * سایت پست (tracking.post.ir) دامنه جداگانه است و مرورگرها اجازه پرکردن
 * خودکار فیلد سایت دیگر را نمی‌دهند؛ بهترین تجربه ممکن:
 *   ۱) کد رهگیری هنگام کلیک، خودکار در کلیپ‌بورد کپی می‌شود (قبل از باز شدن دیالوگ)
 *   ۲) سایت پست در تب جدید باز می‌شود (با پارامتر id — اگر سامانه پشتیبانی کند
 *      خودبه‌خود پر می‌شود)
 *   ۳) این پنل راهنمای ۳ مرحله‌ای چسباندن کد را نمایش می‌دهد (Ctrl+V / Paste)
 */

const POST_TRACKING_URL = 'https://tracking.post.ir/';

export function PostTrackingDialog({
  code,
  open,
  copiedInitially,
  onClose,
}: {
  /** کد رهگیری — ارقام لاتین (همان که سایت پست می‌پذیرد) */
  code: string;
  open: boolean;
  /** آیا کپی خودکار هنگام کلیک موفق بود */
  copiedInitially: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(copiedInitially);

  const postUrl = `${POST_TRACKING_URL}?id=${encodeURIComponent(code)}`;

  const openPostSite = () => {
    window.open(postUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md rounded-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px] font-black text-ink-900">
            بررسی وضعیت بسته پست
          </DialogTitle>
        </DialogHeader>

        {/* ——— کد رهگیری بزرگ + کپی ——— */}
        <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/60 p-3.5 text-center">
          <p className="text-[10.5px] font-bold text-ink-500">شناسه باربری (کد رهگیری مرسوله)</p>
          <p dir="ltr" className="mt-1 select-all text-lg font-black tracking-wider text-brand-800">
            {toFaDigits(code)}
          </p>
          <button
            type="button"
            onClick={() => {
              void copyText(code).then((ok) => {
                setCopied(ok);
                if (ok) toast.success('کد رهگیری دوباره کپی شد');
                else toast.error('کپی خودکار ممکن نشد — کد را دستی انتخاب و کپی کنید');
              });
            }}
            className="mx-auto mt-2 flex h-8 items-center gap-1.5 rounded-xl bg-white px-3 text-[11px] font-black text-brand-700 shadow-sm transition-colors hover:bg-brand-50"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" aria-hidden />
                کپی شد — آماده چسباندن
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                کپی مجدد کد
              </>
            )}
          </button>
        </div>

        {/* ——— CTA اصلی: رفتن به سایت پست ——— */}
        <button
          type="button"
          onClick={openPostSite}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-[13px] font-black text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          رفتن به سایت پست و رهگیری بسته
        </button>

        {/* ——— راهنمای ۳ مرحله‌ای ——— */}
        <ol className="space-y-2 rounded-2xl bg-cream-50 p-3 text-[11px] leading-5 text-ink-600">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-black text-brand-700">
              ۱
            </span>
            <span>
              کد رهگیری <b className="text-ink-900">به‌صورت خودکار کپی شده است</b> — نیازی به
              تایپ نیست.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-black text-brand-700">
              ۲
            </span>
            <span>
              در سایت پست، روی کادر «کد رهگیری مرسوله» <b className="text-ink-900">دوبار کلیک</b>{' '}
              کنید و با <b dir="ltr" className="text-ink-900">Ctrl+V</b> (یا Paste) بچسبانید.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-black text-brand-700">
              ۳
            </span>
            <span>روی دکمه ذره‌بین (جستجو) کلیک کنید تا وضعیت لحظه‌ای بسته نمایش داده شود.</span>
          </li>
        </ol>

        <p className="flex items-start gap-1.5 text-[10px] leading-4 text-ink-400">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          اگر تب سایت پست باز نشد (مسدودکنندهٔ پاپ‌آپ)، نشانی tracking.post.ir را دستی باز کنید —
          کد در کلیپ‌بورد شما باقی می‌ماند. به‌روزرسانی وضعیت مرسوله در اختیار شرکت پست است و ممکن
          است چند ساعت تأخیر داشته باشد.
        </p>
      </DialogContent>
    </Dialog>
  );
}
