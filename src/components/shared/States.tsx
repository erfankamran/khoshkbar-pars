import type { ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type IconType = ComponentType<LucideProps>;

/**
 * حالت‌های استاندارد همه بخش‌ها (بخش ۱۷ مشخصات):
 * Loading (Skeletons.tsx) / Empty / Error + Retry
 * هر بخش داده‌محور در فازهای بعد موظف است هر سه حالت را داشته باشد.
 */

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: {
  icon: IconType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-8 py-14 text-center',
        className
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-400">
        <Icon className="h-9 w-9" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-bold text-ink-800">{title}</h3>
      {description ? (
        <p className="max-w-[270px] text-[13px] leading-6 text-ink-500">
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          onClick={onAction}
          className="mt-2 h-10 rounded-2xl bg-brand-500 px-6 text-sm font-bold hover:bg-brand-600"
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = 'خطایی رخ داد',
  description = 'در دریافت اطلاعات مشکلی پیش آمد. لطفاً دوباره تلاش کنید.',
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-8 py-14 text-center',
        className
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-400">
        <RefreshCw className="h-8 w-8" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-bold text-ink-800">{title}</h3>
      <p className="max-w-[270px] text-[13px] leading-6 text-ink-500">
        {description}
      </p>
      {onRetry ? (
        <Button
          variant="outline"
          onClick={onRetry}
          className="mt-2 h-10 rounded-2xl border-brand-200 px-6 text-sm font-bold text-brand-700 hover:bg-brand-50"
        >
          تلاش مجدد
        </Button>
      ) : null}
    </div>
  );
}

/**
 * حالت «در فاز بعدی فعال می‌شود» — شفاف‌سازی صادقانه برای بخش‌هایی که
 * هنوز داده/Backend ندارند (طبق قانون ۵ پروژه: ادعای پیاده‌سازی نادرست ممنوع).
 */
export function PhasePlaceholderState({
  icon: Icon,
  title,
  description,
  phaseLabel,
  children,
  className,
}: {
  icon: IconType;
  title: string;
  description?: string;
  phaseLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-8 py-14 text-center',
        className
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-cream-100 text-brand-500">
        <Icon className="h-9 w-9" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-bold text-ink-800">{title}</h3>
      {description ? (
        <p className="max-w-[280px] text-[13px] leading-6 text-ink-500">
          {description}
        </p>
      ) : null}
      {phaseLabel ? (
        <span className="mt-1 rounded-full bg-cream-100 px-3 py-1 text-[11px] font-bold text-gold-600">
          {phaseLabel}
        </span>
      ) : null}
      {children}
    </div>
  );
}
