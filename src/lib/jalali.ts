/**
 * تاریخ جلالی — بدون وابستگی خارجی (فاز ۹)
 *
 * استفاده‌ها:
 * - کد سفارش: PARS-14050815-XXXX (بخش ۱۳ مشخصات)
 * - نمایش تاریخ سفارش در UI با ارقام فارسی
 *
 * الگوریتم استاندارد تبدیل میلادی به جلالی (تقسیم صحیح — دقت کامل در
 * بازه ۱۲۵۸ تا ۱۵۳۲ جلالی معادل ۱۸۷۹ تا ۲۱۵۳ میلادی).
 */

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

const toFa = (n: string | number) =>
  String(n).replace(/[0-9]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[Number(c)]);

/** تاریخ جلالی (به وقت تهران) از یک تاریخ میلادی */
function jalaliOf(d: Date): JalaliDate {
  const tehran = new Date(d.getTime() + 3.5 * 60 * 60 * 1000);
  return gregorianToJalali(
    tehran.getUTCFullYear(),
    tehran.getUTCMonth() + 1,
    tehran.getUTCDate()
  );
}

/**
 * کلید ماه جلالی «1404-08» — برای گروه‌بندی گزارش فروش ماهانه داشبورد
 * (گروه‌بندی بر اساس روز تقویم تهران، نه ساعت محلی سرور)
 */
export function jalaliMonthKey(d: Date): { key: string; jy: number; jm: number } {
  const { jy, jm } = jalaliOf(d);
  return { key: `${jy}-${String(jm).padStart(2, '0')}`, jy, jm };
}

/** کلید روز جلالی «1404-08-12» — برای گروه‌بندی گزارش فروش روزانه */
export function jalaliDayKey(d: Date): string {
  const { jy, jm, jd } = jalaliOf(d);
  return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
}

/**
 * n ماه جلالی اخیر (قدیمی‌ترین → جدیدترین، شامل ماه جاری) با نام ماه
 * — محور گزارش ماهانه داشبورد؛ در بازه ۱۲ ماه هر نام ماه فقط یک‌بار می‌آید
 */
export function lastJalaliMonths(
  n: number,
  now: Date = new Date()
): Array<{ key: string; jy: number; jm: number; label: string }> {
  const { jy, jm } = jalaliOf(now);
  const out: Array<{ key: string; jy: number; jm: number; label: string }> = [];
  for (let i = n - 1; i >= 0; i--) {
    let m = jm - i;
    let y = jy;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    out.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      jy: y,
      jm: m,
      label: JALALI_MONTHS[m - 1],
    });
  }
  return out;
}

/** برچسب کوتاه روز: «۱۲ آبان» — تولتیپ گزارش روزانه داشبورد */
export function formatJalaliDayShort(iso: string | Date): string {
  const { jm, jd } = jalaliOf(typeof iso === 'string' ? new Date(iso) : iso);
  return `${toFa(jd)} ${JALALI_MONTHS[jm - 1]}`;
}

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** تبدیل تاریخ میلادی به جلالی */
export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

/** تاریخ امروز (به وقت تهران) به جلالی */
export function todayJalali(now: Date = new Date()): JalaliDate {
  // ISO با زمان تهران: UTC+3:30 — با شیفتیافتگی ساده و بدون کتابخانه
  const tehran = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
  return gregorianToJalali(
    tehran.getUTCFullYear(),
    tehran.getUTCMonth() + 1,
    tehran.getUTCDate()
  );
}

/**
 * تبدیل جلالی به میلادی — الگوریتم استاندارد معکوس (قرینهٔ gregorianToJalali
 * بالا با ثابت‌های -355668 و 1595؛ جفت شناخته‌شدهٔ jdf.scr.ir).
 * بازه معتبر: ۱۲۵۸ تا ۱۵۳۲ جلالی — همان بازهٔ تابع معکوس.
 */
export function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number
): { gy: number; gm: number; gd: number } {
  const jy2 = jy + 1595;
  let days =
    -355668 +
    365 * jy2 +
    Math.floor(jy2 / 33) * 8 +
    Math.floor(((jy2 % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const isLeapGy = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, isLeapGy ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > monthDays[gm]) {
    gd -= monthDays[gm];
    gm++;
  }
  return { gy, gm, gd };
}

/**
 * ابتدای ماه جلالی جاری به وقت تهران — برای شمارش «جدید این ماه»
 * نیمه‌شب تهران = ۲۰:۳۰ روز قبل به UTC (اختلاف UTC+3:30)
 */
export function startOfJalaliMonth(now: Date = new Date()): Date {
  const { jy, jm } = todayJalali(now);
  const g = jalaliToGregorian(jy, jm, 1);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 20, 30, 0) - 24 * 60 * 60 * 1000);
}

/** برچسب ماه جلالی: «آبان ۱۴۰۴» — محور گزارش ماهانه داشبورد */
export function jalaliMonthLabel(jy: number, jm: number): string {
  return `${JALALI_MONTHS[jm - 1]} ${toFa(jy)}`;
}

/** نام ماه جلالی از شماره ماه (۱..۱۲) */
export function jalaliMonthName(jm: number): string {
  return JALALI_MONTHS[jm - 1] ?? '';
}

/**
 * کد سفارش خوانا: PARS-14050815-XXXX
 * XXXX از الفبای بدون ابهام (بدون 0/O و 1/I) — توسط سرویس سفارش تولید می‌شود
 */
export function jalaliOrderDate(now: Date = new Date()): string {
  const { jy, jm, jd } = todayJalali(now);
  return `${jy}${String(jm).padStart(2, '0')}${String(jd).padStart(2, '0')}`;
}

/** نمایش تاریخ جلالی با نام ماه و ارقام فارسی — برای UI سفارش‌ها */
export function formatJalaliDate(
  iso: string | Date,
  opts: { withTime?: boolean } = {}
): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const { jy, jm, jd } = jalaliOf(d);
  const dateStr = `${toFa(jd)} ${JALALI_MONTHS[jm - 1]} ${toFa(jy)}`;
  if (!opts.withTime) return dateStr;
  const tehran = new Date(d.getTime() + 3.5 * 60 * 60 * 1000);
  const hh = String(tehran.getUTCHours()).padStart(2, '0');
  const mm = String(tehran.getUTCMinutes()).padStart(2, '0');
  return `${dateStr} — ${toFa(hh)}:${toFa(mm)}`;
}
