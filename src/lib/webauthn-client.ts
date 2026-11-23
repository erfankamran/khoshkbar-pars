'use client';

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { apiPost } from '@/lib/api-client';

/**
 * کلاینت WebAuthn (فاز Passkey) — پل بین UI پارس و استاندارد WebAuthn
 *
 * - ذخیرهٔ Passkey در مدیریت‌کنندهٔ انتخابی کاربر انجام می‌شود (Google Password
 *   Manager، Apple Passwords / iCloud Keychain، گذرواژه‌بان‌های سازگار،
 *   Credential Manager سیستم‌عامل) — انتخاب با تنظیمات دستگاه کاربر است و
 *   سرور هیچ محدودیتی روی محل ذخیره می‌گذارد
 * - کلید خصوصی و بیومتریک هرگز از مرورگر خارج نمی‌شوند — این ماژول فقط
 *   پاسخ کلید عمومی را به سرور می‌برد
 */

/** پشتیبانی مرورگر از WebAuthn — گزینهٔ Passkey فقط وقتی نشان داده می‌شود */
export function webAuthnSupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}


export interface LoginWithPasskeyResult {
  user: { id: string; phone: string; fullName: string | null; role: string };
  cart: unknown;
  sessionToken?: string;
}

/** ثبت Passkey جدید — کاربر باید وارد شده باشد (کوکی/هدر نشست خودکار می‌رود) */
export async function registerPasskey(): Promise<{ passkey: { id: string; deviceName: string | null } }> {
  // ۱) challenge یک‌بارمصرف از سرور
  const { options } = await apiPost<{ options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>(
    '/api/auth/passkeys/register/options',
    {}
  );
  // ۲) مرورگر: ساخت credential با اثر انگشت/چهره/PIN — ذخیره در گذرواژه‌بان کاربر
  const attResp = await startRegistration({ optionsJSON: options });
  // ۳) تأیید کلید عمومی سمت سرور
  return apiPost('/api/auth/passkeys/register/verify', attResp as unknown as Record<string, unknown>);
}

/**
 * ورود با Passkey — phone اختیاری؛ بدون شماره مرورگر کلیدهای ذخیره‌شدهٔ این
 * سایت را (discoverable) پیشنهاد می‌دهد و پاسخ ورود همان شکل ورود OTP است
 */
export async function loginWithPasskey(phone?: string): Promise<LoginWithPasskeyResult> {
  const { options } = await apiPost<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>(
    '/api/auth/passkeys/login/options',
    phone ? { phone } : {}
  );
  const authResp = await startAuthentication({ optionsJSON: options });
  return apiPost('/api/auth/passkeys/login/verify', authResp as unknown as Record<string, unknown>);
}
