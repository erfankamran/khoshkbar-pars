import type { MouseEventHandler, ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** هدر بخش‌های صفحه اصلی با نوار طلایی تأکیدی */
export function SectionHeader({
  title,
  actionLabel = 'مشاهده همه',
  onAction,
  children,
  className,
}: {
  title: string;
  actionLabel?: string;
  onAction?: MouseEventHandler<HTMLButtonElement>;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 pb-3 pt-6',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="h-5 w-1.5 rounded-full bg-gold-400" aria-hidden />
        <h2 className="text-[15px] font-extrabold text-ink-900">{title}</h2>
        {children}
      </div>
      {onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="flex items-center gap-0.5 rounded-lg px-1 py-1 text-xs font-bold text-brand-600 transition-colors active:text-brand-800"
        >
          {actionLabel}
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
