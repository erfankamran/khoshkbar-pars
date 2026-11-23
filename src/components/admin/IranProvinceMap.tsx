'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapPin, Palette } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { IRAN_PROVINCES, IRAN_SEAS, IRAN_VIEWBOX } from './iran-provinces';
import { toFaDigits } from '@/lib/fa';

/**
 * نقشهٔ وکتوری ایران به تفکیک استان — مشترک بین داشبورد مشتریان و فاکتورهای فروش
 * (درخواست کاربر: نمایش روی نقشه + اینپوت رنگی + کلید فعال/غیرفعال)
 *
 * - اینپوت رنگی: رنگ پایهٔ پالت را انتخاب می‌کند و رمپ ۶ پله‌ای شدت به‌صورت خودکار ساخته می‌شود
 * - کلید فعال/غیرفعال: نمایش نقشه را روشن/خاموش می‌کند (وضعیت و رنگ در localStorage می‌ماند)
 * - hover/کلیک/فوکوس روی استان → نوار اطلاعات + شهرها
 * - کلیک استان (در حالت کنترل‌شده) → همگام با فیلتر استان صفحهٔ کاربران
 */

export interface MapProvinceDatum {
  name: string;
  /** عدد اصلی رنگ‌آمیزی — تعداد مشتری یا تعداد فاکتور */
  value: number;
  /** اطلاعات تکمیلی (مثل مبلغ فروش) — در نوار اطلاعات و رتبه‌بندی نمایش داده می‌شود */
  detail?: string;
  /** شهرهای استان — تا ۵ مورد در نوار اطلاعات */
  cities?: string[];
}

const EMPTY_FILL = '#f6f1e5';
const SEA_FILL = '#dceaf5';

// ——— تبدیل رنگ برای ساخت رمپ تک‌رنگ از رنگ انتخابی ———

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const c = ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** رمپ ۶ پله‌ای از رنگ پایه — روشن (مقدار کم) تا تیره (مقدار زیاد) */
function buildScale(base: string): string[] {
  const { h, s, l } = hexToHsl(base);
  // رنگ پایهٔ خیلی روشن/خیلی تیره → تیره‌ترین پله در بازهٔ معقول clamp می‌شود
  const darkL = Math.min(Math.max(l, 26), 58);
  const steps: string[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    steps.push(hslToHex(h, s * (0.35 + 0.65 * t), 92 - t * (92 - darkL)));
  }
  return steps;
}

