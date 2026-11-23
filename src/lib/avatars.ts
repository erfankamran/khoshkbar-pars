/**
 * آواتارهای شخصیت‌های پارس (فاز آواتار) — ۸ شخصیت مغز خوراکی
 *
 * - هر کاربر تازه‌وارد هنگام ثبت‌نام خودکار یکی از این شخصیت‌ها را می‌گیرد
 *   (تصادفی در auth.service.loginWithPhone) تا هیچ کاربری بدون چهره نماند
 * - کاربر هر وقت خواست می‌تواند از پروفایل شخصیت دیگری انتخاب کند یا آپلود کند
 * - مسیرها static در /avatars/ (خارج از زیرساخت رسانه — دارایی ثابت برنامه)
 * - تابع گارد: آواتار مجاز یا یکی از شخصیت‌هاست یا آپلود رسانهٔ امن (/api/media/)
 */

export interface NutAvatar {
  key: string;
  url: string;
  label: string;
}

export const NUT_AVATARS: readonly NutAvatar[] = [
  { key: 'almond', url: '/avatars/almond.webp', label: 'بادام' },
  { key: 'walnut', url: '/avatars/walnut.webp', label: 'گردو' },
  { key: 'pistachio', url: '/avatars/pistachio.webp', label: 'پسته' },
  { key: 'hazelnut', url: '/avatars/hazelnut.webp', label: 'فندق' },
  { key: 'cashew', url: '/avatars/cashew.webp', label: 'بادام هندی' },
  { key: 'peanut', url: '/avatars/peanut.webp', label: 'بادام زمینی' },
  { key: 'raisin', url: '/avatars/raisin.webp', label: 'کشمش' },
  { key: 'mulberry', url: '/avatars/mulberry.webp', label: 'توت خشک' },
] as const;

const NUT_AVATAR_URLS: readonly string[] = NUT_AVATARS.map((a) => a.url);

/** آواتار تصادفی برای ثبت‌نام خودکار — خروجی همیشه یکی از مسیرهای شناخته‌شده */
export function randomNutAvatarUrl(): string {
  return NUT_AVATAR_URLS[Math.floor(Math.random() * NUT_AVATAR_URLS.length)]!;
}

/** آیا URL آواتار جزو شخصیت‌های پارس است؟ */
export function isNutAvatarUrl(url: string): boolean {
  return NUT_AVATAR_URLS.includes(url);
}

/** گارد ذخیره‌سازی: شخصیت پارس یا آپلود امن رسانه — هر چیز دیگر رد می‌شود */
export function isAllowedAvatarUrl(url: string): boolean {
  return isNutAvatarUrl(url) || url.startsWith('/api/media/');
}
