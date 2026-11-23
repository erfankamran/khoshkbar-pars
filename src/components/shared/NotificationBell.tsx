'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  Loader2,
  Megaphone,
  MessageSquareText,
  ShoppingCart,
  ShoppingBag,
  Truck,
  Wallet,
  X,
} from 'lucide-react';
import { toFaDigits } from '@/lib/fa';
import { timeAgoFa, useNotificationCenter } from '@/hooks/use-notification-center';
import { useAuthStore } from '@/stores/auth-store';
import { useRouterStore } from '@/stores/router-store';
import type { CenterNotificationDTO } from '@/server/services/notification-center.service';
import { useNotificationNavigation } from '@/hooks/use-notification-navigation';

/**
 * زنگولهٔ اعلان‌ها — دایرهٔ قرمز خوانده‌نشده + پنل کشویی
 *
 * دو حالت:
 * - shop: هدر تیرهٔ فروشگاه — مهمان با کلیک به نمای ورود می‌رود؛ کاربر واردشده
 *   پنل اعلان‌ها را می‌بیند و لمس اعلان سفارش → نمای جزئیات سفارش
 * - admin: نوار بالای پنل مدیریت — لمس اعلان با مسیر /admin/… → همان مسیر پنل
 *
 * بج قرمز = شمارش اعلان‌های خوانده‌نشده (readAt خالی)؛ باز کردن پنل همه را
 * خوانده‌شده می‌کند اما نقطهٔ قرمز کنار همان اعلان‌ها تا بسته شدن پنل می‌ماند.
 */

export type BellVariant = 'shop' | 'admin';

const TYPE_META: Record<string, { icon: typeof Bell; label: string }> = {
  ORDER_NEW: { icon: ShoppingBag, label: 'سفارش' },
  ORDER_STATUS: { icon: Truck, label: 'وضعیت سفارش' },
  PAYMENT: { icon: Wallet, label: 'پرداخت' },
  CART_NEW: { icon: ShoppingCart, label: 'سبد خرید' },
  BROADCAST: { icon: Megaphone, label: 'اطلاعیه' },
  SYSTEM: { icon: Bell, label: 'سیستم' },
  REVIEW: { icon: MessageSquareText, label: 'نظر' },
};

