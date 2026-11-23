'use client';

import { ChevronLeft, CircleHelp, MapPin, Phone } from 'lucide-react';
import { TopBar } from '@/components/shared/TopBar';
import { useApi } from '@/hooks/use-api';
import { useSettingsStore } from '@/stores/settings-store';
import { useRouterStore } from '@/stores/router-store';
import { BRAND } from '@/lib/config';
import type { SiteContent } from '@/server/services/content.service';

/**
 * دربارهٔ ما (فاز ۳) — ترکیب برند (جدول Setting) + تماس/نماد/لینک (جداول مستقل)
 * بدون تکرار داده: معرفی برند از همان تنظیمات برند می‌آید
 * نقشه موقعیت فروشگاه (درخواست کاربر): اگر مدیر مختصات را در داشبرد ثبت کرده باشد،
 * نقشه OpenStreetMap با نشانگر فروشگاه اینجا نمایش داده می‌شود
 */
export function AboutView() {
  const brand = useSettingsStore((s) => s.brand);
  const mapLat = useSettingsStore((s) => s.mapLat);
  const mapLng = useSettingsStore((s) => s.mapLng);
  const push = useRouterStore((s) => s.push);
  const { data } = useApi<SiteContent>('/api/content');

  const contacts = data?.contacts ?? [];
  const badges = data?.badges ?? [];
  const faqCount = data?.faq.length ?? 0;

  const name = brand?.name || BRAND.name;
  const fullName = brand?.fullName || BRAND.fullName;
  const description = brand?.description || BRAND.description;
  const slogan = brand?.slogan || BRAND.slogan;

  // نقشه فقط وقتی هر دو مختصات معتبر باشند رندر می‌شود
  const lat = Number(mapLat);
  const lng = Number(mapLng);
  const hasMap =
    mapLat !== '' &&
    mapLng !== '' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  const mapEmbed = hasMap
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.004}%2C${lat - 0.0025}%2C${lng + 0.004}%2C${lat + 0.0025}&layer=mapnik&marker=${lat}%2C${lng}`
    : null;
  const mapLink = hasMap
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
    : null;

  return (
    <div>
      <TopBar title="دربارهٔ ما" />

      <div className="px-4 py-4">
        {/* ——— معرفی برند ——— */}
        <section className="rounded-3xl border border-cream-200 bg-white p-5 shadow-card">
          <p className="text-[15px] font-black text-ink-900">{fullName}</p>
          <p className="mt-1 text-[11.5px] font-bold text-brand-600">{slogan}</p>
          <p className="mt-3 whitespace-pre-line text-[12px] leading-6 text-ink-600">
            {description}
          </p>
        </section>

        {/* ——— موقعیت فروشگاه روی نقشه (درخواست کاربر) ——— */}
        {hasMap && mapEmbed && (
          <section className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-black text-ink-800">
              <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
              موقعیت فروشگاه
            </p>
            <div className="overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-card">
              <iframe
                src={mapEmbed}
                title={`نقشه موقعیت ${name}`}
                className="h-56 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[11px] text-ink-500">
                  آدرس دقیق فروشگاه روی نقشه — برای مسیریابی لمس کنید
                </span>
                {mapLink && (
                  <a
                    href={mapLink}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[11px] font-black text-brand-600 underline underline-offset-4"
                  >
                    مسیریابی ↗
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ——— شماره‌های تماس ——— */}
        {contacts.length > 0 && (
          <section className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-black text-ink-800">
              <Phone className="h-4 w-4 text-brand-600" aria-hidden />
              تماس با ما
            </p>
            <div className="space-y-2">
              {contacts.map((c) => (
                <a
                  key={c.id}
                  href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
                  className="flex items-center justify-between rounded-2xl border border-cream-200 bg-white px-4 py-3 shadow-card transition-transform active:scale-[0.99]"
                >
                  <span className="text-[12.5px] font-bold text-ink-700">{c.label}</span>
                  <span dir="ltr" className="font-mono text-[12.5px] font-black text-brand-700">
                    {c.phone}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ——— نمادهای اعتماد ——— */}
        {badges.length > 0 && (
          <section className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-black text-ink-800">
              <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
              نمادهای اعتماد
            </p>
            <div className="flex flex-wrap gap-2.5">
              {badges.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-2 rounded-2xl border border-cream-200 bg-white px-3 py-2 shadow-card"
                >
                  { }
                  <img src={b.imageUrl} alt={b.title} className="h-9 w-9 rounded-lg object-contain" />
                  <span className="text-[11px] font-bold text-ink-600">{b.title}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ——— پرسش‌های متداول ——— */}
        {faqCount > 0 && (
          <button
            type="button"
            onClick={() => push({ view: 'faq' })}
            className="mt-4 flex w-full items-center justify-between rounded-2xl border border-cream-200 bg-white px-4 py-3.5 shadow-card transition-transform active:scale-[0.99]"
          >
            <span className="flex items-center gap-2 text-[12.5px] font-black text-ink-800">
              <CircleHelp className="h-4 w-4 text-brand-600" aria-hidden />
              پرسش‌های متداول
            </span>
            <ChevronLeft className="h-4 w-4 text-ink-300" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
