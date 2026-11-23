'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

/** وضعیت توسعه/دمو — منبع: .env (زمان بیلد درون باندل قفل می‌شود) */
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

/**
 * هوک دریافت داده از API پارس (فاز ۶)
 *
 * - abort هنگام unmount یا تغییر مسیر (بدون setState روی کامپوننت مرده)
 * - محافظت race: فقط پاسخ آخرین درخواست accepted می‌شود
 * - reload: تلاش مجدد دستی (دکمه «تلاش مجدد» حالت خطا)
 * - path = null → درخواست زده نمی‌شود (برای نماهای شرطی)
 *
 * الگوی state: snapshot همراه با path — ریست هنگام تغییر path با
 * setState در زمان رندر (الگوی رسمی React برای state مشتق از prop) تا
 * قانون set-state-in-effect رعایت شود.
 */
export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface ApiSnapshot<T> {
  path: string | null;
  data: T | null;
  loading: boolean;
  error: string | null;
  identity: string;
}

export function useApi<T>(path: string | null): UseApiResult<T> {
  const identity = useAuthStore((state) => state.user ? `${state.user.id}:${state.user.role}` : 'guest');
  const [snap, setSnap] = useState<ApiSnapshot<T>>(() => ({
    path,
    identity,
    data: null,
    loading: !!path,
    error: null,
  }));
  const [tick, setTick] = useState(0);

  // تغییر مسیر → ریست کامل وضعیت (قبل از شروع effect جدید)
  if (snap.path !== path || snap.identity !== identity) {
    setSnap({ path, identity, data: null, loading: !!path, error: null });
  }

  useEffect(() => {
    if (!path) return;

    let alive = true;
    const ctrl = new AbortController();

    apiGet<T>(path, ctrl.signal)
      .then((result) => {
        if (!alive) return;
        setSnap({ path, identity, data: result, loading: false, error: null });
      })
      .catch((e: unknown) => {
        // پاسخ درخواست لغوشده قدیمی — بی‌صدا نادیده (محافظت race)
        if (!alive || ctrl.signal.aborted) return;
        setSnap({
          path,
          identity,
          data: null,
          loading: false,
          // حالت توسعه: علت فنی واقعی هر خطا؛ حالت عادی: پیام کاربرپسند
          error:
            e instanceof ApiClientError
              ? e.message
              : DEV_MODE
                ? `خطای غیرمنتظره — علت فنی: [${String(e)}]`
                : 'خطای غیرمنتظره — دوباره تلاش کنید',
        });
      });

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [path, tick, identity]);

  const reload = useCallback(() => {
    setTick((t) => t + 1);
    setSnap((s) => ({ ...s, loading: true, error: null }));
  }, []);

  return { data: snap.data, loading: snap.loading, error: snap.error, reload };
}
