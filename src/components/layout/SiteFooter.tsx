'use client';

import {
  BadgeCheck,
  ChevronLeft,
  ExternalLink,
  Landmark,
  Lock,
  Nut,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useSettingsStore } from '@/stores/settings-store';
import { useRouterStore } from '@/stores/router-store';
import { BRAND } from '@/lib/config';
import { FooterCrest } from '@/components/layout/FooterCrest';
import type { SiteContent, SiteContentServiceLinkKey } from '@/server/services/content.service';

/**
 * فوتر فروشگاه — بازطراحی بر پایهٔ بازخورد کاربر (۱۴۰۵/۰۸/۲۰):
 *
 *   ۱. لبهٔ بالایی: وکتور دست‌ساز «محصولات در ظروف اصیل ایرانی»
 *      (FooterCrest) که روی لبهٔ کامپوننت می‌نشیند با z-index بالاتر —
 *      جایگزین تصویر بیت‌مپی قبلی
 *   ۲. معرفی برند (نام، شعار، توضیح) ← جدول Setting (کلیدهای brand.*)
 *   ۳. ستون «دسترسی سریع» و زیر آن «تماس با ما» — زیر هم، بدون
 *      overflow-hidden (بازخورد کاربر) ← FooterLink / Page / ContactNumber
 *   ۴. جای نمادهای اعتماد در انتهای فوتر: ۴ جایگاه افقی هم‌اندازه —
 *      اول نمادهای جدول TrustBadge از /api/content، جایگاه‌های خالی با
 *      نشانگر «اینماد / ساماندهی / پرداخت امن / اصالت کالا» پر می‌شود
 *   ۵. خط پایان: خرید امن + کپی‌رایت با سال شمسی
 *
 * نوار مزیت‌ها (ارسال سریع و ...) از فوتر خارج شد و حالا کامپوننت مستقل
 * FeatureStrip بعد از «پرسش‌های متداول» است. محتوا می‌تواند از بیرون پاس
 * داده شود؛ در غیر این صورت خودش می‌خواند.
 */

/** چهار جایگاه پیش‌فرض نمادهای اعتماد — با افزودن نماد از پنل جایگزین می‌شوند */
const PLACEHOLDER_BADGES = [
  { id: 'ph-enamad', title: 'نماد اعتماد الکترونیکی (اینماد)', short: 'اینماد', Icon: ShieldCheck },
  { id: 'ph-samandehi', title: 'نشان ملی ساماندهی رسانه‌های دیجیتال', short: 'ساماندهی', Icon: Landmark },
  { id: 'ph-payment', title: 'درگاه پرداخت امن', short: 'پرداخت امن', Icon: Lock },
  { id: 'ph-authentic', title: 'ضمانت اصالت و تازگی کالا', short: 'اصالت کالا', Icon: BadgeCheck },
] as const;

type BadgeSlot = {
  key: string;
  title: string;
  imageUrl?: string;
  linkUrl?: string | null;
  short?: string;
  Icon?: LucideIcon;
};

/** سال شمسی برای خط کپی‌رایت — با جایگزین میلادی در نبود پشتیبانی ICU */
function jalaliYear(): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(
      new Date(),
    );
  } catch {
    return String(new Date().getFullYear());
  }
}

