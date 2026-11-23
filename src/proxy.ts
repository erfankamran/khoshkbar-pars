import { NextResponse, type NextRequest } from 'next/server';

/**
 * گارد تکمیلی مسیرهای پنل مدیریت (فاز ۱۱.۱ — بخش ۱۵ و ۱۶ مشخصات)
 *
 * ⚠️ این فایل «مرز امنیتی» نیست — گیت واقعی، requireAdmin سمت سرور در
 * «هر» endpoint ادمین است (مجوزدهی همیشه در Backend بررسی می‌شود).
 * کار این گارد فقط UX است: کاربر بدون کوکی نشست، پیش از رندر صفحه،
 * به /admin/login هدایت می‌شود تا فلش «بررسی دسترسی…» نبیند.
 *
 * نکته‌ها:
 * - در Next.js 16 فایل middleware.ts به proxy.ts تغییر نام یافته است.
 * - کوکی نامعتبر/غایب → ریدایرکت؛ کوکی «موجود» فقط عبور داده می‌شود و
 *   اعتبار واقعی‌اش در /api/auth/me (داخل AdminShell) سنجیده می‌شود.
 * - مسیر /admin/login مستثناست تا حلقه ریدایرکت رخ ندهد.
 * - فال‌بک هدر x-pars-session اینجا معنا ندارد (مختص fetchهای API است،
 *   نه ناوبری صفحه) — صفحه ادمین فقط با کوکی رندر می‌شود.
 */

const SESSION_COOKIE = 'pars_session';
const SESSION_TOKEN_RE = /^[a-f0-9]{64}$/i;

// ————————————————————————————————————————————————————————————
// گارد CSRF درخواست‌های تغییردهندهٔ API (POST/PUT/PATCH/DELETE)
//
// کوکی نشست/دستگاه روی HTTPS با SameSite=None ست می‌شود تا در iframe
// بین‌سایتی (پیش‌نمایش/PWA embedded) هم همراه درخواست بیاید؛ همین ویژگی
// یعنی کوکی کاربر با هر fetch بین‌سایتی نیز ارسال می‌شود و endpoints فقط
// JSON می‌خوانند اما با Content-Type: text/plain این محدودیت دور زده می‌شود.
// مرورگر روی همهٔ این درخواست‌ها هدر Origin می‌فرستد و مرورگرها اجازهٔ
// جعل آن را نمی‌دهند؛ پس Origin آمده و با هاست سرویس یکی نبود → 403.
// نبودِ Origin (curl / اسکریپت‌های تست / فراخوانی سرور‌به‌سرور) عبور است.
// هاست‌های مجاز: X-Forwarded-Host، Host، هاست خود URL و NEXT_PUBLIC_SITE_URL —
// پشت Caddy/پلتفرم، هاست داخلی (localhost:3000) و عمومی می‌توانند متفاوت باشند.
// استثنای پیش‌نمایش پلتفرم (فقط خارج از production): پروکسی پیش‌نمایش، هاست عمومی
// (preview-chat-….space-z.ai) را در Host/X-Forwarded-Host به Next نمی‌رساند و
// Host داخلی را می‌گذارد؛ پس Origin مرورگر با هیچ هاست مجازی یکی نمی‌شد و همهٔ
// درخواست‌های تغییردهنده با 403 رد می‌شدند. زیردامنه‌های *.space-z.ai و Origin: null
// (iframe سندباکس‌شده) فقط وقتی NODE_ENV=production «نیست» مجاز می‌شوند تا امنیت
// استقرار واقعی دست‌نخورده بماند — در تولید همان لیست هاست‌ها ملاک است.
// ————————————————————————————————————————————————————————————

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function allowedApiHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (value) hosts.add(value.split(',')[0].trim().toLowerCase());
  };
  add(req.headers.get('x-forwarded-host'));
  add(req.headers.get('host'));
  hosts.add(req.nextUrl.host.toLowerCase());
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim();
  if (siteUrl) {
    try {
      hosts.add(new URL(siteUrl).host.toLowerCase());
    } catch {
      // مقدار خراب env — هاست عمومی را نادیده می‌گیریم
    }
  }
  return hosts;
}

// پیش‌نمایش پلتفرم — الگوی زیردامنه (فقط خارج از production اعتبار دارد)
const PREVIEW_ORIGIN_SUFFIX = '.space-z.ai';

function isTrustedApiOriginHost(originHost: string, req: NextRequest): boolean {
  if (allowedApiHosts(req).has(originHost)) return true;
  return (
    process.env.NODE_ENV !== 'production' &&
    originHost.endsWith(PREVIEW_ORIGIN_SUFFIX)
  );
}

function isCrossSiteMutation(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method)) return false;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  if (origin === 'null') {
    // iframe سندباکس‌شده / opaque origin — فقط خارج از production مجاز است
    return process.env.NODE_ENV === 'production';
  }
  try {
    const originHost = new URL(origin).host.toLowerCase();
    return !isTrustedApiOriginHost(originHost, req);
  } catch {
    return true; // Origin بدشکل — رد
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // درخواست تغییردهندهٔ بین‌سایتی → 403 (گارد CSRF — کوکی SameSite=None)
  if (pathname.startsWith('/api/')) {
    if (isCrossSiteMutation(req)) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'درخواست بین‌سایتی مجاز نیست' },
        },
        { status: 403 }
      );
    }
    // بقیهٔ APIها از این گارد عبور می‌کنند — احراز/مجوزشان در خود endpoint است
    // (گارد کوکی زیر فقط مال «صفحات» ادمین است؛ API ادمین خودش ۴۰۱/۴۰۳ می‌دهد)
    return NextResponse.next();
  }

  // صفحه ورود همیشه آزاد است
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !SESSION_TOKEN_RE.test(token)) {
    const loginUrl = new URL('/admin/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // مسیرهای ادمین (صفحات) + همهٔ APIها برای گارد CSRF
  matcher: ['/admin/:path*', '/api/:path*'],
};
