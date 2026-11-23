import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import type { SessionUser } from '@/server/lib/auth';
import { getPaymentConfig, verifyZibalPayment } from '@/server/services/payment.service';
import {
  notifyAdmins,
  notifyInbox,
} from '@/server/services/notification-center.service';

/**
 * بررسی و تأیید پرداخت درگاه (فاز ۱۶)
 *
 * قاعده حیاتی: پارامتر success در آدرس بازگشت از درگاه «جعل‌پذیر» است؛
 * وضعیت سفارش فقط با پاسخ رسمی v1/verify سمت سرور تغییر می‌کند.
 *
 * جریان: کاربر از درگاه به /payment/callback برمی‌گردد → این صفحه
 * POST /api/payments/verify با { code, trackId } می‌زند → سرور به زیبال
 * وریفای می‌زند و فقط اگر result ∈ {100, 201} و مبلغ منطبق بود، سفارش PAID می‌شود.
 */

export interface PaymentVerifyResult {
  verified: boolean;
  alreadyPaid: boolean;
  code: string;
  gatewayResult: number | null;
  gatewayStatus: number | null;
  gatewayMessage: string;
  refNumber: string | null;
}

export async function verifyOrderPayment(
  user: SessionUser,
  input: { code: string; trackId: string }
): Promise<PaymentVerifyResult> {
  // ۱) سفارش — فقط مالک (ضد IDOR: سفارش دیگران → 404)
  const order = await db.order.findUnique({
    where: { code: input.code },
    select: {
      id: true,
      code: true,
      userId: true,
      status: true,
      totalToman: true,
      paymentStatus: true,
      paymentTrackId: true,
      paymentMethod: true,
    },
  });
  if (!order || order.userId !== user.id) {
    throw ApiError.notFound('سفارش یافت نشد');
  }

  // ۲) مرجع تراکنش باید همان trackId پاس‌شده باشد — نشست پرداخت متفاوت → رد
  if (!order.paymentTrackId || order.paymentTrackId !== input.trackId) {
    throw new ApiError(
      400,
      'PAYMENT_SESSION_MISMATCH',
      'این سفارش با این شناسه تراکنش شروع نشده است'
    );
  }

  // ۳) اگر قبلاً PAID شده — idempotent، بدون تماس مجدد به درگاه
  if (order.paymentStatus === 'PAID') {
    return {
      verified: true,
      alreadyPaid: true,
      code: order.code,
      gatewayResult: null,
      gatewayStatus: null,
      gatewayMessage: 'این سفارش قبلاً پرداخت و تأیید شده است',
      refNumber: null,
    };
  }

  // ۴) وریفای سمت سرور — تنها منبع حقیقت
  const config = await getPaymentConfig();
  if (config.provider !== 'ZIBAL' || !config.merchant) {
    throw new ApiError(400, 'GATEWAY_NOT_CONFIGURED', 'درگاه پرداخت پیکربندی نشده است');
  }
  const gateway = await verifyZibalPayment({ merchant: config.merchant, trackId: input.trackId });

  // ۵) تطبیق مبلغ (ریال) با سفارش — عدم تطابق = شکست (احتمال دستکاری)
  if (gateway.verified && gateway.amountRial !== null && gateway.amountRial !== order.totalToman * 10) {
    return {
      verified: false,
      alreadyPaid: false,
      code: order.code,
      gatewayResult: gateway.result,
      gatewayStatus: gateway.status,
      gatewayMessage: 'مبلغ تأییدشده با مبلغ سفارش مطابقت ندارد',
      refNumber: null,
    };
  }

  if (!gateway.verified) {
    // پرداخت انجام نشده/لغو شده — سفارش PENDING_PAYMENT می‌ماند و قابل تلاش مجدد است
    return {
      verified: false,
      alreadyPaid: false,
      code: order.code,
      gatewayResult: gateway.result,
      gatewayStatus: gateway.status,
      gatewayMessage: gateway.message || 'پرداخت تأیید نشد',
      refNumber: null,
    };
  }

  // ۶) موفق — گذار فقط از PENDING_PAYMENT یا PAID؛ سفارش در حال پردازش/ارسال را نمی‌شکنیم
  await db.order.update({
    where: { id: order.id },
    data: {
      status: order.status === 'PENDING_PAYMENT' ? 'PAID' : order.status,
      paymentStatus: 'PAID',
      paidAt: new Date(),
      paymentRef: gateway.refNumber ?? `ZIBAL-${input.trackId}`,
    },
  });

  // —— مرکز اعلان‌ها (زنگوله) —— fire-and-forget؛ هرگز جریان وریفای را نمی‌شکند
  void notifyInbox(order.userId, {
    type: 'PAYMENT',
    title: 'پرداخت سفارش تأیید شد',
    body: `پرداخت سفارش ${order.code} به مبلغ ${order.totalToman.toLocaleString('fa-IR')} تومان تأیید شد`,
    url: `/?o=${order.code}`,
  });
  void notifyAdmins({
    type: 'PAYMENT',
    title: 'پرداخت جدید تأیید شد',
    body: `پرداخت سفارش ${order.code} به مبلغ ${order.totalToman.toLocaleString('fa-IR')} تومان از درگاه تأیید شد`,
    url: `/admin/orders/${order.id}`,
  });

  return {
    verified: true,
    alreadyPaid: false,
    code: order.code,
    gatewayResult: gateway.result,
    gatewayStatus: gateway.status,
    gatewayMessage: 'پرداخت با موفقیت تأیید شد',
    refNumber: gateway.refNumber ?? `ZIBAL-${input.trackId}`,
  };
}
