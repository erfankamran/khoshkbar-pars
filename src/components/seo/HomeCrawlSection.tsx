import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { absoluteUrl, baseUrlFromHeaders, safeJsonLd } from '@/lib/site';
import { getBrandTheme } from '@/server/services/content.service';
import { formatPrice, toFaDigits } from '@/lib/fa';

/**
 * بلاک SSR قابل خcrawl در انتهای صفحهٔ اصلی — درخواست کاربر (سئو)
 *
 * فروشگاه اپلیکیشنی SPA است (AppShell با h-dvh و اسکرول داخلی) و ربات‌های
 * هوش مصنوعی جاوااسکریپت اجرا نمی‌کنند؛ این بخش با HTML سادهٔ SSR بعد از
 * قاب اپلیکیشن سرو می‌شود — هم برای کاربر (اسکرول به پایین) و هم برای
 * ربات‌ها: معرفی برند، لینک همهٔ دسته‌بندی‌ها (/c/[slug])، محصولات پرفروش
 * (/p/[slug]) و صفحات راهنما. خطای دیتابیس کل صفحه را نمی‌شکند (null).
 */

const FALLBACK_BRAND = {
  fullName: 'فروشگاه پارس',
  description: 'خرید آنلاین خشکبار، آجیل، مغزها و محصولات طبیعی — تازه از مزرعه تا سفره شما',
};

interface FeaturedProduct {
  slug: string;
  title: string;
  images: { url: string; alt: string | null }[];
  variants: { priceToman: number; stock: number }[];
}

