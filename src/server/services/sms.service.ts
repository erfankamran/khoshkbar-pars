import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';

/**
 * سرویس ارسال پیامک — ملی‌پیامک (درخواست کاربر)
 *
 * مکانیزم طبق مستندات رسمی ملی‌پیامک (melipayamak.com/api):
 *  - REST endpoint:  POST https://rest.payamak-panel.com/api/SendSMS/SendSMS
 *  - بدنه: form-urlencoded  →  username, password, to, from, text, isFlash
 *  - پاسخ JSON: { Value, RetStatus, StrRetStatus } — RetStatus=1 موفق
 *    (Value = شناسه پیام recId؛ در خطا عدد خطا)
 *
 * پیکربندی از دو منبع (درخواست کاربر — قابل مدیریت از env):
 *  ۱) env (اولویت دارد): SMS_PROVIDER + SMS_USERNAME + SMS_PASSWORD + SMS_SENDER
 *     — فقط وقتی هر چهار مقدار کامل باشد مؤثر است و مقادیر پنل را نادیده می‌گیرد
 *     (مصلحت استقرار Docker/Coolify: رمز بیرون از دیتابیس و backupها می‌ماند)
 *  ۲) جدول Setting (کلیدهای sms.*) — از پنل مدیریت:
 *  - sms.provider                 '' | 'melipayamak'
 *  - sms.melipayamak.username     نام کاربری پنل
 *  - sms.melipayamak.password     رمز وب‌سروس (محرمانه — هرگز عمومی نمی‌شود)
 *  - sms.melipayamak.sender       شماره خط ارسال‌کننده (مثل 50004000xxxxx)
 *
 * امنیت: رمز (از هر منبعی) در پاسخ API عمومی (/api/settings) هرگز نمی‌رود
 * (whitelist) و در پاسخ ادمین هم مقدارش نمایش داده نمی‌شود؛ فقط فلگ
 * بی‌خطر «smsEnvManaged» از پنل خوانده می‌شود.
 * خطای شبکه/پیکربندی هرگز کد را لو نمی‌دهد — فقط پیام خطای فارسی.
 */

/** کلیدهای پیکربندی SMS در جدول Setting */
export const SMS_KEYS = {
  provider: 'sms.provider',
  username: 'sms.melipayamak.username',
  password: 'sms.melipayamak.password',
  sender: 'sms.melipayamak.sender',
} as const;

/** نام متغیرهای env پیامک — تک‌منبع حقیقت خواندن از محیط */
const SMS_ENV = {
  provider: 'SMS_PROVIDER',
  username: 'SMS_USERNAME',
  password: 'SMS_PASSWORD',
  sender: 'SMS_SENDER',
} as const;

const MELIPAYAMAK_SEND_URL = 'https://rest.payamak-panel.com/api/SendSMS/SendSMS';
/** سقف زمان انتظار پاسخ ملی‌پیامک */
const SEND_TIMEOUT_MS = 12_000;

export interface SmsConfig {
  username: string;
  password: string;
  sender: string;
}

/**
 * پیکربندی SMS از env — فقط وقتی هر چهار مقدار کامل و معتبر باشد برمی‌گرداند
 * (پیکربندی ناقص env یعنی «از env استفاده نشود» و مسیر پنل ادامه می‌یابد)
 */
function envSmsConfig(): SmsConfig | null {
  const provider = (process.env[SMS_ENV.provider] ?? '').trim().toLowerCase();
  const username = (process.env[SMS_ENV.username] ?? '').trim();
  const password = (process.env[SMS_ENV.password] ?? '').trim();
  const sender = (process.env[SMS_ENV.sender] ?? '').trim();
  if (provider !== 'melipayamak' || !username || !password || !sender) return null;
  return { username, password, sender };
}

/**
 * آیا پیامک از env مدیریت می‌شود؟ — برای نمایش وضعیت در پنل ادمین
 * (بدون افشای مقادیر؛ فقط true/false)
 */
export function isSmsEnvManaged(): boolean {
  return envSmsConfig() !== null;
}

/**
 * خواندن پیکربندی SMS — env کامل مقدم بر پنل، در غیر این‌صورت جدول Setting.
 * provider خالی/پیکربندی‌ناقص یعنی ارسال واقعی خاموش است (حالت sandbox)
 */
