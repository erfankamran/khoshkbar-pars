'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '@/lib/api-client';
import { toast } from 'sonner';
import { toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import { useAuthStore } from '@/stores/auth-store';
import type {
  CenterNotificationDTO,
  NotificationCenterDTO,
} from '@/server/services/notification-center.service';

/**
 * مرکز اعلان‌ها — هوک مشترک زنگولهٔ فروشگاه و پنل مدیریت
 *
 * رفتار:
 * - Polling هر ۲۵ ثانیه + refresh روی بازگشت به تب و فوکوس پنجره — بدون
 *   WebSocket؛ ساده، مقاوم و بدون اتصال باز
 * - باز کردن پنل = علامت‌گذاری همه به‌عنوان خوانده‌شده (بج قرمز فوراً پاک
 *   می‌شود) اما شناسهٔ همان‌ها در freshIds می‌ماند تا نقطهٔ قرمز داخل پنل تا
 *   بسته شدن نمایش داده شود — کاربر می‌فهمد کدام‌ها تازه بوده‌اند
 * - خطاهای Polling بی‌صدا نادیده گرفته می‌شوند (زنگوله هرگز UI را مزاحم نکند)
 * - مهمان: بدون درخواست — unread صفر و پنل دعوت به ورود (کامپوننت تصمیم می‌گیرد)
 */

const POLL_MS = 25_000;

export interface UseNotificationCenterResult {
  items: CenterNotificationDTO[];
  unread: number;
  loading: boolean;
  error: string | null;
  open: boolean;
  /** اعلان‌هایی که هنگام باز شدن پنل خوانده‌نشده بودند (نقطهٔ قرمز داخل پنل) */
  freshIds: ReadonlySet<string>;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  markAllRead: () => Promise<void>;
  markOneRead: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  removeOne: (id: string) => Promise<void>;
  deletingIds: ReadonlySet<string>;
}

export function useNotificationCenter(): UseNotificationCenterResult {
  const user = useAuthStore((s) => s.user);

  const [items, setItems] = useState<CenterNotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());

  const inFlight = useRef(false);
  const deletedIds = useRef(new Set<string>());
  const pendingDeletes = useRef(new Set<string>());
  const revision = useRef(0);
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const requestedRevision = revision.current;
    try {
      const data = await apiGet<NotificationCenterDTO>('/api/notifications');
      setItems(data.items.filter((item) => !deletedIds.current.has(item.id)));
      if (requestedRevision === revision.current) setUnread(data.unread);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'اعلان‌ها بارگذاری نشد');
      // خطای شبکه/Polling — زنگوله بی‌صدا ادامه می‌دهد
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onDeleted = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; unread: number }>).detail;
      deletedIds.current.add(detail.id);
      revision.current += 1;
      setItems((prev) => prev.filter((item) => item.id !== detail.id));
      setUnread(detail.unread);
      setFreshIds((prev) => new Set([...prev].filter((id) => id !== detail.id)));
    };
    window.addEventListener('pars:notification-deleted', onDeleted);
    return () => window.removeEventListener('pars:notification-deleted', onDeleted);
  }, []);

  // ——— بارگذاری اولیه + Polling + فوکوس/visibility — فقط برای کاربر واردشده ———
  useEffect(() => {
    if (!user) {
      // پنل مدیریت AppShell را سوار نمی‌کند و auth-store را hydrate نمی‌کند —
      // اینجا خودکار hydrate می‌کنیم تا زنگولهٔ ادمین هم کاربر را ببیند؛
      // پس از رسیدن پاسخ، user تغییر می‌کند و همین effect دوباره اجرا می‌شود
      const auth = useAuthStore.getState();
      if (!auth.hydrated) {
        void auth.hydrate();
        return;
      }
      // خروج کاربر → صندوق خالی و بج پاک
      setItems([]);
      setUnread(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    void refresh();

    const timer = setInterval(() => void refresh(), POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onFocus = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, refresh]);

  // ——— بستن پنل با Esc (دسترس‌پذیری کیبورد) ———
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openPanel = useCallback(() => {
    setOpen(true);
    if (!user) return; // مهمان — فقط پنل دعوت به ورود؛ بدون درخواست
    // ثبت «تازه‌ها» پیش از پاک‌شدن بج — نقطهٔ قرمز داخل پنل تا بسته شدن می‌ماند
    setFreshIds(new Set());
    if (unread > 0) {
      setFreshIds(new Set(items.filter((i) => !i.isRead).map((i) => i.id)));
      // بهینه‌گرا: بج فوراً صفر؛ سرور در پس‌زمینه تأیید می‌کند
      setUnread(0);
      void apiPost<{ updated: number; unread: number }>('/api/notifications/read', {
        all: true,
      })
        .then((r) => setUnread(r.unread))
        .catch(() => undefined);
    }
    void refresh(); // تازه‌ترین‌ها هنگام باز شدن
  }, [user, items, unread, refresh]);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  const togglePanel = useCallback(() => {
    if (open) closePanel();
    else openPanel();
  }, [open, closePanel, openPanel]);

  const markAllRead = useCallback(async () => {
    try {
      const r = await apiPost<{ updated: number; unread: number }>(
        '/api/notifications/read',
        { all: true }
      );
      setUnread(r.unread);
      setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
      setFreshIds(new Set());
    } catch {
      // بی‌صدا — تلاش بعدی Polling همگام می‌کند
    }
  }, []);

  const markOneRead = useCallback(async (id: string) => {
    try {
      const r = await apiPost<{ updated: number; unread: number }>(
        '/api/notifications/read',
        { id }
      );
      setUnread(r.unread);
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, isRead: true } : i))
      );
      setFreshIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      // بی‌صدا
    }
  }, []);

  const removeOne = useCallback(async (id: string) => {
    if (pendingDeletes.current.has(id)) return;
    pendingDeletes.current.add(id);
    setDeletingIds(new Set(pendingDeletes.current));
    try {
      const result = await apiDelete<{ deleted: number; unread: number }>(
        `/api/notifications/${encodeURIComponent(id)}`
      );
      window.dispatchEvent(new CustomEvent('pars:notification-deleted', {
        detail: { id, unread: result.unread },
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حذف اعلان انجام نشد؛ دوباره تلاش کنید');
    } finally {
      pendingDeletes.current.delete(id);
      setDeletingIds(new Set(pendingDeletes.current));
    }
  }, []);

  return {
    items,
    unread,
    loading,
    error,
    open,
    freshIds,
    openPanel,
    closePanel,
    togglePanel,
    markAllRead,
    markOneRead,
    refresh,
    removeOne,
    deletingIds,
  };
}

// ------------------------------------------------------------
// زمان نسبی فارسی — «۵ دقیقه پیش»؛ قدیمی‌ها با تاریخ جلالی
// ------------------------------------------------------------

export function timeAgoFa(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'همین حالا';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'همین حالا';
  if (minutes < 60) return `${toFaDigits(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toFaDigits(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${toFaDigits(days)} روز پیش`;
  return formatJalaliDate(iso);
}
