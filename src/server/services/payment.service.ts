import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';

/**
 * سرویس پرداخت آنلاین (فاز ۱۶) — درگاه زیبال
 *
 * مستندات رسمی (docs.zibal.ir + پلاگین رسمی github.com/zibalco):
 *  - POST https://gateway.zibal.ir/v1/request
 *      بدنه: { merchant, amount, callbackUrl, orderId?, description?, mobile? }
 *      پاسخ: { trackId, result, message } — result=100 موفق
 *      ⚠️ amount بر حسب «ریال» است — تومان × ۱۰
 *  - شروع پرداخت: https://gateway.zibal.ir/start/{trackId}
 *  - بازگشت از درگاه به callbackUrl با ?trackId=&success=1|0&status=&orderId=
 *  - POST https://gateway.zibal.ir/v1/verify
 *      بدنه: { merchant, trackId }
 *      پاسخ: { paidAt, amount, result, status, refNumber, orderId, cardNumber, message }
 *      result: 100 = تأییدشده، 201 = قبلاً تأییدشده، 202 = هنوز پرداخت نشده
 *      status: 1 = پرداخت‌شده-تأییدشده، 2 = پرداخت‌شده-تأییدنشده، 3 = لغو کاربر، ...
 *  - مرچنت تست بدون نیاز به ثبت‌نام: "zibal"
 *
 * قواعد امنیتی:
 *  - وضعیت پرداخت فقط بر اساس پاسخ v1/verify سمت سرور تغییر می‌کند؛
 *    پارامتر success کوئری بازگشت هرگز ملاک نیست (جعل‌پذیر است)
 *  - مبلغ verify با مبلغ سفارش (تومان×۱۰) مقایسه می‌شود — عدم تطابق = شکست
 *  - SANDBOX هیچ تماس شبکه‌ای ندارد (رفتار فازهای قبل حفظ می‌شود)
 */

const ZIBAL_BASE = 'https://gateway.zibal.ir';
const REQUEST_TIMEOUT_MS = 15_000;

export type GatewayProvider = 'SANDBOX' | 'ZARINPAL' | 'IDPAY' | 'ZIBAL';

export interface PaymentConfig {
  provider: GatewayProvider;
  merchant: string;
  /** true = درگاه واقعی (تماس شبکه‌ای)؛ false = شبیه‌سازی بدون پول */
  real: boolean;
}

export interface ZibalRequestResult {
  trackId: string;
  startUrl: string;
}

export interface ZibalVerifyResult {
  verified: boolean;
  /** کد result و status خام درگاه — برای نمایش و لاگ */
  result: number;
  status: number;
  refNumber: string | null;
  paidAt: string | null;
  cardNumber: string | null;
  /** مبلغ برگشتی درگاه (ریال) */
  amountRial: number | null;
  message: string;
}

export class PaymentGatewayError extends ApiError {
  constructor(message: string) {
    super(502, 'PAYMENT_GATEWAY_ERROR', message);
  }
}