export async function getSmsConfig(): Promise<SmsConfig | null> {
  const fromEnv = envSmsConfig();
  if (fromEnv) return fromEnv;

  const rows = await db.setting.findMany({
    where: {
      key: {
        in: [SMS_KEYS.provider, SMS_KEYS.username, SMS_KEYS.password, SMS_KEYS.sender],
      },
    },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const provider = (map.get(SMS_KEYS.provider) ?? '').trim();
  const username = (map.get(SMS_KEYS.username) ?? '').trim();
  const password = (map.get(SMS_KEYS.password) ?? '').trim();
  const sender = (map.get(SMS_KEYS.sender) ?? '').trim();

  if (provider !== 'melipayamak' || !username || !password || !sender) return null;
  return { username, password, sender };
}

/** آیا ارسال واقعی پیامک پیکربندی شده است؟ */
export async function isSmsConfigured(): Promise<boolean> {
  return (await getSmsConfig()) !== null;
}

export interface SendSmsResult {
  ok: boolean;
  /** شناسه پیام در ملی‌پیامک — فقط در موفقیت */
  recId?: string;
  /** پیام خطای خوانا در شکست */
  error?: string;
}

/**
 * ارسال پیامک متنی با REST ملی‌پیامک — طبق مستندات رسمی.
 * هر خطای شبکه/اعتبار → ok:false با پیام فارسی (هرگز throw نمی‌کند تا
 * مسیر OTP کنترل‌شده خطا بدهد)
 */
export async function sendSms(to: string, text: string): Promise<SendSmsResult> {
  const config = await getSmsConfig();
  if (!config) {
    return { ok: false, error: 'سرویس پیامک پیکربندی نشده است' };
  }

  // شماره گیرنده: نرمال‌سازی به شکل پذیرفته‌شده پنل (۰۹…)
  const normalizedTo = to.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d+]/g, '');

  try {
    const body = new URLSearchParams({
      username: config.username,
      password: config.password,
      to: normalizedTo,
      from: config.sender,
      text,
      isFlash: 'false',
    });

    const res = await fetch(MELIPAYAMAK_SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        charset: 'utf-8',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `پاسخ نامعتبر سرویس پیامک (کد ${res.status})`,
      };
    }

    // پاسخ طبق مستندات: { Value, RetStatus, StrRetStatus }
    const payload = (await res.json()) as {
      Value?: string | number;
      RetStatus?: string | number;
      StrRetStatus?: string;
    };
    const retStatus = Number(payload.RetStatus ?? -1);
    const value = String(payload.Value ?? '');

    // RetStatus=1 → RetStatusSuccess و Value = recId پیام
    if (retStatus === 1) {
      return { ok: true, recId: value };
    }
    return {
      ok: false,
      error: `سرویس پیامک ارسال را نپذیرفت (کد ${retStatus}) — نام کاربری/رمز/خط ارسال را در پنل ملی‌پیامک بررسی کنید`,
    };
  } catch (err) {
    const detail =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'پاسخ سرویس پیامک بیش از حد طول کشید'
        : 'ارتباط با سرویس پیامک ناموفق بود';
    return { ok: false, error: detail };
  }
}

/** متن کد تایید — کوتاه و بدون لینک (الگوی پیشنهادی برای OTP) */
export function otpSmsText(code: string, brandName: string): string {
  return `کد تایید ${brandName}: ${code}`;
}

/**
 * ارسال کد تایید OTP — وقتی پیامک پیکربندی نشده باشد ok:false برمی‌گرداند
 * (مصرف‌کننده یعنی requestOtp مسیر sandbox خودش را ادامه می‌دهد)
 */
export async function sendOtpSms(
  to: string,
  code: string,
  brandName = 'فروشگاه پارس'
): Promise<SendSmsResult> {
  return sendSms(to, otpSmsText(code, brandName));
}

/**
 * ارسال پیامک آزمایشی از پنل — بدون فال‌بک؛ خطا → ApiError خوانا
 * (در بخش تنظیمات برای اطمینان از صحت نام کاربری/رمز/خط)
 */
export async function sendTestSms(to: string): Promise<string> {
  const config = await getSmsConfig();
  if (!config) {
    throw new ApiError(400, 'VALIDATION', 'ابتدا سرویس را فعال و مشخصات را کامل کنید');
  }
  const result = await sendSms(to, 'پیامک آزمایشی فروشگاه پارس — اتصال به ملی‌پیامک سالم است ✅');
  if (!result.ok) {
    throw new ApiError(502, 'SMS_SEND_FAILED', result.error ?? 'ارسال ناموفق بود');
  }
  return result.recId ?? '';
}
