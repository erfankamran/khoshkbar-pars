'use client';

import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiDelete } from '@/lib/api-client';
import { ApiClientError } from '@/lib/api-client';

/**
 * اجزای مشترک صفحات پنل مدیریت (فاز ۱۴) — یکدستی سربرگ، حالت خالی، حذف تأییدی
 */

export function PageHeader({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-base font-black text-ink-900">{title}</h1>
        {desc && <p className="mt-0.5 text-[11px] leading-5 text-ink-400">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  const Icon = icon;
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-cream-300 bg-white/60 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-100 text-ink-300">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="mt-3 text-[13px] font-black text-ink-600">{title}</p>
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </div>
  );
}

export function Pill({
  tone = 'ink',
  children,
}: {
  tone?: 'brand' | 'gold' | 'red' | 'ink' | 'green';
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-brand-600 text-white',
    gold: 'bg-gold-100 text-gold-700',
    red: 'bg-red-50 text-red-600',
    ink: 'bg-ink-100 text-ink-600',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black',
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

/** نوار فیلتر بالای جدول/کارت‌ها */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-cream-200 bg-white p-2.5">
      {children}
    </div>
  );
}

/** دکمه حذف با تأیید — پیام خطای سرور به toast؛ icon اختیاری (مثلاً Trash2) */
export function DeleteButton({
  path,
  confirmText,
  onDeleted,
  label = 'حذف',
  className,
  icon,
}: {
  path: string;
  confirmText: string;
  onDeleted: () => void;
  label?: string;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const Icon = icon;

  const doDelete = async () => {
    setBusy(true);
    try {
      await apiDelete(path);
      toast.success('با موفقیت حذف شد');
      onDeleted();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'حذف ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50',
            className
          )}
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
          {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
          {label}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">تأیید حذف</AlertDialogTitle>
          <AlertDialogDescription className="text-right">
            {confirmText}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row-reverse gap-2">
          <AlertDialogAction
            onClick={() => void doDelete()}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            حذف کن
          </AlertDialogAction>
          <AlertDialogCancel>انصراف</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** خطای ثبت فرم — پیام فارسی از ApiClientError */
export function mutationError(e: unknown): string {
  return e instanceof ApiClientError ? e.message : 'عملیات ناموفق بود — دوباره تلاش کنید';
}

/** برچسب وضعیت سفارش */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  PROCESSING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال‌شده',
  DELIVERED: 'تحویل‌شده',
  CANCELED: 'لغو شده',
};

export const ORDER_STATUS_TONES: Record<string, 'brand' | 'gold' | 'red' | 'ink' | 'green'> = {
  PENDING_PAYMENT: 'gold',
  PAID: 'brand',
  PROCESSING: 'ink',
  SHIPPED: 'ink',
  DELIVERED: 'green',
  CANCELED: 'red',
};

/** گذارهای مجاز ماشین وضعیت سفارش — هم‌راستا با orders.service */
export const ORDER_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELED'],
  PAID: ['PROCESSING', 'CANCELED'],
  PROCESSING: ['SHIPPED', 'CANCELED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELED: [],
};
