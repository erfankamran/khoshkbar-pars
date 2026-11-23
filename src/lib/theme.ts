/**
 * اعمال تم رنگی پویا (فاز ۲)
 *
 * Tailwind 4 کلاس‌هایی مثل bg-brand-600 را به var(--color-brand-600) کامپایل
 * می‌کند و خود متغیرها روی :root تعریف می‌شوند — پس با بازنویسی همان متغیرها
 * روی document.documentElement.style، کل فروشگاه (بدون رفرش) رنگ عوض می‌کند.
 *
 * پالت ۱۱ پلهٔ برند از یک رنگ اصلی با ترکیب با سفید/سیاه ساخته می‌شود؛
 * نسبت‌ها با پالت پیش‌فرض پارس کالیبره شده‌اند تا حالت پیش‌فرض تقریباً یکسان بماند.
 */

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [10, 14, 12]; // مشکی گرم — نزدیک‌تر به پالت پارس از #000

export function clampHex(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** ترکیب خطی: نسبت = سهم رنگ دوم در نتیجه (0..۱) */
function mix(a: [number, number, number], b: [number, number, number], ratio: number): string {
  return toHex([
    a[0] + (b[0] - a[0]) * ratio,
    a[1] + (b[1] - a[1]) * ratio,
    a[2] + (b[2] - a[2]) * ratio,
  ]);
}

/** پالت سبز برند از رنگ اصلی */
function brandRamp(primary: string): Record<string, string> {
  const p = hexToRgb(primary);
  return {
    '--color-brand-50': mix(p, WHITE, 0.93),
    '--color-brand-100': mix(p, WHITE, 0.84),
    '--color-brand-200': mix(p, WHITE, 0.66),
    '--color-brand-300': mix(p, WHITE, 0.45),
    '--color-brand-400': mix(p, WHITE, 0.22),
    '--color-brand-500': primary,
    '--color-brand-600': mix(p, BLACK, 0.12),
    '--color-brand-700': mix(p, BLACK, 0.28),
    '--color-brand-800': mix(p, BLACK, 0.42),
    '--color-brand-900': mix(p, BLACK, 0.55),
    '--color-brand-950': mix(p, BLACK, 0.72),
  };
}

/** پالت طلایی تأکیدی از رنگ دوم */
function goldRamp(accent: string): Record<string, string> {
  const a = hexToRgb(accent);
  return {
    '--color-gold-100': mix(a, WHITE, 0.87),
    '--color-gold-200': mix(a, WHITE, 0.7),
    '--color-gold-300': mix(a, WHITE, 0.42),
    '--color-gold-400': accent,
    '--color-gold-500': mix(a, BLACK, 0.1),
    '--color-gold-600': mix(a, BLACK, 0.26),
    '--color-gold-700': mix(a, BLACK, 0.42),
  };
}

/**
 * اعمال تم روی :root — همان لحظه و بدون رفرش برای همهٔ صفحه (فروشگاه و پنل).
 * متغیرهای shadcn (primary/ring/...) هم هم‌راستا می‌شوند تا کامپوننت‌های ui رنگ بگیرند.
 */
export function applyBrandTheme(primaryHex: string, accentHex: string): void {
  if (typeof document === 'undefined') return;
  const primary = clampHex(primaryHex, '#1f8f5a');
  const accent = clampHex(accentHex, '#d9b352');
  const root = document.documentElement;
  const style = root.style;

  for (const [key, value] of Object.entries(brandRamp(primary))) {
    style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(goldRamp(accent))) {
    style.setProperty(key, value);
  }

  const p = hexToRgb(primary);
  style.setProperty('--primary', primary);
  style.setProperty('--ring', mix(p, WHITE, 0.45));
  style.setProperty('--secondary-foreground', mix(p, BLACK, 0.28));
  style.setProperty('--accent-foreground', mix(p, BLACK, 0.28));

  // رنگ نوار مرورگر در موبایل — هم‌راستا با هدر (brand-900)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mix(p, BLACK, 0.55));
}