export async function HomeCrawlSection() {
  let brand = FALLBACK_BRAND;
  let categories: {
    slug: string;
    title: string;
    _count: { products: number };
  }[] = [];
  let featured: FeaturedProduct[] = [];
  let pages: { slug: string; title: string }[] = [];
  let faqCount = 0;
  // مقالات وبلاگ — لینک‌سازی داخلی سئو (درخواست کاربر)
  let posts: { slug: string; title: string; excerpt: string | null }[] = [];

  try {
    const [brandRes, catsRes, productsRes, pagesRes, faqRes, postsRes] = await Promise.all([
      getBrandTheme(),
      db.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          slug: true,
          title: true,
          _count: { select: { products: { where: { isActive: true } } } },
        },
      }),
      // پرفروش‌ترین‌ها برای صفحهٔ اصلی
      db.product.findMany({
        where: { isActive: true },
        orderBy: { salesCount: 'desc' },
        take: 8,
        select: {
          slug: true,
          title: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true, alt: true } },
          variants: { where: { isActive: true }, select: { priceToman: true, stock: true } },
        },
      }),
      db.contentPage.findMany({
        where: { isActive: true, showInFooter: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, title: true },
      }),
      db.faqItem.count({ where: { isActive: true } }),
      // نوشته‌های منتشرشده وبلاگ (درخواست کاربر — ورودی سئو)
      db.post.findMany({
        where: { isPublished: true },
        orderBy: { publishedAt: 'desc' },
        take: 4,
        select: { slug: true, title: true, excerpt: true },
      }),
    ]);

    brand = {
      fullName: brandRes.fullName || FALLBACK_BRAND.fullName,
      description: brandRes.description || FALLBACK_BRAND.description,
    };
    categories = catsRes.filter((c) => c._count.products > 0);
    featured = productsRes;
    pages = pagesRes;
    faqCount = faqRes;
    posts = postsRes;
  } catch {
    // دیتابیس در دسترس نیست → بلاک سئو رندر نمی‌شود ولی فروشگاه سالم می‌ماند
    return null;
  }

  const base = baseUrlFromHeaders(await headers());

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'محصولات پرفروش فروشگاه پارس',
    itemListElement: featured.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(base, `/p/${p.slug}`),
      name: p.title,
      ...(p.images[0] ? { image: absoluteUrl(base, p.images[0].url) } : {}),
    })),
  };

  const minPrice = (p: FeaturedProduct) => {
    const prices = p.variants.map((v) => v.priceToman);
    return prices.length ? Math.min(...prices) : 0;
  };

  return (
    <section
      aria-label="معرفی فروشگاه پارس"
      className="mx-auto max-w-3xl border-t border-cream-200 bg-cream-50 px-4 pb-14 pt-6"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }}
      />

      {/* ——— معرفی برند — h1 واقعی صفحه برای ربات‌ها ——— */}
      <div className="rounded-3xl border border-cream-200 bg-white p-5 shadow-card">
        <h1 className="text-lg font-black leading-8 text-ink-900">
          {brand.fullName} — خرید مغز و خشکبار تازه
        </h1>
        <p className="mt-2 text-[13px] leading-7 text-ink-500">{brand.description}</p>
        <p className="mt-1.5 text-[11.5px] leading-6 text-ink-400">
          سفارش‌ها تازه بسته‌بندی و با ارسال سراسری به دست شما می‌رسند؛ برای دیدن قیمت‌های به‌روز،
          هر محصول صفحهٔ اختصاصی خودش را دارد.
        </p>
      </div>

      {/* ——— دسته‌بندی‌ها — لینک به صفحات SSR /c/[slug] ——— */}
      {categories.length > 0 && (
        <>
          <h2 className="mt-6 px-1 text-[13px] font-black text-ink-900">دسته‌بندی‌های فروشگاه</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={`/c/${c.slug}`}
                className="rounded-2xl border border-cream-200 bg-white p-3.5 shadow-card transition-shadow hover:shadow-lg"
              >
                <p className="text-[12.5px] font-black text-ink-800">{c.title}</p>
                <p className="mt-1 text-[10.5px] text-ink-400">
                  {toFaDigits(c._count.products)} محصول
                </p>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* ——— محصولات پرفروش — لینک به صفحات SSR /p/[slug] ——— */}
      {featured.length > 0 && (
        <>
          <h2 className="mt-6 px-1 text-[13px] font-black text-ink-900">محصولات پرفروش</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {featured.map((p) => (
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
                    sizes="(max-width: 640px) 46vw, 220px"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <p className="truncate text-[12px] font-bold text-ink-800">{p.title}</p>
                  <p className="mt-1 text-[11px] font-black text-brand-700">
                    {minPrice(p) > 0 ? `از ${formatPrice(minPrice(p))}` : '—'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* ——— مقالات وبلاگ — لینک به صفحات SSR /blog/[slug] (درخواست کاربر — سئو) ——— */}
      {posts.length > 0 && (
        <>
          <h2 className="mt-6 px-1 text-[13px] font-black text-ink-900">مجلهٔ پارس — مقالات خشکبار و سلامت</h2>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="rounded-2xl border border-cream-200 bg-white p-4 shadow-card transition-shadow hover:shadow-lg"
              >
                <p className="text-[12.5px] font-black leading-6 text-ink-800">{post.title}</p>
                {post.excerpt && (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink-400">{post.excerpt}</p>
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      {/* ——— صفحات راهنما ——— */}
      <h2 className="mt-6 px-1 text-[13px] font-black text-ink-900">اطلاعات و راهنما</h2>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <li>
          <Link
            href="/blog"
            className="block rounded-2xl border border-cream-200 bg-white px-3.5 py-3 text-[12px] font-bold text-ink-700 shadow-card transition-colors hover:text-brand-700"
          >
            وبلاگ پارس — مقالات و راهنمای خرید
          </Link>
        </li>
        <li>
          <Link
            href="/faq"
            className="block rounded-2xl border border-cream-200 bg-white px-3.5 py-3 text-[12px] font-bold text-ink-700 shadow-card transition-colors hover:text-brand-700"
          >
            پرسش‌های متداول
            {faqCount > 0 && (
              <span className="mr-1.5 text-[10px] font-normal text-ink-400">
                ({toFaDigits(faqCount)} پرسش)
              </span>
            )}
          </Link>
        </li>
        {pages.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/p/${p.slug}`}
              className="block rounded-2xl border border-cream-200 bg-white px-3.5 py-3 text-[12px] font-bold text-ink-700 shadow-card transition-colors hover:text-brand-700"
            >
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
