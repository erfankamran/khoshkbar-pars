/**
 * کلاینت HTTP فروشگاه پارس (فاز ۶ · فاز ۱۰ — هویت دستگاه و نشست مقاوم)
 *
 * - پاکت پاسخ سرور: { ok: true, data } | { ok: false, error: { code, message } }
 * - خطاها همیشه با پیام فارسی قابل نمایش به کاربر پرتاب می‌شوند
 * - پشتیبانی AbortSignal برای لغو درخواست هنگام unmount / تعویض نما
 * - timeout پیش‌فرض ۱۲ ثانیه — کاربر موبایل بی‌نهایت منتظر نمی‌ماند
 * - هویت دستگاه (x-pars-device): وقتی مرورگر کوکی pars_device را در iframe
 *   بین‌سایتی یا حالت بلاک کوکی ثالث ارسال نمی‌کند، این هدر (از localStorage)
 *   هویت سبد را حفظ می‌کند — رفع «خالی شدن خودبه‌خودی سبد»
 * - توکن نشست (x-pars-session): کوکی pars_session HttpOnly است و JS آن را
 *   نمی‌بیند؛ در محیطی که کوکی ارسال نمی‌شود (Safari ITP / Chrome 3PCD)،
 *   توکن از بدنهٔ پاسخ verify/me گرفته شده و با این هدر همراه می‌رود —
 *   رفع ۴۰۱ «برای ثبت سفارش وارد حساب شوید» در همان محیط
 */

export class ApiClientError extends Error {
  constructor(
    /** 0 = خطای شبکه (بدون پاسخ سرور) */
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** وضعیت توسعه/دمو — منبع: .env (زمان بیلد درون باندل قفل می‌شود) */
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

/** جزئیات فنی پاکت خطا — فقط وقتی سرور در حالت توسعه باشد پر می‌شود */
interface ErrorEnvelopeDetails {
  technical?: string;
  stack?: string;
}

/**
 * ساخت پیام خطا — در حالت توسعه علت فنی دقیق سرور به پیام اضافه می‌شود تا
 * در همهٔ نمایش‌ها (toast / کارت خطا / فرم‌ها) بدون تغییر در نماها دیده شود.
 * جزئیات کامل (stack) در کنسول مرورگر چاپ می‌شود.
 */
function buildErrorMessage(
  fallback: string,
  err?: { code?: string; message?: string; details?: ErrorEnvelopeDetails }
): string {
  let message = err?.message ?? fallback;
  if (DEV_MODE && err?.details?.technical) {
    message = `${message} — علت فنی: [${err.details.technical}]`;
    console.error('[api] جزئیات فنی خطا:', err.details);
  }
  return message;
}

const DEFAULT_TIMEOUT_MS = 12_000;

// ——— هویت دستگاه (fallback کوکی pars_device) ———
// سرور هویت را ترجیحاً از این هدر می‌خواند؛ اگر درخواست هویت نداشت،
// شناسهٔ جدید در هدر پاسخ برمی‌گردد و اینجا ذخیره می‌شود (Adoption).
const DEVICE_KEY = 'pars:device-id';
const DEVICE_HEADER = 'x-pars-device';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readStoredDeviceId(): string | null {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    return v && UUID_RE.test(v) ? v : null;
  } catch {
    return null; // localStorage در دسترس نیست — به کوکی اتکا می‌کنیم
  }
}

/** Adoption هویت جدید از هدر پاسخ — فقط اگر هنوز هویتی نداریم */
function adoptDeviceId(res: Response): void {
  try {
    if (readStoredDeviceId()) return;
    const id = res.headers.get(DEVICE_HEADER);
    if (id && UUID_RE.test(id)) localStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* بدون localStorage — کوکی تنها هویت است */
  }
}

function deviceHeaders(): Record<string, string> {
  const id = readStoredDeviceId();
  return id ? { [DEVICE_HEADER]: id } : {};
}

// ——— توکن نشست (fallback کوکی pars_session) ———
// سرور در verify/me توکن خام را در بدنه برمی‌گرداند؛ اینجا ذخیره و در هر
// درخواست با هدر x-pars-session فرستاده می‌شود. خروج (auth-store) پاکش می‌کند.
const SESSION_KEY = 'pars:session-token';
const SESSION_HEADER = 'x-pars-session';
const SESSION_TOKEN_RE = /^[a-f0-9]{64}$/i;

export function readStoredSessionToken(): string | null {
  try {
    const v = localStorage.getItem(SESSION_KEY);
    return v && SESSION_TOKEN_RE.test(v) ? v : null;
  } catch {
    return null; // localStorage در دسترس نیست — به کوکی اتکا می‌کنیم
  }
}

/** ذخیره توکن نشست از پاسخ verify/me — فقط مقدار معتبر ۶۴-hex */
export function storeSessionToken(token: string | null | undefined): void {
  if (!token || !SESSION_TOKEN_RE.test(token)) return;
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    /* بدون localStorage — کوکی تنها نشست است */
  }
}

