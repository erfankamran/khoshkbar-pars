import { normalizePersian } from '@/lib/fa';

/**
 * ابزار مشترک سرویس‌های پنل مدیریت (فاز ۱۴)
 */

export const PAGE_DEFAULT_SIZE = 20;

/** ساخت متن نرمال‌شده جستجو — منطق یکسان با seed و search.service */
export function buildSearchText(
  parts: Array<string | null | undefined>,
  attributes: Array<{ key: string; value: string }>,
  categoryTitle?: string | null
): string {
  const all = [
    ...parts,
    ...attributes.map((a) => `${a.key} ${a.value}`),
    categoryTitle ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return normalizePersian(all).replace(/\s+/g, ' ').trim();
}

/** محاسبه offset صفحه‌بندی */
export function pageOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/** پیام خطای یکتایی Prisma → خطای 409 خوانا */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  );
}

/** خطای قید FK (حذف رکورد ارجاع‌شده) */
export function isForeignViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2003'
  );
}
