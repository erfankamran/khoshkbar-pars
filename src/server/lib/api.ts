import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';

/**
 * زیرساخت یکسان پاسخ‌های API پارس (فاز ۵)
 *
 * پاکت پاسخ:
 *   موفق:  { ok: true,  data: ... }
 *   خطا:   { ok: false, error: { code, message, details? } }
 *
 * کدهای خطای استاندارد: VALIDATION | NOT_FOUND | INTERNAL
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static notFound(message = 'یافت نشد') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
}

export function ok<T>(data: T, headers?: Record<string, string>) {
  return NextResponse.json({ ok: true, data }, { headers });
}

export function fail(
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

/** وضعیت توسعه/دمو — منبع: .env (زمان بیلد درون باندل قفل می‌شود) */
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

/** تبدیل هر خطای پرتاب‌شده به پاسخ استاندارد — Route ها فقط try/catch با این تابع */
export function handleError(e: unknown) {
  if (e instanceof ApiError) return fail(e.status, e.code, e.message);
  if (e instanceof ZodError) {
    return fail(400, 'VALIDATION', 'پارامترهای درخواست نامعتبر است', e.issues);
  }
  // جزئیات خطای داخلی در حالت عادی هرگز به کلاینت نشت نمی‌کند (بخش ۱۵ امنیت)
  console.error('[api] INTERNAL:', e);
  // حالت توسعه (NEXT_PUBLIC_DEV_MODE=true در .env): علت فنی دقیق + چند خط
  // اول stack به کلاینت می‌رود تا توسعه‌دهنده بی‌واسطه مشکل را ببیند
  if (DEV_MODE && e instanceof Error) {
    return fail(500, 'INTERNAL', 'خطای غیرمنتظره سرور', {
      technical: e.message,
      stack: (e.stack ?? '')
        .split('\n')
        .slice(0, 4)
        .map((line) => line.trim())
        .join('\n'),
    });
  }
  return fail(500, 'INTERNAL', 'خطای غیرمنتظره سرور');
}

/** اعتبارسنجی Query Params با zod — ورودی نامعتبر → 400 با جزئیات */
export function parseQuery<S extends ZodType>(
  schema: S,
  searchParams: URLSearchParams
): S['_output'] {
  const raw = Object.fromEntries(searchParams.entries());
  return schema.parse(raw);
}

/**
 * خواندن امن بدنه JSON — بدنه خراب/غیرJSON → 400 VALIDATION (نه 500 INTERNAL).
 * کلاینت خراب نباید در لاگ «خطای سرور» تولید کند؛ خطای کلاینت است.
 */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, 'VALIDATION', 'بدنه درخواست JSON معتبر نیست');
  }
}
