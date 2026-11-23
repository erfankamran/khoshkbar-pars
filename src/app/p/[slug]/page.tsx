import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Star, ShieldCheck, Truck, ChevronLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { getProductDetail } from '@/server/services/catalog.service';
import { getPublicPageBySlug, type PublicPage } from '@/server/services/content.service';
import { absoluteUrl, baseUrlFromHeaders, safeJsonLd } from '@/lib/site';
import { formatPrice, formatWeight, toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import { pageExcerpt } from '@/lib/markdown';
import { blocksToPlain, parsePageBlocks } from '@/lib/page-blocks';
import { MarkdownContent } from '@/components/shared/MarkdownContent';
import { PageBlocks } from '@/components/shared/PageBlocks';
import { ProductBuyBox } from '@/components/product/BuyBox';
import { ProductReviewsSection } from '@/components/product/ReviewsSection';
import { storefrontUser } from '@/server/lib/customer-pricing';

export const dynamic = 'force-dynamic';

/**
 * صفحه استاندارد محصول و صفحات اختصاصی فروشگاه — /p/[slug]
 *
 * دو نقش با اولویت مشخص:
 * ۱) صفحهٔ اختصاصی ساخته‌شده در پنل (قوانین و شرایط و ...) — slug با
 *    جدول ContentPage مطابقت کند → رندر SSR متن با متادیتای خودش
 *    (درخواست کاربر: آدرس واقعی و ایندکس‌پذیر برای صفحات محتوا)
 * ۲) صفحه استاندارد محصول (فاز ۱۳ — سئو):
 * - رابط فروشگاه اپلیکیشنی و بدون URL جداگانه برای محصولات است؛ موتورهای
 *   جستجو و پلتفرم‌های مقایسه قیمت (ترب/ایمالز) به یک آدرس ایندکس‌پذیر و
 *   اشتراک‌گذاری نیاز دارند — این صفحه همان آدرس رسمی هر محصول است.
 * - کاملاً SSR با متادیتای اختصاصی هر محصول (title/description/canonical/
 *   OpenGraph/Twitter) + داده ساختاریافته JSON-LD (Product + BreadcrumbList).
 * - افزودن به سبد از طریق همان سبد سرور فروشگاه (BuyBox کلاینت) کار می‌کند.
 * هیچ‌کدام نبود → 404 استاندارد.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ review?: string }>;
}

async function getMetaProduct(slug: string) {
  return db.product.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      shortDescription: true,
      description: true,
      isActive: true,
      images: { orderBy: { sortOrder: 'asc' }, select: { url: true, alt: true } },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const base = baseUrlFromHeaders(await headers());

  // ۱) صفحهٔ اختصاصی پنل — اولویت با ContentPage (درخواست کاربر)
  const contentPage = await getPublicPageBySlug(slug);
  if (contentPage) {
    const canonical = absoluteUrl(base, `/p/${contentPage.slug}`);
    // حالت بلوکی → خلاصهٔ سئو از متن بلوک‌ها؛ حالت مارک‌داون → پارسر مارک‌داون
    const description =
      contentPage.editorMode === 'blocks'
        ? blocksToPlain(parsePageBlocks(contentPage.blocks) ?? []).slice(0, 160) ||
          contentPage.title
        : pageExcerpt(contentPage.body);
    return {
      title: contentPage.title,
      description,
      alternates: { canonical },
      robots: { index: true, follow: true },
      openGraph: {
        title: contentPage.title,
        description,
        url: canonical,
        type: 'website',
        locale: 'fa_IR',
        siteName: 'فروشگاه پارس',
      },
    };
  }

  // ۲) محصول
  const p = await getMetaProduct(slug);

  if (!p || !p.isActive) {
    return {
      title: 'محصول یافت نشد',
      robots: { index: false, follow: false },
    };
  }

  const description =
    p.shortDescription ?? p.description?.slice(0, 160) ?? `خرید ${p.title} از فروشگاه پارس`;
  const canonical = absoluteUrl(base, `/p/${p.slug}`);
  const ogImages = p.images.length
    ? p.images.slice(0, 3).map((img) => ({ url: absoluteUrl(base, img.url) }))
    : [{ url: absoluteUrl(base, '/icons/icon-512.png') }];

  return {
    title: p.title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title: p.title,
      description,
      url: canonical,
      type: 'website',
      locale: 'fa_IR',
      siteName: 'فروشگاه پارس',
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: p.title,
      description,
      images: ogImages.map((i) => i.url),
    },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { review } = await searchParams;
  const base = baseUrlFromHeaders(await headers());

  // ۱) صفحهٔ اختصاصی پنل (قوانین و شرایط و ...) — اولویت قبل از محصول
  const contentPage = await getPublicPageBySlug(slug);
  if (contentPage) return <StoreContentPageView page={contentPage} base={base} />;

  // ۲) محصول
  let detail: Awaited<ReturnType<typeof getProductDetail>>;
  try {
    detail = await getProductDetail(slug, (await storefrontUser())?.role);
  } catch (e) {
    // محصول ناموجود در DB یا غیرفعال → 404 استاندارد (درست برای سئو)
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const { product: p, related } = detail;
  const pageUrl = absoluteUrl(base, `/p/${p.slug}`);
  const imageUrls = p.images.map((i) => absoluteUrl(base, i.url));

  const prices = p.variants.map((v) => v.priceToman);
  const minPrice = prices.length ? Math.min(...prices) : 0;

  // ——— داده ساختاریافته Product (schema.org) ———
  // قیمت در schema.org باید با واحد پول ISO باشد؛ تومان واحد ISO نیست،
  // پس مطابق عرف استاندارد قیمت به ریال (×۱۰) با IRR اعلام می‌شود.
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    description: p.shortDescription ?? p.description ?? '',
    image: imageUrls,
    sku: p.skuFirst ?? p.slug,
    category: p.category.title,
    brand: { '@type': 'Brand', name: 'فروشگاه پارس' },
    ...(p.attributes.length
      ? {
          additionalProperty: p.attributes.map((a) => ({
            '@type': 'PropertyValue',
            name: a.k,
            value: a.v,
          })),
        }
      : {}),
    ...(p.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: p.rating,
            reviewCount: p.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url: pageUrl,
      priceCurrency: 'IRR',
      price: minPrice * 10,
      itemCondition: 'https://schema.org/NewCondition',
      availability:
        p.totalStock > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'فروشگاه پارس' },
    },
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
      {
        '@type': 'ListItem',
        position: 2,
        name: p.category.title,
        // لینک‌سازی داخلی — صفحهٔ SSR دسته‌بندی (درخواست کاربر — سئو)
        item: absoluteUrl(base, `/c/${p.category.slug}`),
      },
      { '@type': 'ListItem', position: 3, name: p.title, item: pageUrl },
    ],
  };

  return (
    <div className="min-h-screen bg-cream-50 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />

      {/* ——— هدر ساده ——— */}
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
            <li>
              {/* لینک‌سازی داخلی — صفحهٔ SSR دسته‌بندی (درخواست کاربر) */}
              <Link href={`/c/${p.category.slug}`} className="transition-colors hover:text-brand-700">
                {p.category.title}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="font-bold text-ink-700">{p.title}</li>
          </ol>
        </nav>

        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ——— گالری (SSR با alt کامل) ——— */}
          <section aria-label={`تصاویر ${p.title}`}>
            <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-cream-100">
              <Image
                src={p.images[0]?.url ?? '/icons/icon-512.png'}
                alt={p.images[0]?.alt ?? p.title}
                fill
                sizes="(max-width: 1024px) 100vw, 560px"
                priority
                quality={80}
                className="object-cover"
              />
            </div>
            {p.images.length > 1 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {p.images.map((img) => (
                  <div key={img.url} className="relative aspect-square overflow-hidden rounded-2xl bg-cream-100">
                    <Image
                      src={img.url}
                      alt={img.alt ?? p.title}
                      fill
                      sizes="120px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ——— اطلاعات و خرید ——— */}
          <section>
            <div className="rounded-3xl bg-white p-5 shadow-card">
              <h1 className="text-lg font-black leading-8 text-ink-900">{p.title}</h1>
              <p className="mt-1.5 text-[12.5px] leading-6 text-ink-500">{p.shortDescription}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" aria-hidden />
                  <span className="font-bold text-ink-800">
                    {toFaDigits(p.rating.toFixed(1))}
                  </span>
                  {p.ratingCount > 0 && (
                    <span className="text-ink-400">{toFaDigits(p.ratingCount)} نظر</span>
                  )}
                </span>
                <span className="text-ink-300">|</span>
                <span className="text-ink-500">
                  {toFaDigits(p.salesCount)} فروش موفق
                </span>
                <span className="mr-auto rounded-full bg-brand-50 px-2.5 py-1 font-bold text-brand-700">
                  {p.category.title}
                </span>
              </div>

              {/* ——— جعبه خرید (کلاینت — همان سبد سرور فروشگاه) ——— */}
              <ProductBuyBox
                productId={p.id}
                slug={p.slug}
                title={p.title}
                imageUrl={p.image?.url}
                variants={p.variants}
              />

              <ul className="mt-4 grid grid-cols-1 gap-2 border-t border-cream-200 pt-4 text-[11.5px] text-ink-600 sm:grid-cols-3">
                <li className="flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-brand-600" aria-hidden />
                  ارسال سریع سراسری
                </li>
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden />
                  تضمین تازگی کالا
                </li>
                <li className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 text-brand-600" aria-hidden />
                  ضمانت بازگشت وجه
                </li>
              </ul>
            </div>
          </section>
        </div>

        {/* ——— توضیحات ——— */}
        {p.description && (
          <section className="mt-6 rounded-3xl bg-white p-5 shadow-card">
            <h2 className="text-[13px] font-black text-ink-900">معرفی {p.title}</h2>
            <p className="mt-2.5 whitespace-pre-line text-[13px] leading-7 text-ink-600">
              {p.description}
            </p>
          </section>
        )}

        {/* ——— مشخصات ——— */}
        {p.attributes.length > 0 && (
          <section className="mt-4 rounded-3xl bg-white p-5 shadow-card">
            <h2 className="text-[13px] font-black text-ink-900">مشخصات {p.title}</h2>
            <dl className="mt-3 divide-y divide-cream-200">
              {p.attributes.map((a) => (
                <div key={a.k} className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-[12px] font-bold text-ink-500">{a.k}</dt>
                  <dd className="text-left text-[12.5px] text-ink-800">{a.v}</dd>
                </div>
              ))}
              <div className="flex items-start justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-[12px] font-bold text-ink-500">وزن بسته</dt>
                <dd className="text-left text-[12.5px] text-ink-800">
                  {p.variants.map((v) => formatWeight(v.weightGrams)).join('، ')}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {/* ——— نظرات خریداران + فرم ثبت ——— */}
        <ProductReviewsSection slug={p.slug} reviewId={review} />

        {/* ——— محصولات مرتبط ——— لینک‌سازی داخلی برای سئو ——— */}
        {related.length > 0 && (
          <section className="mt-6">
            <h2 className="px-1 text-[13px] font-black text-ink-900">محصولات مشابه</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/p/${r.slug}`}
                  className="group overflow-hidden rounded-3xl bg-white shadow-card transition-shadow hover:shadow-lg"
                >
                  <div className="relative aspect-square w-full overflow-hidden">
                    <Image
                      src={r.image?.url ?? '/icons/icon-512.png'}
                      alt={r.image?.alt ?? r.title}
                      fill
                      sizes="(max-width: 640px) 46vw, 220px"
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <div className="p-3">
                    <p className="truncate text-[12px] font-bold text-ink-800">{r.title}</p>
                    <p className="mt-1 text-[11px] font-black text-brand-700">
                      از {formatPrice(r.minPriceToman)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-4 text-center text-[10.5px] text-ink-300">
        فروشگاه پارس — از مزرعه تا سفره شما
      </footer>
    </div>
  );
}

/**
 * رندر SSR صفحهٔ اختصاصی فروشگاه (قوانین و شرایط و ...) — درخواست کاربر
 * هم‌شکل با نمای SPA (PageView) ولی در URL واقعی و ایندکس‌پذیر؛
 * متن مارک‌داون با کامپوننت مشترک MarkdownContent رندر می‌شود
 * (بدون HTML خام — امن) و خلاصهٔ سئو با pageExcerpt از پارسر مارک‌داون.
 */
function StoreContentPageView({ page, base }: { page: PublicPage; base: string }) {
  const pageUrl = absoluteUrl(base, `/p/${page.slug}`);

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
      { '@type': 'ListItem', position: 2, name: page.title, item: pageUrl },
    ],
  };

  return (
    <div className="min-h-screen bg-cream-50 pb-16">
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

      <main className="mx-auto max-w-3xl px-4">
        {/* ——— مسیر راهنما ——— */}
        <nav aria-label="مسیر صفحه" className="pt-4 text-[11px] text-ink-400">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="transition-colors hover:text-brand-700">
                فروشگاه
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="font-bold text-ink-700">{page.title}</li>
          </ol>
        </nav>

        {/* ——— متن صفحه ——— */}
        <article className="mt-4 rounded-3xl bg-white p-5 shadow-card">
          <h1 className="text-lg font-black leading-8 text-ink-900">{page.title}</h1>
          <p className="mt-1 text-[10px] text-ink-300">
            آخرین به‌روزرسانی: {formatJalaliDate(page.updatedAt)}
          </p>

        {/* ——— محتوای صفحه — بلوک‌ها یا مارک‌داون (صفحه‌ساز درخواست کاربر) ——— */}
        <div className="mt-4">
          {page.editorMode === 'blocks' && parsePageBlocks(page.blocks)?.length ? (
            <PageBlocks blocks={parsePageBlocks(page.blocks)!} />
          ) : (
            <MarkdownContent source={page.body} variant="ssr" />
          )}
        </div>
        </article>
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-4 text-center text-[10.5px] text-ink-300">
        فروشگاه پارس — از مزرعه تا سفره شما
      </footer>
    </div>
  );
}
