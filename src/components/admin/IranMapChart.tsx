'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Crown, MapPin, Palette, TrendingUp, Users } from 'lucide-react';
import { IRAN_PROVINCES, IRAN_SEAS, IRAN_VIEWBOX } from './iran-provinces';
import { formatCompactToman, formatPrice, toFaDigits } from '@/lib/fa';
import { Switch } from '@/components/ui/switch';

/**
 * نقشهٔ تعاملی ایران — پراکندگی فروش و مشتریان به تفکیک استان (درخواست کاربر)
 *
 * - ۳۱ استان با مسیرهای SVG استاتیک (iran-provinces.ts)
 * - سوئیچ متریک قابل‌تنظیم: فروش / مشتریان (صفحه‌های تک‌متریکی فقط یک تب دارند)
 * - رنگ‌آمیزی ۶ پله‌ای با مقیاس جذر — از اینپوت رنگی کاربر تولید می‌شود (درخواست کاربر)
 * - کلید فعال/غیرفعال نمایش نقشه + رنگ انتخابی، در localStorage هر صفحه ذخیره می‌شود
 * - hover/کلیک/فوکوس → نوار اطلاعات استان + شهرها
 * - onSelectProvince اختیاری: به‌جای لینک، فیلتر صفحهٔ میزبان را تنظیم می‌کند
 */

export interface MapProvinceDTO {
  name: string;
  revenueToman: number;
  ordersCount: number;
  customers: number;
  cities: string[];
}

/** شکل دادهٔ نقشه — سازگار با geo داشبورد، geo کاربران و geo فاکتورهای فروش */
export interface MapGeoDTO {
  provinces: MapProvinceDTO[];
  provincesWithSales?: number;
  citiesWithSales?: number;
  invoicesTotal?: number;
}

export type MapMetric = 'revenue' | 'customers';

const EMPTY_FILL = '#f6f1e5';
const SEA_FILL = '#dceaf5';
const DEFAULT_BASE_COLOR = '#17754b';

const METRIC_LABELS: Record<MapMetric, string> = {
  revenue: 'فروش',
  customers: 'مشتریان',
};