/** خواندن پیکربندی درگاه از تنظیمات — Expected queries: ۱ */
export async function getPaymentConfig(): Promise<PaymentConfig> {
  const rows = await db.setting.findMany({
    where: { key: { in: ['gatewayProvider', 'gatewayMerchantId'] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const provider = ((map.get('gatewayProvider') ?? 'SANDBOX').trim().toUpperCase() ||
    'SANDBOX') as GatewayProvider;
  const merchant = (map.get('gatewayMerchantId') ?? '').trim();
  return { provider, merchant, real: provider !== 'SANDBOX' };
}

/** آدرس مطلق صفحه بازگشت — ترجیحاً از NEXT_PUBLIC_SITE_URL وگرنه origin درخواست */
export function paymentCallbackUrl(origin: string, orderCode: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/$/, '') || origin;
  return `${base}/payment/callback?order=${encodeURIComponent(orderCode)}`;
}

// ------------------------------------------------------------
// کلاینت HTTP زیبال
// ------------------------------------------------------------

interface ZibalResponse {
  result: number;
  message?: string;
  trackId?: number | string;
  status?: number;
  refNumber?: number | string;
  paidAt?: string;
  cardNumber?: string;
  amount?: number;
}

async function postToZibal(path: string, body: unknown): Promise<ZibalResponse> {
  let res: Response;
  try {
    res = await fetch(`${ZIBAL_BASE}/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new PaymentGatewayError(
      'ارتباط با درگاه پرداخت زیبال برقرار نشد — چند لحظه بعد دوباره تلاش کنید'
    );
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    throw new PaymentGatewayError('پاسخ نامعتبر از درگاه زیبال');
  }
  if (!json || typeof json !== 'object' || typeof (json as ZibalResponse).result !== 'number') {
    throw new PaymentGatewayError('پاسخ نامعتبر از درگاه زیبال');
  }
  return json as ZibalResponse;
}

/**
 * ایجاد درخواست پرداخت زیبال برای سفارش — قبل از ایجاد سفارش صدا زده می‌شود
 * تا سفارشِ بدون نشست پرداخت ساخته نشود. amount → ریال (تومان × ۱۰).
 */
export async function requestZibalPayment(params: {
  merchant: string;
  orderCode: string;
  totalToman: number;
  callbackUrl: string;
  description?: string;
  mobile?: string;
}): Promise<ZibalRequestResult> {
  const res = await postToZibal('request', {
    merchant: params.merchant,
    // ⚠️ زیبال ریال می‌گیرد — مبالغ فروشگاه تومان است
    amount: params.totalToman * 10,
    callbackUrl: params.callbackUrl,
    orderId: params.orderCode,
    description: params.description ?? `پرداخت سفارش ${params.orderCode} — فروشگاه پارس`,
    ...(params.mobile ? { mobile: params.mobile } : {}),
  });

  if (res.result !== 100 || res.trackId === undefined || res.trackId === null) {
    // 10 = مرچنت نامعتبر، 3 = توکن/درگاه نامعتبر و ... — پیام درگاه را رد می‌کنیم
    const hint = ZIBAL_REQUEST_ERRORS[res.result] ?? res.message ?? 'خطای ناشناخته درگاه';
    throw new ApiError(502, 'PAYMENT_REQUEST_FAILED', `درگاه زیبال: ${hint} (کد ${res.result})`);
  }
  const trackId = String(res.trackId);
  return { trackId, startUrl: `${ZIBAL_BASE}/start/${trackId}` };
}

/** تأیید پرداخت — تنها منبع حقیقت تغییر وضعیت سفارش */
export async function verifyZibalPayment(params: {
  merchant: string;
  trackId: string;
}): Promise<ZibalVerifyResult> {
  const res = await postToZibal('verify', {
    merchant: params.merchant,
    trackId: Number.isFinite(Number(params.trackId)) ? Number(params.trackId) : params.trackId,
  });

  // 100 = تأیید موفق، 201 = قبلاً تأییدشده (idempotent)
  const verified = res.result === 100 || res.result === 201;
  return {
    verified,
    result: res.result,
    status: typeof res.status === 'number' ? res.status : 0,
    refNumber: res.refNumber !== undefined && res.refNumber !== null ? String(res.refNumber) : null,
    paidAt: res.paidAt ?? null,
    cardNumber: res.cardNumber ?? null,
    amountRial: typeof res.amount === 'number' ? res.amount : null,
    message: res.message ?? ZIBAL_VERIFY_ERRORS[res.result] ?? '',
  };
}

/** پیام‌های فارسی وضعیت تراکنش — طبق مستندات زیبال */
export const ZIBAL_STATUS_LABELS: Record<number, string> = {
  1: 'پرداخت‌شده — تأییدشده',
  2: 'پرداخت‌شده — تأییدنشده',
  3: 'لغو شده توسط کاربر',
  4: 'شماره کارت نامعتبر است',
  5: 'موجودی حساب کافی نیست',
  6: 'رمز واردشده اشتباه است',
  7: 'تعداد درخواست‌ها بیش از حد مجاز است',
  8: 'تعداد پرداخت روزانه بیش از حد مجاز است',
  9: 'مبلغ پرداخت روزانه بیش از حد مجاز است',
  10: 'صادرکننده کارت نامعتبر است',
  11: 'خطای سوییچ بانکی',
  12: 'کارت قابل دسترسی نیست',
  [-1]: 'در انتظار پرداخت',
  [-2]: 'خطای داخلی درگاه',
};

const ZIBAL_VERIFY_ERRORS: Record<number, string> = {
  202: 'پرداختی برای این تراکنش انجام نشده است',
  101: 'تراکنش قبلاً به‌صورت دستی تأیید یا خنثی شده است',
  203: 'تراکنش ناموفق است',
};

const ZIBAL_REQUEST_ERRORS: Record<number, string> = {
  [-1]: 'خطای نامشخص در درگاه',
  102: 'مرچنت کد یافت نشد — مقدار درگاه/مرچنت را در تنظیمات بررسی کنید',
  103: 'مرچنت کد غیرفعال است',
  104: 'مرچنت کد نامعتبر است',
  105: 'مبلغ باید بیشتر از ۱۰۰ ریال باشد',
  106: 'آدرس بازگشت (callbackUrl) نامعتبر است',
};
