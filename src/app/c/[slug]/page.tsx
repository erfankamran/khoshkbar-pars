import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { absoluteUrl, baseUrlFromHeaders, safeJsonLd } from '@/lib/site';
import { formatPrice, toFaDigits } from '@/lib/fa';
import { customerVariants, storefrontUser } from '@/server/lib/customer-pricing';

export const dynamic = 'force-dynamic';

/**
 * صفحهٔ استاندارد SSR هر دسته‌بندی — /c/[slug] (درخواست کاربر — سئو)
 *
 * فروشگاه رابط اپلیکیشنی SPA دارد که ربات‌ها (مخصوصاً ربات‌های هوش مصنوعی
 * بدون اجرای جاوااسکریپت) نمی‌بینند؛ این صفحه همان فهرست محصولات هر دسته
 * را با آدرس ایندکس‌پذیر، HTML سادهٔ SSR، متادیتای خودش و دادهٔ ساختاریافته
 * ItemList/BreadcrumbList منتشر می‌کند — نقطهٔ ورود خزش به همهٔ محصولات
 * هر دسته + لینک‌سازی داخلی قوی (از محصول به دسته و برعکس).
 * دستهٔ ناموجود/غیرفعال → 404 استاندارد.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getCategoryPage(slug: string, role?: string) {
  const category = await db.category.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      description: true,
      isActive: true,
      products: {
        where: { isActive: true },
        orderBy: { salesCount: 'desc' },
        select: {
          slug: true,
          title: true,
          shortDescription: true,
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: { url: true, alt: true },
          },
          variants: {
            where: { isActive: true },
            select: { priceToman: true, stock: true, isWholesale: true },
          },
        },
      },
    },
  });
  return category ? { ...category, products: category.products.map((product) => ({ ...product, variants: customerVariants(product.variants, role) })) } : null;
}

type CategoryPageData = NonNullable<Awaited<ReturnType<typeof getCategoryPage>>>;

function productMinPrice(p: CategoryPageData['products'][number]): number {
  const prices = p.variants.map((v) => v.priceToman);
  return prices.length ? Math.min(...prices) : 0;
}

function productInStock(p: CategoryPageData['products'][number]): boolean {
  return p.variants.some((v) => v.stock > 0);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const cat = await getCategoryPage(slug);

  if (!cat || !cat.isActive) {
    return {
      title: 'دسته‌بندی یافت نشد',
      robots: { index: false, follow: false },
    };
  }

  const base = baseUrlFromHeaders(await headers());
  const canonical = absoluteUrl(base, `/c/${cat.slug}`);
  const description =
    cat.description ??
    `خرید انواع ${cat.title} تازه از فروشگاه پارس — ${toFaDigits(cat.products.length)} محصول با ارسال سراسری، بسته‌بندی امن و ضمانت تازگی.`;

  return {
    title: `خرید ${cat.title}`,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title: `خرید ${cat.title} | فروشگاه پارس`,
      description,
      url: canonical,
      type: 'website',
      locale: 'fa_IR',
      siteName: 'فروشگاه پارس',
      images: [{ url: absoluteUrl(base, '/icons/icon-512.png') }],
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const cat = await getCategoryPage(slug, (await storefrontUser())?.role);

  // دستهٔ ناموجود یا غیرفعال → 404 استاندارد (درست برای سئو)
  if (!cat || !cat.isActive) notFound();

  const base = baseUrlFromHeaders(await headers());
  const pageUrl = absoluteUrl(base, `/c/${cat.slug}`);

  const inStock = cat.products.filter(productInStock);
  const intro =
    cat.description ??
    `انواع ${cat.title} تازه و باکیفیت فروشگاه پارس — برداشت فصل، بسته‌بندی امن و ارسال سراسری. برای قیمت و وزن‌های به‌روز، صفحهٔ هر محصول را ببینید.`;

  // ——— داده ساختاریافته ———
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: cat.title,
    numberOfItems: cat.products.length,
    itemListElement: cat.products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(base, `/p/${p.slug}`),
      name: p.title,
      ...(p.images[0] ? { image: absoluteUrl(base, p.images[0].url) } : {}),
    })),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'فروشگاه پارس',
        item: absoluteUrl(base, '/'),
      },
      { '@type': 'ListItem', position: 2, name: cat.title, item: pageUrl },
    ],
  };

  return (
    <div className="min-h-screen bg-cream-50 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />

      {/* ——— هدر ساده — هم‌خانواده با صفحهٔ محصول ——— */}
      <header className="border-b border-cream-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-950 text-base font-black text-gold-300"
            aria-label="فروشگاه پارس"
          >
            پ
          </Link>
          <div className="min-w-0">
            <p className="text-[13px] font-black text-ink-900">فروشگاه پارس</p>
            <p className="text-[10px] text-ink-400">خشکبار و مغزهای تازه</p>
          </div>
          <Link
            href="/"
            className="mr-auto flex items-center gap-1 rounded-xl border border-cream-200 px-3 py-2 text-[11px] font-bold text-ink-600 transition-colors hover:bg-cream-100"
          >
            بازگشت به فروشگاه
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        {/* ——— مسیر راهنما ——— */}
        <nav aria-label="مسیر صفحه" className="pt-4 text-[11px] text-ink-400">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="transition-colors hover:text-brand-700">
                فروشگاه
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="font-bold text-ink-700">{cat.title}</li>
          </ol>
        </nav>

        {/* ——— سرصفحهٔ دسته ——— */}
        <section className="mt-4 rounded-3xl bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg font-black leading-8 text-ink-900">خرید {cat.title}</h1>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
              {toFaDigits(cat.products.length)} محصول
            </span>
          </div>
          <p className="mt-2 text-[12.5px] leading-7 text-ink-500">{intro}</p>
        </section>

        {/* ——— فهرست محصولات (SSR — HTML ساده برای ربات‌ها) ——— */}
        {cat.products.length === 0 ? (
          <p className="mt-4 rounded-3xl border border-dashed border-cream-300 bg-white/60 p-8 text-center text-[13px] text-ink-400">
            فعلاً محصولی در این دسته نیست.
          </p>
        ) : (
          <section aria-label={`محصولات ${cat.title}`} className="mt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {cat.products.map((p) => (
                <Link
                  key={p.slug}
                  href={`/p/${p.slug}`}
                  className="group overflow-hidden rounded-3xl bg-white shadow-card transition-shadow hover:shadow-lg"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-cream-100">
                    <Image
                      src={p.images[0]?.url ?? '/icons/icon-512.png'}
                      alt={p.images[0]?.alt ?? p.title}
                      fill
                      sizes="(max-width: 640px) 46vw, (max-width: 1024px) 31vw, 260px"
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                    {!productInStock(p) && (
                      <span className="absolute right-2.5 top-2.5 rounded-full bg-ink-900/85 px-2.5 py-1 text-[10px] font-black text-cream-50">
                        ناموجود
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-[12px] font-bold text-ink-800">{p.title}</p>
                    <p className="mt-1 text-[11px] font-black text-brand-700">
                      {productMinPrice(p) > 0 ? `از ${formatPrice(productMinPrice(p))}` : '—'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ——— عرضه — متن قابل خcrawl برای ربات‌ها ——— */}
        {inStock.length > 0 && (
          <section className="mt-6 rounded-3xl bg-white p-5 shadow-card">
            <h2 className="text-[13px] font-black text-ink-900">خرید {cat.title} از فروشگاه پارس</h2>
            <p className="mt-2 text-[12.5px] leading-7 text-ink-600">
              در این صفحه می‌توانید {cat.title} فروشگاه پارس را با قیمت به‌روز ببینید:
              {' '}
              {inStock
                .slice(0, 12)
                .map((p) => p.title)
                .join('، ')}
              {' '}
              و سایر محصولات این دسته. همهٔ محصولات پس از سفارش، تازه بسته‌بندی و ارسال می‌شوند.
            </p>
          </section>
        )}
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-4 text-center text-[10.5px] text-ink-300">
        فروشگاه پارس — از مزرعه تا سفره شما
      </footer>
    </div>
  );
}
