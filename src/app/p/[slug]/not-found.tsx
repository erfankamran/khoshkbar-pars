import Link from 'next/link';
import { SearchX } from 'lucide-react';

/**
 * صفحه ۴۰۴ اختصاصی مسیر محصول (/p/[slug]) — برای سئو و تجربه کاربری:
 * محصول حذف‌شده/غیرفعال با کد 404 و پیشنهاد بازگشت به فروشگاه پاسخ داده می‌شود.
 */
export default function ProductNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream-50 px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cream-100">
        <SearchX className="h-8 w-8 text-ink-300" aria-hidden />
      </span>
      <h1 className="mt-4 text-base font-black text-ink-900">این محصول پیدا نشد</h1>
      <p className="mt-2 max-w-xs text-[12.5px] leading-6 text-ink-500">
        ممکن است این کالا حذف شده یا دیگر در فروشگاه فعال نباشد. محصولات تازه پارس را از
        فروشگاه ببینید.
      </p>
      <Link
        href="/"
        className="mt-5 flex h-11 items-center rounded-xl bg-brand-600 px-5 text-[12.5px] font-black text-white transition-colors hover:bg-brand-700"
      >
        بازگشت به فروشگاه
      </Link>
    </div>
  );
}
