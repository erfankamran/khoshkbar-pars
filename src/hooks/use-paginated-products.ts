'use client';

import { useAuthStore } from '@/stores/auth-store';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, ApiClientError } from '@/lib/api-client';
import type { ProductCardDTO } from '@/server/services/catalog.service';

/**
 * هوک لیست محصولات صفحه‌بندی‌شده (فاز ۷ — صفحه دسته‌بندی)
 *
 * - صفحه ۱ با تعویض دسته/مرتب‌سازی از نو بارگذاری می‌شود (ریست در زمان رندر —
 *   الگوی رسمی React، سازگار با قانون set-state-in-effect)
 * - loadMore: صفحات بعدی به لیست اضافه می‌شوند (الگوی «نمایش بیشتر» موبایل)
 * - abort هنگام unmount + محافظت race: فقط پاسخ درخواستِ فعال accepted می‌شود
 */

export type ProductSort = 'popular' | 'newest' | 'cheap' | 'expensive';

interface ListResponse {
  items: ProductCardDTO[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

interface PaginatedState {
  /** کلید کوئری فعال — برای تشخیص تغییر دسته/مرتب‌سازی در زمان رندر */
  key: string;
  /** شماره تلاش مجدد — تغییر آن لیست را از نو می‌سازد (دکمه «تلاش مجدد») */
  token: number;
  items: ProductCardDTO[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

function buildPath(category: string | undefined, sort: ProductSort, page: number): string {
  const params = new URLSearchParams({ sort, page: String(page), limit: '12' });
  if (category) params.set('category', category);
  return `/api/products?${params.toString()}`;
}

export function usePaginatedProducts(
  category: string | undefined,
  sort: ProductSort
) {
  const identity = useAuthStore((state) => state.user ? `${state.user.id}:${state.user.role}` : 'guest');
  const key = `${category ?? 'all'}|${sort}|${identity}`;

  const [token, setToken] = useState(0);
  const reload = useCallback(() => setToken((t) => t + 1), []);

  const [state, setState] = useState<PaginatedState>(() => ({
    key,
    token: 0,
    items: [],
    total: 0,
    page: 1,
    totalPages: 1,
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: null,
  }));

  // تغییر دسته/مرتب‌سازی یا تلاش مجدد → ریست کامل (پیش از اجرای effect جدید)
  if (state.key !== key || state.token !== token) {
    setState({
      key,
      token,
      items: [],
      total: 0,
      page: 1,
      totalPages: 1,
      hasMore: false,
      loading: true,
      loadingMore: false,
      error: null,
    });
  }

  // ——— بارگذاری صفحه ۱ (با هر تغییر key یا reload) ———
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    apiGet<ListResponse>(buildPath(category, sort, 1), ctrl.signal)
      .then((res) => {
        if (!alive) return;
        setState((s) =>
          s.key !== key || s.token !== token
            ? s
            : {
                ...s,
                items: res.items,
                total: res.total,
                page: 1,
                totalPages: res.totalPages,
                hasMore: res.hasMore,
                loading: false,
                error: null,
              }
        );
      })
      .catch((e: unknown) => {
        if (!alive || ctrl.signal.aborted) return;
        setState((s) =>
          s.key !== key || s.token !== token
            ? s
            : {
                ...s,
                loading: false,
                error:
                  e instanceof ApiClientError
                    ? e.message
                    : 'خطای غیرمنتظره — دوباره تلاش کنید',
              }
        );
      });

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [key, token, category, sort]);

  // ——— بارگذاری صفحه بعدی (رویداد کاربر) ———
  // guard با ref: فراخوانی apiGet هرگز داخل updater انجام نمی‌شود
  // (updater در StrictMode دو بار اجرا می‌شود → درخواست تکراری)
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const busyRef = useRef(false);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (!s.hasMore || s.loadingMore || s.loading || busyRef.current) return;
    busyRef.current = true;

    const nextPage = s.page + 1;
    setState((cur) => (cur.key === key ? { ...cur, loadingMore: true } : cur));

    apiGet<ListResponse>(buildPath(category, sort, nextPage))
      .then((res) => {
        setState((cur) =>
          cur.key !== key
            ? cur
            : {
                ...cur,
                items: [...cur.items, ...res.items],
                page: nextPage,
                totalPages: res.totalPages,
                hasMore: res.hasMore,
                loadingMore: false,
              }
        );
      })
      .catch(() => {
        setState((cur) => ({ ...cur, loadingMore: false }));
      })
      .finally(() => {
        busyRef.current = false;
      });
  }, [category, sort, key]);

  return {
    items: state.items,
    total: state.total,
    hasMore: state.hasMore,
    loading: state.loading,
    loadingMore: state.loadingMore,
    error: state.error,
    loadMore,
    reload,
  };
}