/** پاک‌سازی توکن نشست — هنگام خروج یا مرگ نشست سمت سرور */
export function clearSessionToken(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing */
  }
}

function authHeaders(): Record<string, string> {
  const token = readStoredSessionToken();
  return token ? { [SESSION_HEADER]: token } : {};
}

async function request<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  opts?: { multipart?: boolean; timeoutMs?: number }
): Promise<T> {
  const timeoutCtrl = new AbortController();
  // آپلود فایل به‌صورت پیش‌فرض ۶۰ ثانیه فرصت دارد (فایل تا ۵ مگابایت)
  const timer = setTimeout(() => timeoutCtrl.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal: timeoutCtrl.signal,
      headers: {
        Accept: 'application/json',
        ...deviceHeaders(),
        ...authHeaders(),
        // multipart — مرورگر باید Content-Type با boundary را خودش بگذارد
        ...(body !== undefined && !opts?.multipart
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      body: body === undefined ? undefined : opts?.multipart ? (body as FormData) : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (e) {
    throw new ApiClientError(
      0,
      'NETWORK',
      DEV_MODE
        ? `اتصال برقرار نشد — اینترنت را بررسی کنید — علت فنی: [${String(e)}]`
        : 'اتصال برقرار نشد — اینترنت را بررسی کنید'
    );
  } finally {
    clearTimeout(timer);
  }
  adoptDeviceId(res);

  const resBody: unknown = await res.json().catch(() => null);

  if (!res.ok || !resBody || (resBody as { ok?: boolean }).ok !== true) {
    const err = (
      resBody as { error?: { code?: string; message?: string; details?: ErrorEnvelopeDetails } } | null
    )?.error;
    throw new ApiClientError(res.status, err?.code ?? 'UNKNOWN', buildErrorMessage('انجام درخواست ناموفق بود', err));
  }

  return (resBody as { data: T }).data;
}

/** درخواست POST با پاکت استاندارد پارس */
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

/** آپلود multipart/form-data (فاز ۲) — بدون Content-Type دستی، تا ۶۰ ثانیه */
export function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return request<T>('POST', path, form, { multipart: true, timeoutMs: 60_000 });
}

/** درخواست PUT با پاکت استاندارد پارس */
export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

/** درخواست PATCH با پاکت استاندارد پارس */
export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

/** درخواست DELETE با پاکت استاندارد پارس */
export function apiDelete<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  // ترکیب signal بیرونی با timeout داخلی
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), DEFAULT_TIMEOUT_MS);
  const onOuterAbort = () => timeoutCtrl.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  let res: Response;
  try {
    res = await fetch(path, {
      signal: timeoutCtrl.signal,
      headers: { Accept: 'application/json', ...deviceHeaders(), ...authHeaders() },
      cache: 'no-store',
    });
  } catch (e) {
    // چه Abort بیرونی باشد چه قطع شبکه — تمایز برای UI مهم نیست؛
    // caller با alive-flag تمایز را انجام می‌دهد
    throw new ApiClientError(
      0,
      'NETWORK',
      DEV_MODE
        ? `اتصال برقرار نشد — اینترنت را بررسی کنید — علت فنی: [${String(e)}]`
        : 'اتصال برقرار نشد — اینترنت را بررسی کنید'
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
  adoptDeviceId(res);

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok || !body || (body as { ok?: boolean }).ok !== true) {
    const err = (
      body as { error?: { code?: string; message?: string; details?: ErrorEnvelopeDetails } } | null
    )?.error;
    throw new ApiClientError(res.status, err?.code ?? 'UNKNOWN', buildErrorMessage('دریافت اطلاعات ناموفق بود', err));
  }

  return (body as { data: T }).data;
}
