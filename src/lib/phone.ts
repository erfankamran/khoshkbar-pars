/**
 * شماره موبایل ایران — نرمال‌سازی و نمایش (فاز ۹)
 * مشترک بین اعتبارسنج zod سمت سرور و فرم‌های کلاینت (تک‌منبع منطق)
 */

import { toEnDigits, toFaDigits } from '@/lib/fa';

/**
 * نرمال‌سازی به شکل استاندارد 09xxxxxxxxx:
 * - ارقام فارسی/عربی → انگلیسی
 * - حذف فاصله، خط تیره و پرانتز
 * - پشتیبانی از +98 / 0098 / 98 / 9 (بدون صفر اول)
 * خروجی null یعنی شماره نامعتبر است
 */
export function normalizePhone(raw: string): string | null {
  let s = toEnDigits(raw).replace(/[\s\-().]/g, '');
  if (s.startsWith('+98')) s = `0${s.slice(3)}`;
  else if (s.startsWith('0098')) s = `0${s.slice(4)}`;
  else if (s.startsWith('98') && s.length === 12) s = `0${s.slice(2)}`;
  else if (s.length === 10 && s.startsWith('9')) s = `0${s}`;
  return /^09\d{9}$/.test(s) ? s : null;
}

/** نمایش خوانا با ارقام فارسی — قالب استاندارد ۴-۳-۴: ۰۹۱۲ ۲۲۲ ۳۳۴۴ */
export function formatPhoneFa(phone: string): string {
  const m = /^09(\d{2})(\d{3})(\d{4})$/.exec(phone);
  if (!m) return toFaDigits(phone);
  return toFaDigits(`۰۹${m[1]} ${m[2]} ${m[3]}`);
}
