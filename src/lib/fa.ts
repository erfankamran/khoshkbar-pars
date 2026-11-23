/**
 * ابزارهای فارسی‌سازی: ارقام فارسی، قالب قیمت و نرمال‌سازی متن برای جستجو
 */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** تبدیل ارقام انگلیسی به فارسی برای نمایش */
export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** تبدیل ارقام فارسی و عربی به انگلیسی برای پردازش */
export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/**
 * قیمت به تومان با جداکننده هزارگان و ارقام فارسی
 * مبالغ مالی در دیتابیس همیشه عدد صحیح (تومان) ذخیره می‌شوند.
 */
export function formatPrice(toman: number): string {
  const grouped = Math.round(toman).toLocaleString('en-US');
  return `${toFaDigits(grouped)} تومان`;
}


/**
 * قیمت فشرده برای محور و برچسب نمودارهای داشبورد:
 * ۱٬۲۰۰٬۰۰۰ → «۱٫۲ میلیون» — ۸۵۰٬۰۰۰ → «۸۵۰ هزار» — کمتر از هزار → خود عدد
 */
export function formatCompactToman(toman: number): string {
  const faDecimal = (n: number) =>
    toFaDigits(String(Number(n.toFixed(1))).replace('.', '٫'));
  if (toman >= 1_000_000_000) return `${faDecimal(toman / 1_000_000_000)} میلیارد`;
  if (toman >= 1_000_000) return `${faDecimal(toman / 1_000_000)} میلیون`;
  if (toman >= 1_000) return `${toFaDigits(Math.round(toman / 1_000))} هزار`;
  return toFaDigits(Math.round(toman));
}

/** نمایش وزن: ۲۵۰ گرم / ۱ کیلوگرم */
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    const clean = Number.isInteger(kg) ? kg : Number(kg.toFixed(3));
    return `${toFaDigits(clean)} کیلوگرم`;
  }
  return `${toFaDigits(grams)} گرم`;
}

/**
 * نرمال‌سازی متن فارسی برای جستجو (سمت کاربر و سرور یکسان):
 * - یکسان‌سازی ی/ي و ک/ك
 * - یکسان‌سازی أ/إ/آ با ا و ة با ه
 * - حذف اعراب و کشیده
 * - تبدیل ارقام فارسی/عربی به انگلیسی
 * - تبدیل نیم‌فاصله به فاصله و حذف فاصله‌های اضافی
 * نسخه سمت سرور همین منطق را در ماژول جستجو تکرار می‌کند (تک‌منبع بودن منطق).
 */
export function normalizePersian(text: string): string {
  return toEnDigits(text)
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
