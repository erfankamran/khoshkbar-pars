import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * قاب موبایل مرکزی — قلب Mobile-First واقعی (بخش ۲ مشخصات)
 * - در موبایل (تا 480px): تمام‌عرض
 * - در نمایشگر بزرگ: ستون 480px در مرکز با سایه و پس‌زمینه برند در اطراف
 * - ساختار ستونی: Header (ثابت بالا) + محتوای اسکرول‌شونده + BottomNav (ثابت پایین)
 */
export function MobileFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-cream-50',
        'shadow-float md:border-x md:border-cream-200/70',
        className
      )}
    >
      {children}
    </div>
  );
}