export function IranProvinceMap({
  title,
  storageKey,
  defaultColor = '#17754b',
  unitLabel,
  provinces,
  formatValue,
  selectedProvince,
  onSelectProvince,
  emptyText = 'هنوز داده‌ای ثبت نشده است',
  footerChips,
}: {
  title: string;
  /** کلید localStorage برای ماندگاری رنگ و وضعیت فعال/غیرفعال */
  storageKey: string;
  defaultColor?: string;
  /** واحد شمارش برای برچسب‌ها — مثل «مشتری» یا «فاکتور فروش» */
  unitLabel: string;
  provinces: MapProvinceDatum[];
  formatValue?: (v: number) => string;
  /** حالت کنترل‌شده — همگام با فیلتر استان صفحهٔ کاربران */
  selectedProvince?: string | null;
  onSelectProvince?: (name: string | null) => void;
  emptyText?: string;
  footerChips?: React.ReactNode;
}) {
  // ——— اینپوت رنگی + کلید فعال/غیرفعال (با ماندگاری در localStorage) ———
  const [color, setColor] = useState(defaultColor);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { enabled?: boolean; color?: string };
      if (typeof parsed.enabled === 'boolean') setEnabled(parsed.enabled);
      if (parsed.color && /^#[0-9a-fA-F]{6}$/.test(parsed.color)) setColor(parsed.color);
    } catch {
      /* localStorage در دسترس نیست — پیش‌فرض‌ها */
    }
  }, [storageKey]);
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ enabled, color }));
    } catch {
      /* noop */
    }
  }, [enabled, color, storageKey]);

  const [hover, setHover] = useState<string | null>(null);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);

  const isControlled = onSelectProvince !== undefined;
  const selected = isControlled ? selectedProvince ?? null : internalSelected;
  const select = (name: string) => {
    const next = selected === name ? null : name;
    if (isControlled) onSelectProvince(next);
    else setInternalSelected(next);
  };

  const byName = useMemo(
    () => new Map<string, MapProvinceDatum>(provinces.map((p) => [p.name, p])),
    [provinces]
  );
  const scale = useMemo(() => buildScale(color), [color]);
  const max = useMemo(
    () => Math.max(1, ...provinces.map((p) => p.value)),
    [provinces]
  );

  const fmt = formatValue ?? ((v: number) => `${toFaDigits(v)} ${unitLabel}`);

  const fillColor = (data: MapProvinceDatum | undefined) => {
    if (!data || data.value <= 0) return EMPTY_FILL;
    const idx = Math.min(scale.length - 1, Math.floor(Math.sqrt(data.value / max) * scale.length));
    return scale[idx];
  };

  const activeName = hover ?? selected;
  const active = activeName ? byName.get(activeName) ?? null : null;
  const ranked = provinces
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const sum = provinces.reduce((s, p) => s + p.value, 0);

  return (
    <section
      className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
      aria-label={title}
    >
      {/* ——— سربرگ: عنوان + اینپوت رنگی + کلید فعال/غیرفعال ——— */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-black text-ink-900">
          <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-full bg-cream-100 px-2.5 py-1.5">
            <Palette className="h-3.5 w-3.5 text-ink-400" aria-hidden />
            <span className="text-[10.5px] font-bold text-ink-500">رنگ نقشه</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="انتخاب رنگ نقشه"
              className="h-5 w-7 cursor-pointer rounded-md border border-cream-200 bg-white p-0.5"
            />
          </label>
          <label className="flex items-center gap-1.5 rounded-full bg-cream-100 px-2.5 py-1.5">
            <span className="text-[10.5px] font-bold text-ink-500">نمایش روی نقشه</span>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="فعال یا غیرفعال کردن نمایش نقشه"
            />
          </label>
        </div>
      </div>

      {/* ——— چیپ‌های جمع‌بندی ——— */}
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
        <span className="rounded-xl bg-cream-100 px-2.5 py-1 text-ink-500">
          استان‌های دارای {unitLabel}: {toFaDigits(provinces.length)}
        </span>
        <span className="rounded-xl bg-cream-100 px-2.5 py-1 text-ink-500">
          مجموع: {fmt(sum)}
        </span>
        {footerChips}
      </div>

      {enabled ? (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            {/* ——— نقشه + لجند + نوار اطلاعات ——— */}
            <div className="min-w-0">
              <svg
                viewBox={IRAN_VIEWBOX}
                className="mx-auto block h-auto w-full max-w-xl"
                role="img"
                aria-label={`${title} — به تفکیک استان`}
              >
                {IRAN_SEAS.map((sea) => (
                  <path key={sea.id} d={sea.d} fill={SEA_FILL} stroke="none" aria-hidden />
                ))}
                {IRAN_PROVINCES.map((prov) => {
                  const data = byName.get(prov.fa);
                  const isActive = hover === prov.fa || selected === prov.fa;
                  return (
                    <path
                      key={prov.id}
                      d={prov.d}
                      fill={isActive ? '#0e4a30' : fillColor(data)}
                      stroke={isActive ? '#0e4a30' : '#ffffff'}
                      strokeWidth={isActive ? 2.5 : 1.2}
                      className="cursor-pointer outline-none"
                      tabIndex={0}
                      role="button"
                      aria-label={`${prov.fa}${data ? ` — ${fmt(data.value)}` : ' — بدون داده'}`}
                      onMouseEnter={() => setHover(prov.fa)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(prov.fa)}
                      onBlur={() => setHover(null)}
                      onClick={() => select(prov.fa)}
                    >
                      <title>{`${prov.fa} — ${data ? fmt(data.value) : 'بدون داده'}`}</title>
                    </path>
                  );
                })}
              </svg>

              {/* لجند ۶ پله‌ای — از رنگ انتخابی کاربر ساخته می‌شود */}
              <div className="mt-2 flex items-center justify-center gap-1.5 text-[9.5px] font-bold text-ink-400">
                <span>کمتر</span>
                {scale.map((c) => (
                  <span
                    key={c}
                    className="h-3 w-6 rounded-sm border border-white"
                    style={{ backgroundColor: c }}
                    aria-hidden
                  />
                ))}
                <span>بیشتر</span>
              </div>

              {/* نوار اطلاعات استان فعال */}
              {active ? (
                <div className="mt-3 rounded-2xl border border-cream-200 bg-cream-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-black text-ink-900">{active.name}</span>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-black text-brand-700">
                      {fmt(active.value)}
                    </span>
                    {active.detail && (
                      <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10.5px] font-bold text-gold-700">
                        {active.detail}
                      </span>
                    )}
                  </div>
                  {active.cities && active.cities.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-ink-400">شهرها:</span>
                      {active.cities.slice(0, 5).map((city) => (
                        <span
                          key={city}
                          className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-ink-600"
                        >
                          {city}
                        </span>
                      ))}
                      {active.cities.length > 5 && (
                        <span className="text-[10px] text-ink-300">
                          و {toFaDigits(active.cities.length - 5)} شهر دیگر
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-center text-[10.5px] text-ink-300 lg:text-right">
                  برای دیدن جزئیات، نشانگر را روی استان‌ها ببرید یا کلیک کنید
                </p>
              )}
            </div>

            {/* ——— رتبه‌بندی ۵ استان برتر ——— */}
            <aside className="min-w-0">
              <h3 className="mb-2 text-[11.5px] font-black text-ink-700">برترین استان‌ها</h3>
              {ranked.length === 0 ? (
                <p className="py-3 text-center text-[10.5px] text-ink-300">{emptyText}</p>
              ) : (
                <ul className="space-y-2">
                  {ranked.map((p, i) => {
                    const share = Math.max(Math.round((p.value / max) * 100), 3);
                    const isSelected = selected === p.name;
                    return (
                      <li key={p.name}>
                        <button
                          type="button"
                          onClick={() => select(p.name)}
                          className={`w-full rounded-xl px-2 py-1.5 text-right transition-colors ${
                            isSelected ? 'bg-cream-100' : 'hover:bg-cream-50'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${
                                i === 0 ? 'bg-gold-500 text-white' : 'bg-cream-200 text-ink-500'
                              }`}
                            >
                              {toFaDigits(i + 1)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[11px] font-black text-ink-800">
                              {p.name}
                            </span>
                            <span className="shrink-0 text-[10px] font-bold text-ink-500">
                              {fmt(p.value)}
                            </span>
                          </span>
                          <span
                            className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-cream-100"
                            aria-hidden
                          >
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${share}%`, backgroundColor: scale[scale.length - 1] }}
                            />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          </div>
        </>
      ) : (
        /* ——— حالت غیرفعال — نقشه پنهان، جای‌نگهدار شفاف ——— */
        <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-cream-300 bg-cream-50/60 px-6 py-10 text-center">
          <Palette className="h-6 w-6 text-ink-300" aria-hidden />
          <p className="mt-2 text-[12px] font-black text-ink-500">نمایش روی نقشه غیرفعال است</p>
          <p className="mt-1 text-[10.5px] text-ink-400">
            برای فعال‌سازی، کلید «نمایش روی نقشه» را روشن کنید
          </p>
        </div>
      )}
    </section>
  );
}
