'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AnimatePresence,
  motion,
} from 'framer-motion';
import {
  ChevronLeft,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Settings2,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/shared/States';
import { apiGet } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import {
  useDeliveryStore,
  type DeliveryAddress,
} from '@/stores/delivery-store';
import { useRouterStore } from '@/stores/router-store';

/**
 * برگه انتخاب آدرس تحویل — جایگزین toast بی‌عملکرد هدر (درخواست کاربر)
 *
 * - مهمان: راهنمای ورود + دکمه ورود/ثبت‌نام
 * - کاربر واردشده: فهرست آدرس‌های حساب با انتخاب یک‌لمسی
 * - بدون آدرس → دعوت به افزودن از نمای آدرس‌ها
 * - انتخاب جاری در هدر و سراسر اپ ذخیره می‌شود (delivery-store)
 */

interface AddressRow {
  id: string;
  title: string;
  receiverName: string | null;
  receiverPhone: string | null;
  province: string;
  city: string;
  fullAddress: string;
  isDefault: boolean;
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
}

export function AddressPickerSheet({ open, onClose }: SheetProps) {
  const push = useRouterStore((s) => s.push);
  const user = useAuthStore((s) => s.user);
  const selectedId = useDeliveryStore((s) => s.selected?.id ?? null);
  const select = useDeliveryStore((s) => s.select);

  const [rows, setRows] = useState<AddressRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const data = await apiGet<{ addresses: AddressRow[] }>('/api/user/addresses');
      setRows(data.addresses ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) void load();
    if (!open) {
      // پاک‌سازی هنگام بستن تا باز شدن بعدی تازه باشد
      setRows(null);
      setError(false);
    }
  }, [open, user, load]);

  const pick = (row: AddressRow) => {
    const address: DeliveryAddress = {
      id: row.id,
      title: row.title,
      city: row.city,
      province: row.province,
    };
    select(address);
    toast.success(`آدرس تحویل: ${row.title}`);
    onClose();
  };

  const goAddresses = () => {
    onClose();
    push({ view: 'addresses' });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-40 flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {/* پس‌زمینه مات */}
          <button
            type="button"
            aria-label="بستن"
            onClick={onClose}
            className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]"
          />

          <motion.div
            role="dialog"
            aria-label="انتخاب آدرس تحویل"
            className="relative max-h-[78%] overflow-y-auto rounded-t-3xl border-t border-cream-200 bg-cream-50 pb-safe"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            {/* دستگیره */}
            <div className="sticky top-0 z-10 bg-cream-50 pt-2.5">
              <span
                className="mx-auto block h-1.5 w-12 rounded-full bg-cream-300"
                aria-hidden
              />
            </div>

            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <h2 className="flex items-center gap-2 text-[15px] font-black text-ink-900">
                <MapPin className="h-4.5 w-4.5 text-brand-600" aria-hidden />
                آدرس تحویل سفارش
              </h2>
              <button
                type="button"
                onClick={goAddresses}
                className="flex items-center gap-1 text-[11px] font-bold text-brand-600"
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                مدیریت آدرس‌ها
              </button>
            </div>

            <div className="px-4 pb-6 pt-1">
              {!user ? (
                /* ——— مهمان ——— */
                <div className="rounded-3xl border border-cream-200 bg-white px-5 py-7 text-center shadow-card">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <Store className="h-6 w-6" aria-hidden />
                  </span>
                  <p className="mt-3 text-[13px] font-black text-ink-800">
                    برای انتخاب آدرس تحویل وارد حساب شوید
                  </p>
                  <p className="mt-1.5 text-[11px] leading-5 text-ink-400">
                    آدرس‌های ذخیره‌شدهٔ حساب شما اینجا فهرست می‌شوند تا با یک
                    لمس محل تحویل را عوض کنید.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      push({ view: 'login' });
                    }}
                    className="mt-4 flex h-11 w-full items-center justify-center rounded-2xl bg-brand-600 text-[13px] font-black text-white active:scale-[0.98]"
                  >
                    ورود / ثبت‌نام
                    <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-500" aria-hidden />
                </div>
              ) : error ? (
                <ErrorState title="دریافت آدرس‌ها ناموفق بود" onRetry={() => void load()} />
              ) : (rows?.length ?? 0) === 0 ? (
                <EmptyState
                  icon={MapPin}
                  title="هنوز آدرسی ثبت نکرده‌اید"
                  description="از بخش آدرس‌ها یک نشانی اضافه کنید تا در همین‌جا قابل انتخاب باشد."
                  actionLabel="افزودن آدرس"
                  onAction={goAddresses}
                />
              ) : (
                <div className="space-y-2.5">
                  {rows!.map((row) => {
                    const active = selectedId === row.id;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => pick(row)}
                        className={`w-full rounded-2xl border px-4 py-3.5 text-right shadow-card transition-all ${
                          active
                            ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-400/40'
                            : 'border-cream-200 bg-white active:bg-cream-100'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                              active
                                ? 'border-brand-600 bg-brand-600'
                                : 'border-cream-300 bg-white'
                            }`}
                            aria-hidden
                          >
                            {active && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-black text-ink-900">
                            {row.title}
                          </span>
                          {row.isDefault && (
                            <span className="shrink-0 rounded-full bg-gold-100 px-2 py-0.5 text-[9px] font-black text-brand-900">
                              پیش‌فرض
                            </span>
                          )}
                        </span>
                        <span className="mt-1.5 block truncate pr-7 text-[11px] text-ink-500">
                          {`${row.province} — ${row.city} — ${row.fullAddress}`}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={goAddresses}
                    className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-brand-300 bg-white text-[12px] font-black text-brand-700 active:bg-brand-50"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    افزودن آدرس جدید
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * ردیف نمایش آدرس انتخابی داخل دکمه هدر — خلاصه کوتاه
 */
export function deliveryLabel(selected: DeliveryAddress | null): string {
  if (!selected) return 'انتخاب آدرس تحویل';
  return `تحویل به: ${selected.title}`;
}