export function NotificationBell({ variant }: { variant: BellVariant }) {
  const isAdmin = variant === 'admin';
  const user = useAuthStore((s) => s.user);
  const pushView = useRouterStore((s) => s.push);
  const navigate = useNotificationNavigation(!isAdmin);

  const {
    items,
    unread,
    loading,
    open,
    freshIds,
    openPanel,
    closePanel,
    togglePanel,
    markAllRead,
    markOneRead,
    removeOne,
    deletingIds,
  } = useNotificationCenter();

  /** لمس اعلان — خوانده‌شده + مسیریابی بر اساس نوع مقصد */
  const handleItem = (n: CenterNotificationDTO) => {
    if (!n.isRead) void markOneRead(n.id);
    closePanel();
    navigate(n.url);
  };

  const ariaLabel = unread > 0 ? `اعلان‌ها — ${toFaDigits(unread)} خوانده‌نشده` : 'اعلان‌ها';

  return (
    <div className="relative shrink-0">
      {/* —— دکمهٔ زنگوله + دایرهٔ قرمز خوانده‌نشده —— */}
      <button
        type="button"
        onClick={togglePanel}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={ariaLabel}
        className={
          isAdmin
            ? 'relative flex h-9 w-9 items-center justify-center rounded-xl border border-cream-200 text-ink-600 transition-colors hover:bg-cream-100 active:bg-cream-200'
            : 'relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-colors active:bg-white/20'
        }
      >
        <Bell
          className={isAdmin ? 'h-4.5 w-4.5' : 'h-5 w-5'}
          strokeWidth={1.8}
          aria-hidden
        />
        {unread > 0 && (
          <span className="absolute -left-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white ring-2 ring-white">
            {toFaDigits(unread > 9 ? '۹+' : unread)}
          </span>
        )}
      </button>

      {/* —— اورلی تمام‌صفحه: پس‌زمینهٔ بسته‌کننده + پنل مرکز صفحه ——
          پنل قبلاً absolute به خود دکمه چسبیده بود و وقتی زنگوله نزدیک لبهٔ
          چپ (RTL) قرار می‌گرفت، از کادر بیرون می‌زد؛ حالا با flex در مرکز
          صفحه قرار می‌گیرد و در هیچ عرضی سرریز نمی‌کند. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
            onClick={closePanel}
          >
            <motion.div
              key="notif-panel"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              role="dialog"
              aria-label="اعلان‌ها"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[85dvh] w-[min(88vw,21rem)] flex-col overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-float"
            >
            {/* سربرگ پنل */}
            <div className="flex items-center justify-between gap-2 border-b border-cream-100 bg-cream-50/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-brand-500" aria-hidden />
                <p className="text-[13px] font-black text-ink-900">اعلان‌ها</p>
              </div>
              <div className="flex items-center gap-1.5">
                {items.some((i) => !i.isRead) && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="rounded-full px-2 py-1 text-[10px] font-bold text-brand-600 transition-colors hover:bg-brand-50"
                  >
                    خواندن همه
                  </button>
                )}
                <button
                  type="button"
                  onClick={closePanel}
                  aria-label="بستن"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-cream-100"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* —— محتوا —— */}
            {!user ? (
              <GuestPanel onLogin={closePanel} />
            ) : loading && items.length === 0 ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-hidden />
              </div>
            ) : items.length === 0 ? (
              <EmptyPanel />
            ) : (
              <ul
                className="max-h-[340px] min-h-0 flex-1 overflow-y-auto overscroll-contain"
                aria-label="فهرست اعلان‌ها"
              >
                {items.map((n) => {
                  const meta = TYPE_META[n.type] ?? TYPE_META.SYSTEM;
                  const Icon = meta.icon;
                  const isNew = !n.isRead || freshIds.has(n.id);
                  const isCanceled =
                    n.type === 'ORDER_STATUS' && n.title.includes('لغو');
                  return (
                    <li key={n.id} className="flex items-start border-b border-cream-100 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => handleItem(n)}
                        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-cream-50 active:bg-cream-100"
                      >
                        <span
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                            isCanceled ? 'bg-red-50 text-red-500' : 'bg-brand-50 text-brand-600'
                          }`}
                          aria-hidden
                        >
                          <Icon className="h-4.5 w-4.5" strokeWidth={1.9} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5">
                              {isNew && (
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                                  aria-label="خوانده‌نشده"
                                />
                              )}
                              <span className="truncate text-[12.5px] font-extrabold text-ink-900">
                                {n.title}
                              </span>
                            </span>
                            <span className="shrink-0 text-[9.5px] text-ink-400">
                              {timeAgoFa(n.createdAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 block break-words text-[11px] leading-5 text-ink-500">
                            {n.body}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeOne(n.id)}
                        disabled={deletingIds.has(n.id)}
                        aria-label={`حذف اعلان ${n.title}`}
                        title="حذف اعلان"
                        className="me-1 mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-40"
                      >
                        {deletingIds.has(n.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-100 text-ink-300">
        <Bell className="h-6 w-6" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="text-[13px] font-extrabold text-ink-700">هنوز اعلانی ندارید</p>
      <p className="text-[10.5px] leading-5 text-ink-400">
        رویدادهای سفارش و فروشگاه همین‌جا نمایش داده می‌شود
      </p>
    </div>
  );
}

function GuestPanel({ onLogin }: { onLogin: () => void }) {
  const pushView = useRouterStore((s) => s.push);
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        <Bell className="h-6 w-6" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="text-[13px] font-extrabold text-ink-900">
        برای دیدن اعلان‌ها وارد شوید
      </p>
      <p className="text-[10.5px] leading-5 text-ink-500">
        اعلان‌های سفارش شما با زنگوله همین‌جا نمایش داده می‌شود
      </p>
      <button
        type="button"
        onClick={() => {
          onLogin(); // پنل بسته شود تا نمای ورود دیده شود
          pushView({ view: 'login', key: 'login' });
        }}
        className="mt-2 h-10 rounded-2xl bg-brand-500 px-6 text-[12px] font-black text-white transition-transform active:scale-95"
      >
        ورود | ثبت‌نام
      </button>
    </div>
  );
}