export function SiteFooter({ content }: { content?: SiteContent }) {
  const brand = useSettingsStore((s) => s.brand);
  const push = useRouterStore((s) => s.push);
  // path=null → درخواست زده نمی‌شود (محتوا از prop می‌آید)
  const { data: fetched } = useApi<SiteContent>(content ? null : '/api/content');
  const data = content ?? fetched;

  // لینک‌های بیرونی از env (درخواست کاربر) — اینماد/ساماندهی روی جایگاه نماد
  // و ترب/ایمالز به‌صورت لینک دسترسی سریع نشان داده می‌شوند
  const serviceUrl = (key: SiteContentServiceLinkKey): string | null =>
    data?.serviceLinks?.find((l) => l.key === key)?.url ?? null;

  // لینک «پرسش‌های متداول» همیشه و فقط یک‌بار در فوتر هست؛
  // ردیف‌های هم‌مسیر در جدول FooterLink فیلتر می‌شوند تا تکرار نشود
  const contacts = data?.contacts ?? [];
  const badges = data?.badges ?? [];
  const footerLinks = (data?.footerLinks ?? []).filter((l) => l.url !== '/faq');
  // صفحات اختصاصی ساخته‌شده در پنل (درخواست کاربر)
  const pages = data?.pages ?? [];

  const name = brand?.name || BRAND.name;
  const slogan = brand?.slogan || BRAND.slogan;
  const description = brand?.description || BRAND.description;

  // لینک‌های داخلی با روتر داخلی، لینک‌های خارجی با <a>
  const openLink = (url: string) => {
    if (url.startsWith('/') && !url.startsWith('//')) {
      if (url === '/faq') {
        push({ view: 'faq' });
        return;
      }
      if (url === '/about') {
        push({ view: 'about' });
        return;
      }
      // صفحهٔ اختصاصی /p/<slug> (درخواست کاربر)
      const pageMatch = /^\/p\/([a-z0-9-]+)$/.exec(url);
      if (pageMatch) {
        push({ view: 'page', params: { slug: pageMatch[1] }, key: `page:${pageMatch[1]}` });
        return;
      }
      // مسیرهای داخلی دیگر → نمای حساب (امن‌ترین مقصد موجود)
      push({ view: 'account' });
      return;
    }
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      /* باز شدن تب خارجی اجباری نیست */
    }
  };

  // فهرست یکپارچهٔ «دسترسی سریع» — ثابت + دادهٔ پنل، بدون تکرار
  const quickLinks: { key: string; title: string; onClick: () => void; external?: boolean }[] = [
    { key: 'ql-faq', title: 'پرسش‌های متداول', onClick: () => push({ view: 'faq' }) },
    { key: 'ql-blog', title: 'وبلاگ پارس', onClick: () => push({ view: 'blog' }) },
    ...footerLinks.map((l) => ({
      key: `fl-${l.id}`,
      title: l.title,
      onClick: () => openLink(l.url),
      external: !l.url.startsWith('/'),
    })),
    ...pages.map((p) => ({
      key: `pg-${p.id}`,
      title: p.title,
      onClick: () => push({ view: 'page', params: { slug: p.slug }, key: `page:${p.slug}` }),
    })),
    // لینک‌های env (درخواست کاربر) — فقط وقتی متغیر محیطی مقدار دارد ظاهر می‌شوند
    ...(serviceUrl('torob')
      ? [{ key: 'svc-torob', title: 'فروشگاه ما در ترب', onClick: () => openLink(serviceUrl('torob')!), external: true }]
      : []),
    ...(serviceUrl('emalls')
      ? [{ key: 'svc-emalls', title: 'فروشگاه ما در ایمالز', onClick: () => openLink(serviceUrl('emalls')!), external: true }]
      : []),
  ];

  // ۴ جایگاه نماد اعتماد: اول دادهٔ پنل، بعد جایگاه‌های پیش‌فرض — دقیقاً ۴ تا
  // لینک env (اینماد/ساماندهی درخواست کاربر) فقط روی جایگاه پیش‌فرض همان نماد
  // می‌نشیند؛ اگر نمادِ همان نماد از پنل ثبت شده باشد، دادهٔ پنل اولویت دارد
  const badgeSlots: BadgeSlot[] = [
    ...badges.slice(0, 4).map((b) => ({
      key: `db-${b.id}`,
      title: b.title,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl,
    })),
    ...PLACEHOLDER_BADGES.slice(0, Math.max(0, 4 - badges.length)).map((p) => ({
      key: p.id,
      title: p.title,
      short: p.short,
      Icon: p.Icon,
      linkUrl:
        p.id === 'ph-enamad'
          ? serviceUrl('enamad')
          : p.id === 'ph-samandehi'
            ? serviceUrl('samandehi')
            : undefined,
    })),
  ].slice(0, 4);

  return (
    <footer
      className="relative mt-16 border-t border-gold-400/30 bg-brand-950"
      aria-label="فوتر فروشگاه"
    >
      {/* ——— ۱) وکتور لبهٔ بالایی: محصولات در ظروف اصیل ایرانی (z-index بالاتر) ——— */}
      <FooterCrest />

      <div className="px-5 pb-6 pt-12 sm:pt-14">
        {/* ——— ۲) معرفی برند ——— */}
        <div className="flex flex-col items-center text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 text-sm font-black text-gold-300 shadow-card ring-1 ring-brand-600/40">
            پ
          </span>
          <p className="mt-2.5 text-[15px] font-black tracking-wide text-cream-50">{name}</p>
          <p className="text-gradient-gold mt-0.5 text-[11px] font-black">{slogan}</p>
          <p className="mt-3 max-w-md text-[11.5px] leading-6 text-brand-100/70">
            {description}
          </p>
        </div>

        {/* ——— ۳) دسترسی سریع — تمام‌عرض، بدون بریدگی متن ——— */}
        <nav aria-label="دسترسی سریع" className="mt-7">
          <h3 className="flex items-center gap-2 text-[12.5px] font-black text-cream-50">
            <span aria-hidden className="h-4 w-1 rounded-full bg-gold-400" />
            دسترسی سریع
          </h3>
          <ul className="mt-2 grid grid-cols-1 gap-x-6">
            {quickLinks.map((l) => (
              <li key={l.key}>
                <button
                  type="button"
                  onClick={l.onClick}
                  className="group flex w-full items-center gap-1.5 rounded-lg py-1.5 text-start transition-colors hover:text-gold-300"
                >
                  <ChevronLeft
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 text-gold-500/70 transition-transform group-hover:-translate-x-0.5"
                  />
                  <span className="flex-1 text-[12px] font-bold leading-5 text-brand-100/85 group-hover:text-gold-300">
                    {l.title}
                  </span>
                  {l.external && (
                    <ExternalLink className="h-3 w-3 shrink-0 text-brand-300/60" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* ——— تماس با ما — زیر بخش لینک‌ها (بازخورد کاربر) ——— */}
        {contacts.length > 0 && (
          <div aria-label="تماس با ما" className="mt-6">
            <h3 className="flex items-center gap-2 text-[12.5px] font-black text-cream-50">
              <span aria-hidden className="h-4 w-1 rounded-full bg-gold-400" />
              تماس با ما
            </h3>
            <div className="mt-3 space-y-2">
              {contacts.map((c) => (
                <a
                  key={c.id}
                  href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-brand-700/50 bg-brand-900/50 px-3 py-2.5 transition-colors hover:border-gold-400/40"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-brand-800 text-gold-400 ring-1 ring-brand-600/40">
                      <Phone className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="text-[12px] font-bold text-brand-100/85">{c.label}</span>
                  </span>
                  <span dir="ltr" className="font-mono text-[12.5px] font-black text-gold-300">
                    {c.phone}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ——— ۴) نمادهای اعتماد — ۴ جایگاه افقی هم‌اندازه در انتهای فوتر ——— */}
        <div className="mt-7" aria-label="نمادهای اعتماد">
          <div className="grid grid-cols-4 gap-2.5">
            {badgeSlots.map((s) => {
              const tile = (
                <div className="flex aspect-[5/4] w-full flex-col items-center justify-center gap-1.5 rounded-xl bg-white p-1.5 shadow-card">
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt={s.title}
                      loading="lazy"
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <>
                      {s.Icon && <s.Icon className="h-5 w-5 text-brand-300" aria-hidden />}
                      <span className="text-center text-[9px] font-black leading-3 text-stone-400">
                        {s.short}
                      </span>
                    </>
                  )}
                  <span className="sr-only">{s.title}</span>
                </div>
              );
              return s.linkUrl ? (
                <a
                  key={s.key}
                  href={s.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-transform active:scale-95"
                >
                  {tile}
                </a>
              ) : (
                <div key={s.key}>{tile}</div>
              );
            })}
          </div>
        </div>

        {/* ——— ۵) خط پایان ——— */}
        <div className="mt-6 border-t border-dashed border-brand-700/60 pt-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[10.5px] font-bold text-brand-200/80">
            <ShieldCheck className="h-3.5 w-3.5 text-gold-400" aria-hidden />
            خرید امن با تضمین بازگشت کالا
          </p>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-brand-300/60">
            <Nut className="h-3 w-3" aria-hidden />
            © {jalaliYear()} {name} — همهٔ حقوق محفوظ است
          </p>
        </div>
      </div>
    </footer>
  );
}