interface MapSettings {
  enabled: boolean;
  color: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** هگز → HSL (خروجی ۰-۳۶۰ / ۰-۱۰۰ / ۰-۱۰۰) */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** HSL → هگز */
function hslToHex(h: number, s: number, l: number): string {
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lig = Math.min(100, Math.max(0, l)) / 100;
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const [r, g, b] = rgb.map((v) => Math.round((v + m) * 255));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** مقیاس ۶ پله‌ای روشن→تیره از رنگ پایهٔ انتخابی کاربر */
function buildScale(base: string): string[] {
  const { h, s } = hexToHsl(base);
  const sat = Math.min(72, Math.max(28, s));
  return [88, 78, 66, 53, 40, 28].map((l) => hslToHex(h, sat, l));
}

/**
 * تنظیمات نقشه (فعال/غیرفعال + رنگ) با ذخیرهٔ localStorage
 * مقدار اولیه همیشه پیش‌فرض است تا با رندر سرور هم‌خوان بماند؛
 * پس از mount مقدار ذخیره‌شده بارگذاری می‌شود.
 */
function useMapSettings(storageKey: string, defaultColor: string) {
  const [settings, setSettings] = useState<MapSettings>({ enabled: true, color: defaultColor });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MapSettings>;
        setSettings((prev) => ({
          enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : prev.enabled,
          color:
            typeof parsed.color === 'string' && HEX_RE.test(parsed.color)
              ? parsed.color
              : prev.color,
        }));
      }
    } catch {
      // localStorage در دسترس نیست — پیش‌فرض می‌ماند
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {
      // بی‌خطر — فقط ذخیرهٔ تنظیمات UI
    }
  }, [settings, hydrated, storageKey]);

  const update = useCallback((patch: Partial<MapSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  return { settings, update };
}

export function IranMapChart({
  geo,
  metrics = ['revenue', 'customers'],
  storageKey = 'pars-admin-map',
  defaultColor = DEFAULT_BASE_COLOR,
  title = 'پراکندگی فروش و مشتریان — نقشهٔ ایران',
  onSelectProvince,
}: {
  geo: MapGeoDTO;
  /** متریک‌های قابل‌نمایش — صفحه‌های تک‌متریکی فقط تب فعال را دارند */
  metrics?: MapMetric[];
  /** کلید localStorage تنظیمات این صفحه */
  storageKey?: string;
  /** رنگ پایهٔ پیش‌فرض مقیاس رنگی */
  defaultColor?: string;
  /** عنوان کارت */
  title?: string;
  /** در صورت پاس‌دادن، کلیک روی استان/شهر به‌جای لینک، این callback را صدا می‌زند */
  onSelectProvince?: (province: string, city?: string) => void;
}) {
  const { settings, update } = useMapSettings(storageKey, defaultColor);
  const [metric, setMetric] = useState<MapMetric>(metrics[0]);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const byName = useMemo(
    () => new Map<string, MapProvinceDTO>(geo.provinces.map((p) => [p.name, p])),
    [geo.provinces]
  );
  const max = useMemo(() => {
    const values = geo.provinces.map((p) =>
      metric === 'revenue' ? p.revenueToman : p.customers
    );
    return Math.max(1, ...values);
  }, [geo.provinces, metric]);

  const scale = useMemo(() => buildScale(settings.color), [settings.color]);
  const activeFill = useMemo(() => {
    const { h, s } = hexToHsl(settings.color);
    return hslToHex(h, s, 20);
  }, [settings.color]);

  const valueOf = (p: MapProvinceDTO) =>
    metric === 'revenue' ? p.revenueToman : p.customers;

  const fillColor = (p: MapProvinceDTO | undefined) => {
    if (!p) return EMPTY_FILL;
    const v = valueOf(p);
    if (v <= 0) return EMPTY_FILL;
    const idx = Math.min(scale.length - 1, Math.floor(Math.sqrt(v / max) * scale.length));
    return scale[idx];
  };

  const formatValue = (v: number) =>
    metric === 'revenue' ? formatPrice(v) : `${toFaDigits(v)} مشتری`;

  const activeName = hover ?? selected;
  const active = activeName ? byName.get(activeName) ?? null : null;
  const ranked = geo.provinces
    .filter((p) => valueOf(p) > 0)
    .sort((a, b) => valueOf(b) - valueOf(a))
    .slice(0, 8);
  const totalCustomers = geo.provinces.reduce((s, p) => s + p.customers, 0);
  const topProvince = ranked[0] ?? null;
  const provincesWithData = geo.provinces.filter((p) => p.revenueToman > 0 || p.customers > 0).length;

  const handleProvinceClick = (name: string, city?: string) => {
    if (onSelectProvince) onSelectProvince(name, city);
  };

  return (
    <section
      className="mb-3 rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
      aria-label={title}
    >
      {/* ——— سربرگ: عنوان + سوئیچ متریک + اینپوت رنگی + کلید نمایش ——— */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-black text-ink-900">
          <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {metrics.length > 1 && (
            <div className="flex gap-1.5" role="tablist" aria-label="انتخاب شاخص نقشه">
              {metrics.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={metric === m}
                  onClick={() => setMetric(m)}
                  className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-black transition-colors ${
                    metric === m
                      ? 'bg-brand-600 text-white'
                      : 'bg-cream-100 text-ink-500 hover:bg-cream-200'
                  }`}
                >
                  {m === 'revenue' ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Users className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          )}

          {/* ——— اینپوت رنگی: رنگ استان‌های نقشه (درخواست کاربر) ——— */}
          <label
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-cream-100 pl-3 pr-1.5 text-[11px] font-black text-ink-500 transition-colors hover:bg-cream-200"
            title="انتخاب رنگ استان‌های نقشه"
          >
            <Palette className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">رنگ استان‌های نقشه</span>
            <input
              type="color"
              value={settings.color}
              onChange={(e) => update({ color: e.target.value })}
              className="h-5 w-6 cursor-pointer rounded-md border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
              aria-label="رنگ استان‌های نقشه"
            />
          </label>

          {/* ——— کلید فعال/غیرفعال نمایش روی نقشه (درخواست کاربر) ——— */}
          <label className="flex h-8 items-center gap-1.5 rounded-full bg-cream-100 px-3 text-[11px] font-black text-ink-500">
            نمایش نقشه
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
              aria-label="فعال یا غیرفعال‌کردن نمایش نقشه"
            />
          </label>
        </div>
      </div>

      {/* ——— بدنهٔ نقشه — فقط وقتی کلید نمایش فعال است ——— */}
      {settings.enabled ? (
        <>
          {/* چیپ‌های جمع‌بندی */}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
            {provincesWithData > 0 && (
              <span className="rounded-xl bg-cream-100 px-2.5 py-1 text-ink-500">
                استان‌های دارای داده: {toFaDigits(provincesWithData)}
              </span>
            )}
            {typeof geo.citiesWithSales === 'number' && (
              <span className="rounded-xl bg-cream-100 px-2.5 py-1 text-ink-500">
                شهرهای دارای فروش: {toFaDigits(geo.citiesWithSales)}
              </span>
            )}
            {metric === 'customers' && (
              <span className="rounded-xl bg-cream-100 px-2.5 py-1 text-ink-500">
                مشتریان با موقعیت مشخص: {toFaDigits(totalCustomers)}
              </span>
            )}
            {typeof geo.invoicesTotal === 'number' && (
              <span className="rounded-xl bg-cream-100 px-2.5 py-1 text-ink-500">
                فاکتورهای ثبت‌شده: {toFaDigits(geo.invoicesTotal)}
              </span>
            )}
            {topProvince && (
              <span className="flex items-center gap-1 rounded-xl bg-gold-100 px-2.5 py-1 text-gold-700">
                <Crown className="h-3.5 w-3.5" aria-hidden />
                برترین استان: {topProvince.name} (
                {metric === 'revenue'
                  ? formatCompactToman(topProvince.revenueToman)
                  : `${toFaDigits(topProvince.customers)} مشتری`}
                )
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px]">
            {/* ——— نقشه + لجند + نوار اطلاعات ——— */}
            <div className="min-w-0">
              <svg
                viewBox={IRAN_VIEWBOX}
                className="mx-auto block h-auto w-full max-w-xl"
                role="img"
                aria-label={title}
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
                      fill={isActive ? activeFill : fillColor(data)}
                      stroke={isActive ? activeFill : '#ffffff'}
                      strokeWidth={isActive ? 2.5 : 1.2}
                      className="cursor-pointer outline-none"
                      tabIndex={0}
                      role="button"
                      aria-label={`${prov.fa}${data ? ` — ${formatValue(valueOf(data))}` : ' — بدون داده'}`}
                      onMouseEnter={() => setHover(prov.fa)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(prov.fa)}
                      onBlur={() => setHover(null)}
                      onClick={() => setSelected(selected === prov.fa ? null : prov.fa)}
                    >
                      <title>{`${prov.fa} — ${data ? formatValue(valueOf(data)) : 'بدون داده'}`}</title>
                    </path>
                  );
                })}
              </svg>

              {/* لجند ۶ پله‌ای از رنگ انتخابی */}
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
                    {metric === 'revenue' ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10.5px] font-black text-white"
                        style={{ backgroundColor: settings.color }}
                      >
                        {formatPrice(active.revenueToman)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-cream-200 px-2 py-0.5 text-[10.5px] font-black text-ink-700">
                        {toFaDigits(active.customers)} مشتری
                      </span>
                    )}
                    {active.ordersCount > 0 && (
                      <span className="rounded-full bg-cream-100 px-2 py-0.5 text-[10.5px] font-bold text-ink-500">
                        {toFaDigits(active.ordersCount)} سفارش
                      </span>
                    )}
                    {metric === 'revenue' && active.customers > 0 && (
                      <span className="rounded-full bg-cream-100 px-2 py-0.5 text-[10.5px] font-bold text-ink-500">
                        {toFaDigits(active.customers)} مشتری
                      </span>
                    )}
                  </div>
                  {active.cities.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-ink-400">شهرها:</span>
                      {active.cities.slice(0, 5).map((city) =>
                        onSelectProvince ? (
                          <button
                            key={city}
                            type="button"
                            onClick={() => handleProvinceClick(active.name, city)}
                            className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
                          >
                            {city}
                          </button>
                        ) : (
                          <Link
                            key={city}
                            href={`/admin/users?province=${encodeURIComponent(active.name)}&city=${encodeURIComponent(city)}`}
                            className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
                          >
                            {city}
                          </Link>
                        )
                      )}
                      {active.cities.length > 5 && (
                        <span className="text-[10px] text-ink-300">
                          و {toFaDigits(active.cities.length - 5)} شهر دیگر
                        </span>
                      )}
                    </div>
                  )}
                  {onSelectProvince ? (
                    <button
                      type="button"
                      onClick={() => handleProvinceClick(active.name)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-brand-600 transition-colors hover:text-brand-700"
                    >
                      فیلتر این استان در همین صفحه ›
                    </button>
                  ) : (
                    <Link
                      href={`/admin/users?province=${encodeURIComponent(active.name)}`}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-brand-600 transition-colors hover:text-brand-700"
                    >
                      مشاهدهٔ مشتریان این استان در فهرست کاربران ›
                    </Link>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-center text-[10.5px] text-ink-300 lg:text-right">
                  برای دیدن جزئیات، نشانگر را روی استان‌ها ببرید یا کلیک کنید
                </p>
              )}
            </div>

            {/* ——— رتبه‌بندی برترین استان‌ها ——— */}
            <aside className="min-w-0">
              <h3 className="mb-2 text-[11.5px] font-black text-ink-700">
                برترین استان‌ها ({METRIC_LABELS[metric]})
              </h3>
              {ranked.length === 0 ? (
                <p className="py-3 text-center text-[10.5px] text-ink-300">
                  داده‌ای برای نمایش وجود ندارد
                </p>
              ) : (
                <ul className="space-y-2">
                  {ranked.map((p, i) => {
                    const v = valueOf(p);
                    const share = Math.max(Math.round((v / max) * 100), 3);
                    const isSelected = selected === p.name;
                    return (
                      <li key={p.name}>
                        <button
                          type="button"
                          onClick={() => setSelected(isSelected ? null : p.name)}
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
                              {metric === 'revenue' ? formatCompactToman(v) : toFaDigits(v)}
                            </span>
                          </span>
                          <span
                            className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-cream-100"
                            aria-hidden
                          >
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${share}%`, backgroundColor: settings.color }}
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
        <p className="mt-3 rounded-2xl bg-cream-50 px-3 py-3 text-center text-[11px] font-bold text-ink-400">
          نمایش نقشه غیرفعال است — با کلید «نمایش نقشه» دوباره روشنش کنید
        </p>
      )}
    </section>
  );
}
