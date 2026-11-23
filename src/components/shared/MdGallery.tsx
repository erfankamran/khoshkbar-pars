'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Expand } from 'lucide-react';

/**
 * گالری بلوک :::gallery صفحه‌ساز (درخواست کاربر)
 *
 * شبکهٔ واکنش‌گرا از تصاویر + بزرگ‌نمایی با Dialog (لایت‌باکس سبک).
 * آدرس‌ها یا صریح در متن آمده‌اند یا (خالی) از کتابخانهٔ رسانه پر می‌شوند
 * — لیست نهایی از والد (MarkdownContent) به‌صورت srcs نهایی می‌آید.
 */
export function MdGallery({ images }: { images: { src: string; alt: string }[] }) {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  if (images.length === 0) return null;

  return (
    <section aria-label="گالری تصاویر">
      <div className="grid grid-cols-3 gap-2">
        {images.map((img, i) => (
          <button
            key={`${img.src}-${i}`}
            type="button"
            onClick={() => setZoom(img)}
            aria-label={`بزرگ‌نمایی ${img.alt || `تصویر ${i + 1}`}`}
            className="group relative aspect-square w-full overflow-hidden rounded-xl bg-cream-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt={img.alt || `تصویر ${i + 1}`}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
            />
            <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-ink-950/45 text-cream-50 opacity-0 transition-opacity group-hover:opacity-100">
              <Expand className="h-3 w-3" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      <Dialog open={zoom !== null} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent dir="rtl" className="border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">
            {zoom?.alt || 'تصویر گالری'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            نمای بزرگ تصویر — برای بستن کلیک کنید
          </DialogDescription>
          {zoom && (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={zoom.src}
                alt={zoom.alt || 'تصویر گالری'}
                className="max-h-[80vh] w-full rounded-2xl object-contain"
              />
              {zoom.alt && (
                <figcaption className="mt-2 text-center text-[11.5px] font-bold text-cream-100">
                  {zoom.alt}
                </figcaption>
              )}
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
