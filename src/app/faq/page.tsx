import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ChevronLeft, CircleHelp, MessageCircleHeart, ShieldCheck, Truck } from 'lucide-react';
import { db } from '@/lib/db';
import { absoluteUrl, baseUrlFromHeaders, safeJsonLd } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * صفحهٔ استاندارد پرسش‌های متداول /faq (فاز سئو + تکمیل FAQ)
 *
 * - پرسش‌های متداول تا پیش از این فقط به‌صورت نمای داخلی فروشگاه (بدون URL)
 *   نمایش داده می‌شد؛ این صفحه همان محتوای FaqItem را با آدرس ایندکس‌پذیر و
 *   دادهٔ ساختاریافته JSON-LD (FAQPage) منتشر می‌کند.
 * - منبع محتوا همان جدول FaqItem است که مدیر از پنل «محتوا» مدیریت می‌کند —
 *   هیچ محتوای تکراری/موازی‌ای ساخته نمی‌شود.
 */

export async function generateMetadata(): Promise<Metadata> {
  const base = baseUrlFromHeaders(await headers());
  return {
    title: 'پرسش‌های متداول | فروشگاه پارس',
    description:
      'پاسخ پرسش‌های رایج درباره ارسال سفارش، نگهداری مغزها، پرداخت، مرجوعی و پیگیری سفارش در فروشگاه پارس.',
    alternates: { canonical: absoluteUrl(base, '/faq') },
    openGraph: {
      title: 'پرسش‌های متداول | فروشگاه پارس',
      description: 'پاسخ پرسش‌های رایج خرید مغز و خشکبار از فروشگاه پارس',
      url: absoluteUrl(base, '/faq'),
      type: 'website',
    },
  };
}

export default async function FaqPage() {
  const faq = await db.faqItem.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, question: true, answer: true },
  });

  const base = baseUrlFromHeaders(await headers());

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  return (
    <main dir="rtl" className="mx-auto min-h-screen max-w-2xl bg-cream-50 px-4 pb-12 pt-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      <Link
        href="/"
        className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-700 transition-colors hover:text-brand-800"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        بازگشت به فروشگاه پارس
      </Link>

      <header className="mt-4 rounded-3xl border border-cream-200 bg-white p-5 shadow-card">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <CircleHelp className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-3 text-xl font-black text-ink-900">پرسش‌های متداول</h1>
        <p className="mt-1.5 text-[13px] leading-7 text-ink-500">
          پاسخ رایج‌ترین پرسش‌های شما درباره خرید از فروشگاه پارس — اگر پاسخ‌تان اینجا نبود، با
          پشتیبانی تماس بگیرید.
        </p>
      </header>

      {faq.length === 0 ? (
        <p className="mt-4 rounded-3xl border border-dashed border-cream-300 bg-white/60 p-6 text-center text-[13px] text-ink-400">
          هنوز پرسشی ثبت نشده است.
        </p>
      ) : (
        <section className="mt-4 space-y-2.5" aria-label="فهرست پرسش‌های متداول">
          {faq.map((f) => (
            <details
              key={f.id}
              className="group rounded-3xl border border-cream-200 bg-white shadow-card"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
                <span className="text-[13.5px] font-black leading-7 text-ink-900">{f.question}</span>
                <ChevronLeft
                  className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-open:-rotate-90"
                  aria-hidden
                />
              </summary>
              <p className="border-t border-cream-100 px-4 py-3.5 text-[12.5px] leading-7 text-ink-600">
                {f.answer}
              </p>
            </details>
          ))}
        </section>
      )}

      <section className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
          <Truck className="h-5 w-5 text-brand-600" aria-hidden />
          <p className="mt-2 text-[12px] font-black text-ink-900">ارسال سریع و بسته‌بندی امن</p>
          <p className="mt-1 text-[11px] leading-6 text-ink-500">
            همهٔ بسته‌ها با استاندارد مغزشاپ پارس پوشش داده و ارسال می‌شوند.
          </p>
        </div>
        <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
          <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden />
          <p className="mt-2 text-[12px] font-black text-ink-900">تضمین رضایت</p>
          <p className="mt-1 text-[11px] leading-6 text-ink-500">
            اگر راضی نبودید، تعویض یا بازگشت وجه — بی‌معطلی.
          </p>
        </div>
      </section>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] font-bold text-ink-400">
        <MessageCircleHeart className="h-3.5 w-3.5" aria-hidden />
        فروشگاه پارس — خرید مغز و خشکبار تازه
      </p>
    </main>
  );
}
