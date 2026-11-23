import { cn } from '@/lib/utils';

/**
 * Skeleton های برند پارس — فاز ۲
 * قوانین (بخش ۷ مشخصات):
 * - ساختار Skeleton شبیه محتوای واقعی است (اندازه‌ها از قبل مشخص → بدون CLS)
 * - Shimmer ملایم با CSS خالص (کلاس shimmer در globals.css) — بدون کتابخانه سنگین
 * - Skeleton فقط زمانی رندر می‌شود که داده در حال بارگذاری است (در فازهای داده)
 */

/** بلوک پایه اسکلتون */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-2xl', className)} aria-hidden />;
}

/** اسکلتون دایره استوری */
export function StoryCircleSkeleton() {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
      <Shimmer className="h-16 w-16 rounded-full" />
      <Shimmer className="h-2.5 w-12" />
    </div>
  );
}

export function StoriesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pt-2">
      {Array.from({ length: count }).map((_, i) => (
        <StoryCircleSkeleton key={i} />
      ))}
    </div>
  );
}

/** اسکلتون بنر با نسبت ثابت (بدون Layout Shift) */
export function BannerSkeleton() {
  return <Shimmer className="mx-4 mt-4 aspect-[16/7] rounded-3xl" />;
}

/** اسکلتون کارت محصول — دقیقاً هم‌اندازه ProductCard واقعی فاز ۶ */
export function ProductCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'w-40 shrink-0 space-y-2.5 rounded-3xl border border-cream-200 bg-white p-3 shadow-card',
        className
      )}
    >
      <Shimmer className="aspect-square w-full rounded-2xl" />
      <Shimmer className="h-3.5 w-3/4" />
      <Shimmer className="h-3 w-1/2" />
      <div className="flex items-center justify-between pt-1">
        <Shimmer className="h-4 w-16" />
        <Shimmer className="h-8 w-8 rounded-xl" />
      </div>
    </div>
  );
}

/** ردیف افقی اسکلتون کارت محصول */
export function ProductRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** اسکلتون چیپ دسته‌بندی */
export function CategoryChipSkeleton() {
  return (
    <div className="flex w-[72px] shrink-0 flex-col items-center gap-1.5">
      <Shimmer className="h-16 w-16 rounded-2xl" />
      <Shimmer className="h-2.5 w-11" />
    </div>
  );
}

export function CategoryRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
      {Array.from({ length: count }).map((_, i) => (
        <CategoryChipSkeleton key={i} />
      ))}
    </div>
  );
}

/** اسکلتون لیست عمودی (سبد، سفارش‌ها، علاقه‌مندی‌ها) */
export function ListSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-3xl border border-cream-200 bg-white p-3 shadow-card"
        >
          <Shimmer className="h-16 w-16 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-3.5 w-2/3" />
            <Shimmer className="h-3 w-1/3" />
            <Shimmer className="h-4 w-1/4" />
          </div>
          <Shimmer className="h-8 w-8 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** اسکلتون صفحه جزئیات محصول */
export function ProductDetailSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-4">
      <Shimmer className="aspect-[4/3] w-full rounded-3xl" />
      <Shimmer className="h-5 w-2/3" />
      <Shimmer className="h-4 w-1/3" />
      <div className="flex gap-2">
        <Shimmer className="h-9 w-16 rounded-xl" />
        <Shimmer className="h-9 w-16 rounded-xl" />
        <Shimmer className="h-9 w-16 rounded-xl" />
      </div>
      <Shimmer className="h-12 w-full rounded-2xl" />
      <div className="space-y-2 pt-2">
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-5/6" />
        <Shimmer className="h-3 w-4/6" />
      </div>
    </div>
  );
}
