'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Loader2, MapPin, ShieldAlert, ShoppingCart, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pill, mutationError, ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '@/components/admin/kit';
import { apiGet, apiPatch } from '@/lib/api-client';
import { formatPrice, toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import { cn } from '@/lib/utils';

/**
 * جزئیات کاربر (درخواست کاربر) — دیالوگ مشترک داشبورد و صفحه کاربران
 * پروفایل + آمار خرید + سفارش‌های اخیر + آدرس‌ها + مسدودسازی سریع
 * مجموع خرید = جمع مبلغ سفارش‌های موفق (بدون لغوشده و در انتظار پرداخت)
 * داده از GET /api/admin/users/[id] — دسترسی فقط مدیر (سرور)
 */

export interface UserDetailData {
  user: {
    id: string;
    phone: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    email: string | null;
    avatarUrl: string | null;
    role: string;
    isActive: boolean;
    phoneVerifiedAt: string | null;
    lastLoginAt: string | null;
    createdAt: string;
    _count: { orders: number; addresses: number };
  };
  stats: {
    totalSpentToman: number;
    paidCount: number;
    pendingCount: number;
    canceledCount: number;
    totalCount: number;
    lastOrderAt: string | null;
  };
  recentOrders: Array<{
    id: string;
    code: string;
    status: string;
    totalToman: number;
    discountToman: number;
    paymentMethod: string | null;
    paymentStatus: string;
    createdAt: string;
    _count: { items: number };
  }>;
  addresses: Array<{
    id: string;
    title: string;
    receiverName: string;
    receiverPhone: string;
    province: string;
    city: string;
    postalCode: string | null;
    fullAddress: string;
    isDefault: boolean;
  }>;
}

const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: 'پرداخت‌نشده',
  PAID: 'پرداخت‌شده',
  FAILED: 'ناموفق',
  REFUNDED: 'بازگشت‌داده‌شده',
};

