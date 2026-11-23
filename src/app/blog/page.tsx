import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { CalendarDays, ChevronLeft, Eye, Newspaper } from 'lucide-react';
import { listPublishedPosts } from '@/server/services/blog.service';
import { absoluteUrl, baseUrlFromHeaders, safeJsonLd } from '@/lib/site';
import { formatJalaliDate } from '@/lib/jalali';
import { toFaDigits } from '@/lib/fa';

export const dynamic = 'force-dynamic';

/**
 * صفحهٔ استاندارد وبلاگ — /blog (درخواست کاربر — ورودی سئو)
 *
 * - SSR کامل با متادیتای اختصاصی + JSON-LD (Blog + BreadcrumbList)
 * - فهرست نوشته‌های منتشرشده — جدیدترین اول
 * - این آدرس در sitemap.xml و robots و فید RSS معرفی می‌شود
 * - در منوی موبایل، تب «وبلاگ» جایگزین علاقه‌مندی شده است
 */

export async function generateMetadata(): Promise<Metadata> {
  const base = baseUrlFromHeaders(await headers());
  const canonical = absoluteUrl(base, '/blog');
  const description =
    'مقالات و راهنماهای فروشگاه پارس دربارهٔ آجیل، خشکبار و تغذیهٔ سالم — از خواص پسته تا نکته‌های نگهداری؛ از مزرعه تا سفرهٔ شما.';
  return {
    title: 'وبلاگ پارس — مقالات آجیل و تغذیهٔ سالم',
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title: 'وبلاگ پارس — مقالات آجیل و تغذیهٔ سالم',
      description,
      url: canonical,
      type: 'website',
      locale: 'fa_IR',
      siteName: 'فروشگاه پارس',
    },
  };
}

export default async function BlogIndexPage() {
  const base = baseUrlFromHeaders(await headers());
  const { posts } = await listPublishedPosts({ take: 30 });

  const blogJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'وبلاگ فروشگاه پارس',
    url: absoluteUrl(base, '/blog'),
    description: 'مقالات آجیل، خشکبار و تغذیهٔ سالم',
    ...(posts.length
      ? {
          blogPost: posts.slice(0, 10).map((p) => ({
            '@type': 'BlogPosting',
            headline: p.title,
            url: absoluteUrl(base, `/blog/${p.slug}`),
            datePublished: p.publishedAt,
          })),
        }
      : {}),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'فروشگاه پارس', item: absoluteUrl(base, '/') },
      { '@type': 'ListItem', position: 2, name: 'وبلاگ', item: absoluteUrl(base, '/blog') },
    ],
  };

  return (
    <div className="min-h-screen bg-cream-50 pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(blogJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />

      {/* ——— هدر ساده — هم‌خانواده با صفحات استاندارد ——— */}
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
            <li className="font-bold text-ink-700">وبلاگ</li>
          </ol>
        </nav>

        {/* ——— سرصفحهٔ وبلاگ ——— */}
        <section className="mt-4 rounded-3xl bg-white p-5 shadow-card">
          <h1 className="flex items-center gap-2 text-lg font-black text-ink-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Newspaper className="h-5 w-5" aria-hidden />
            </span>
            وبلاگ پارس
          </h1>
          <p className="mt-1.5 text-[12.5px] leading-6 text-ink-500">
            مقالات و راهنماهای آجیل، خشکبار و تغذیهٔ سالم — هر هفته یک موضوع تازه از دنیای خشکبار
          </p>
        </section>

        {/* ——— فهرست نوشته‌ها ——— */}
        {posts.length === 0 ? (
          <p className="mt-6 rounded-3xl bg-white p-8 text-center text-[12px] text-ink-400 shadow-card">
            هنوز نوشته‌ای منتشر نشده — به‌زودی مقالات تازه می‌آیند.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <article
                key={p.id}
                className="group overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-cream-100 transition-shadow hover:shadow-lg"
              >
                <Link href={`/blog/${p.slug}`} aria-label={p.title} className="block">
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-cream-100">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.coverUrl}
                        alt={p.title}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center bg-cream-50">
                        <Newspaper className="h-8 w-8 text-cream-300" aria-hidden />
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h2 className="text-[13.5px] font-black leading-6 text-ink-900 group-hover:text-brand-700">
                      {p.title}
                    </h2>
                    {p.excerpt && (
                      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-5 text-ink-500">{p.excerpt}</p>
                    )}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px] text-ink-400">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" aria-hidden />
                        {formatJalaliDate(p.publishedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" aria-hidden />
                        {toFaDigits(p.viewCount)} بازدید
                      </span>
                      {p.tags.slice(0, 2).map((t) => (
                        <span key={t} className="rounded-full bg-cream-100 px-2 py-0.5 font-bold text-ink-500">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-4 text-center text-[10.5px] text-ink-300">
        فروشگاه پارس — از مزرعه تا سفرهٔ شما
      </footer>
    </div>
  );
}
