import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';

/**
 * زیرساخت WebAuthn / Passkey (فاز احراز هویت مدرن)
 *
 * - RP ID و Origin از خود درخواست استخراج می‌شود (x-forwarded-host / host +
 *   x-forwarded-proto) — بدون env ثابت؛ همان روش site.ts برای URL مطلق
 * - Challenge: تصادفی، یک‌بارمصرف و دارای انقضای ۵ دقیقه — در دیتابیس ذخیره
 *   می‌شود (جدول WebAuthnChallenge) تا بین routeهای جدا و فرآیندها مشترک باشد؛
 *   مصرف هنگام verify با consumedAt ثبت می‌شود → Replay با همان challenge رد است
 * - قانون امنیتی: Challenge ثبت به کاربرِ احرازشده قفل می‌شود؛ challenge ورود
 *   هویت کاربر را با credentialId/userHandle تعیین می‌کند
 */

/** پاک‌سازی میزبان — حروف کوچک، حذف نقطه پایانی */
function cleanHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

/** RP ID از هدرهای درخواست — بدون هیچ پورتی (rp.id هرگز پورت ندارد؛
 * وجود پورت در rp.id مرورگر را در credentials.create() شکست می‌دهد) */
export function rpIDFromRequest(req: NextRequest): string {
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    req.headers.get('host')?.trim() ||
    'localhost';
  return cleanHost(host).replace(/:\d+$/, '');
}

/**
 * کاندیدهای Origin موردانتظار — آرایه تا تفاوت‌های بی‌ضرر گیت‌وی شکست نیاورد:
 *  - پورت پیش‌فرض (:443/:80) در x-forwarded-host → مرورگر در origin پورت نمی‌گذارد
 *  - x-forwarded-proto گاهی فهرست است («https,http») یا غایب
 *  - مرورگر ممکن است با http به سرور https برسد (پروکسی داخلی)
 * امنیت: لنگر اصلی RP ID است که خود مرورگر روی origin واقعی اعمال می‌کند —
 * پذیرش هر کاندید فقط به معنای «همان میزبان، قالب متفاوت» است.
 */
export function expectedOriginsFromRequest(req: NextRequest): string[] {
  const rawHost = cleanHost(
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
      req.headers.get('host')?.trim() ||
      'localhost:3000'
  );
  // پورت‌های غیرپیش‌فرض (مثل :3000) در origin معتبر می‌مانند؛ فقط :443/:80 حذف
  // می‌شوند چون مرورگر آن‌ها را در origin نمی‌نویسد
  const hosts = Array.from(
    new Set([rawHost, rawHost.replace(/:(443|80)$/, '')])
  ).filter(Boolean);

  const protoHeader = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protos = protoHeader
    ? Array.from(new Set([protoHeader.toLowerCase()]))
    : [process.env.NODE_ENV === 'production' ? 'https' : 'http'];

  const origins = new Set<string>();
  for (const h of hosts) {
    for (const p of protos) {
      origins.add(`${p}://${h}`);
    }
  }
  return [...origins];
}

/**
 * آیا origin گزارش‌شدهٔ خودِ مرورگر (clientDataJSON.origin) به RP تعلق دارد؟
 * مرورگر پیش از امضا rp.id را روی همین origin اعمال کرده — پس اگر دامنهٔ
 * origin خود rp یا زیردامنهٔ آن باشد، پذیرش آن امن است و گیت‌وی‌هایی که
 * هدرهای forwarded را بازنویسی می‌کنند جریان را نمی‌شکنند.
 */
export function clientDataOriginAllowed(clientOrigin: string, rpID: string): boolean {
  try {
    const { hostname } = new URL(clientOrigin);
    const host = hostname.toLowerCase().replace(/\.$/, '');
    return host === rpID || host.endsWith(`.${rpID}`);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// مخزن Challenge یک‌بارمصرف — پایدار در دیتابیس (WebAuthnChallenge)
// ------------------------------------------------------------

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function randomChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

/**
 * ذخیرهٔ challenge (ساخته‌شده توسط کتابخانهٔ WebAuthn) در دیتابیس با انقضای ۵ دقیقه
 * نکته: @simplewebauthn خودش challenge تصادفی می‌سازد و رشتهٔ ورودی را UTF8
 * رمز می‌کند — پس challenge برگشتهٔ options را ذخیره می‌کنیم، نه مقدار دستی
 * Expected queries: ۲ (پاکسازی + درج)
 */
export async function storeChallenge(challenge: string, userId?: string): Promise<void> {
  // چالش‌های منقضی پاک می‌شوند — خطا مسیر اصلی را نمی‌شکند
  await db.webAuthnChallenge
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => undefined);
  await db.webAuthnChallenge.create({
    data: {
      challenge,
      userId: userId ?? null,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

export interface ConsumedChallenge {
  /** challenge ثبت‌شده — مصرف‌کننده باید این را به expectedChallenge بدهد */
  challenge: string;
  /** شناسهٔ کاربرِ قفل‌شده به challenge (مسیر ثبت) */
  userId?: string;
}

/**
 * مصرف یک‌بارمصرف challenge — نیست/منقضی/قبلاً مصرف‌شده → ۴۰۰.
 * مصرف موفق = ثبت consumedAt (Replay دوم → یافت نمی‌شود)
 * Expected queries: ۲ (خواندن ۱ + ثبت مصرف ۱)
 */
export async function consumeChallenge(challenge: string): Promise<ConsumedChallenge> {
  const rec = await db.webAuthnChallenge.findUnique({
    where: { challenge },
    select: { userId: true, expiresAt: true, consumedAt: true },
  });
  if (!rec || rec.consumedAt || rec.expiresAt.getTime() < Date.now()) {
    // رکوردهای منقضیِ آماده پاکسازی — خطای اصلی بدون وابستگی به پاکسازی
    await db.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
    throw new ApiError(
      400,
      'VALIDATION',
      'challenge نامعتبر است — منقضی شده یا قبلاً مصرف شده است'
    );
  }
  await db.webAuthnChallenge
    .update({ where: { challenge }, data: { consumedAt: new Date() } })
    .catch(() => undefined);
  return { challenge, userId: rec.userId ?? undefined };
}

/** آیا challenge متعلق به کاربر دیگری است؟ (جلوگیری از جابه‌جایی هویت) */
export function challengeBelongsTo(consumed: ConsumedChallenge, userId: string): boolean {
  return consumed.userId === userId;
}

/** نام دستگاه خوانا از user-agent — تنها دادهٔ دستگاهی که ذخیره می‌شود */
export function friendlyDeviceName(userAgent?: string): string {
  if (!userAgent) return 'دستگاه ناشناس';
  const ua = userAgent;
  const os = ua.includes('iPhone')
    ? 'آیفون'
    : ua.includes('iPad')
      ? 'آیپد'
      : ua.includes('Android')
        ? 'اندروید'
        : ua.includes('Windows')
          ? 'ویندوز'
          : ua.includes('Mac OS')
            ? 'مک'
            : ua.includes('Linux')
              ? 'لینوکس'
              : 'دستگاه';
  const browser = ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('Chrome/') && !ua.includes('Chromium')
      ? 'کروم'
      : ua.includes('Firefox/')
        ? 'فایرفاکس'
        : ua.includes('Safari/') && !ua.includes('Chrome')
          ? 'سافاری'
          : 'مرورگر';
  return `${os} — ${browser}`;
}