export function UserDetailDialog({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<UserDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const d = await apiGet<UserDetailData>(`/api/admin/users/${id}`);
      setData(d);
      onChanged?.();
    } catch (e) {
      setError(mutationError(e));
    }
  };

  // بارگذاری اولیه — یک‌بار به‌ازای id
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleActive = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await apiPatch(`/api/admin/users/${id}`, { isActive: !data.user.isActive });
      toast.success(data.user.isActive ? 'کاربر مسدود شد — نشست‌ها باطل شدند' : 'کاربر فعال شد');
      await load();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">خطا</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-red-600">{error}</p>
        </DialogContent>
      </Dialog>
    );
  }

  if (!data) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogTitle className="sr-only">جزئیات کاربر</DialogTitle>
          <div className="shimmer h-64 rounded-2xl" aria-label="در حال بارگذاری" />
        </DialogContent>
      </Dialog>
    );
  }

  const { user, stats, recentOrders, addresses } = data;
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.fullName?.trim() ||
    'مشتری پارس';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">جزئیات کاربر</DialogTitle>
        </DialogHeader>

        {/* ——— پروفایل ——— */}
        <div className="flex items-center gap-3 rounded-2xl border border-cream-200 bg-cream-50/60 p-3">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt="آواتار"
              className="h-12 w-12 shrink-0 rounded-full border border-cream-200 bg-white object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream-200 text-[14px] font-black text-ink-500">
              {displayName.charAt(0)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-black text-ink-900">{displayName}</p>
            <p dir="ltr" className="text-right text-[11px] font-bold text-ink-500">
              {user.phone}
              {user.phoneVerifiedAt && <span className="mr-1 text-brand-600" title="شماره احرازشده">✓</span>}
            </p>
            {user.email && (
              <p dir="ltr" className="truncate text-right text-[10px] text-ink-400">{user.email}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Pill tone={user.role === 'ADMIN' ? 'brand' : 'ink'}>
              {user.role === 'ADMIN' ? 'مدیر' : user.role === 'PARTNER' ? 'همکار' : 'مشتری'}
            </Pill>
            <Pill tone={user.isActive ? 'green' : 'red'}>
              {user.isActive ? 'فعال' : 'مسدود'}
            </Pill>
          </div>
        </div>

        {/* ——— نوار آمار خرید ——— */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-brand-700" aria-hidden />
              <p className="text-[11px] font-black text-brand-900">مجموع خرید</p>
            </div>
            <p className="text-[16px] font-black text-brand-800">
              {formatPrice(stats.totalSpentToman)} <span className="text-[10px] font-bold">تومان</span>
            </p>
          </div>
          <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center">
            <div className="rounded-xl bg-white px-1 py-1.5">
              <p className="text-[12px] font-black text-ink-800">{toFaDigits(stats.paidCount)}</p>
              <p className="text-[8.5px] text-ink-400">موفق</p>
            </div>
            <div className="rounded-xl bg-white px-1 py-1.5">
              <p className="text-[12px] font-black text-gold-800">{toFaDigits(stats.pendingCount)}</p>
              <p className="text-[8.5px] text-ink-400">در انتظار</p>
            </div>
            <div className="rounded-xl bg-white px-1 py-1.5">
              <p className="text-[12px] font-black text-red-600">{toFaDigits(stats.canceledCount)}</p>
              <p className="text-[8.5px] text-ink-400">لغوشده</p>
            </div>
            <div className="rounded-xl bg-white px-1 py-1.5">
              <p className="text-[12px] font-black text-ink-800">{toFaDigits(stats.totalCount)}</p>
              <p className="text-[8.5px] text-ink-400">کل</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[9.5px] text-ink-400">
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3 w-3" aria-hidden />
              عضویت {formatJalaliDate(user.createdAt)}
            </span>
            {stats.lastOrderAt && <span>آخرین سفارش: {formatJalaliDate(stats.lastOrderAt)}</span>}
          </div>
        </div>

        {/* ——— سفارش‌های اخیر ——— */}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-black text-ink-800">
            <ShoppingCart className="h-3.5 w-3.5 text-brand-600" aria-hidden />
            سفارش‌های اخیر
            <span className="text-[9.5px] font-bold text-ink-300">
              ({toFaDigits(recentOrders.length)} از {toFaDigits(user._count.orders)})
            </span>
          </p>
          {recentOrders.length === 0 ? (
            <p className="rounded-xl border border-dashed border-cream-300 bg-white px-3 py-3 text-center text-[10.5px] text-ink-300">
              این کاربر هنوز سفارشی ثبت نکرده است
            </p>
          ) : (
            <div className="space-y-1.5">
              {recentOrders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-cream-200 bg-white px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p dir="ltr" className="text-right font-mono text-[10.5px] font-black text-ink-800">
                      {o.code}
                    </p>
                    <p className="text-[9px] text-ink-400">
                      {formatJalaliDate(o.createdAt)} — {toFaDigits(o._count.items)} قلم
                      {o.paymentMethod && (
                        <span className="mr-1">
                          — {PAYMENT_LABELS[o.paymentStatus] ?? o.paymentStatus}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[11px] font-black text-ink-800">{formatPrice(o.totalToman)}</span>
                    <Pill tone={ORDER_STATUS_TONES[o.status] ?? 'ink'}>
                      {ORDER_STATUS_LABELS[o.status] ?? o.status}
                    </Pill>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ——— آدرس‌ها ——— */}
        {addresses.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-black text-ink-800">
              <MapPin className="h-3.5 w-3.5 text-brand-600" aria-hidden />
              آدرس‌ها ({toFaDigits(addresses.length)})
            </p>
            <div className="space-y-1.5">
              {addresses.map((a) => (
                <div key={a.id} className="rounded-xl border border-cream-200 bg-white px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-black text-ink-800">{a.title}</p>
                    {a.isDefault && <Pill tone="green">پیش‌فرض</Pill>}
                  </div>
                  <p className="mt-0.5 text-[10px] leading-4 text-ink-500">
                    {a.province} / {a.city} — {a.fullAddress}
                  </p>
                  <p dir="ltr" className="text-right text-[9px] text-ink-400">
                    {a.receiverName} — {a.receiverPhone}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ——— مسدودسازی سریع ——— */}
        {user.role !== 'ADMIN' && (
          <button
            type="button"
            onClick={() => void toggleActive()}
            disabled={busy}
            className={cn(
              'flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[11.5px] font-black transition-colors',
              user.isActive
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-brand-600 text-white hover:bg-brand-700',
              busy && 'opacity-60'
            )}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            )}
            {user.isActive ? 'مسدودسازی کاربر (با ابطال نشست‌ها)' : 'فعال‌سازی کاربر'}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
