import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CalendarDays, ChevronLeft, Eye, Newspaper } from 'lucide-react';
import {
  getPublishedPost,
  incrementPostView,
  listPublishedPosts,
  postSeoDescription,
} from '@/server/services/blog.service';
import { absoluteUrl, baseUrlFromHeaders, safeJsonLd } from '@/lib/site';
import { formatJalaliDate } from '@/lib/jalali';
import { toFaDigits } from '@/lib/fa';
import { MarkdownContent } from '@/components/shared/MarkdownContent';

export const dynamic = 'force-dynamic';

/**
 * صفحهٔ استاندارد نوشتهٔ وبلاگ — /blog/[slug] (درخواست کاربر — ورودی سئو)
 *
 * - SSR کامل + متادیتای اختصاصی هر نوشته (title/description/canonical/OG/Twitter)
 * - JSON-LD «Article» + «BreadcrumbList» — همان الگوی صفحهٔ محصول
 * - فقط نوشته‌های منتشرشده؛ پیش‌نویس/ناموجود → 404 استاندارد (درست برای سئو)
 * - شمارش بازدید در هر رندر (fire-and-forget)
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const base = baseUrlFromHeaders(await headers());

  const post = await getPublishedPost(slug);
  if (!post) {
    return { title: 'نوشته یافت نشد', robots: { index: false, follow: false } };
  }

  const title = post.metaTitle?.trim() || post.title;
  const description = postSeoDescription(post);
  const canonical = absoluteUrl(base, `/blog/${post.slug}`);
  const ogImages = post.coverUrl ? [{ url: absoluteUrl(base, post.coverUrl) }] : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'article',
      locale: 'fa_IR',
      siteName: 'فروشگاه پارس',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImages?.map((i) => i.url),
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const base = baseUrlFromHeaders(await headers());

  const post = await getPublishedPost(slug);
  if (!post) notFound();

  // شمارش بازدید — بدون انتظار (خطا نباید صفحه را بترکاند)
  incrementPostView(post.id);

  // نوشته‌های دیگر برای لینک‌سازی داخلی (سئو)
  const { posts: latest } = await listPublishedPosts({ take: 4 });
  const others = latest.filter((p) => p.id !== post.id).slice(0, 3);

  const pageUrl = absoluteUrl(base, `/blog/${post.slug}`);
  const title = post.metaTitle?.trim() || post.title;
  const description = postSeoDescription(post);

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description,
    ...(post.coverUrl ? { image: [absoluteUrl(base, post.coverUrl)] } : {}),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: 'fa-IR',
    author: { '@type': 'Organization', name: 'فروشگاه پارس' },
    publisher: {
      '@type': 'Organization',
      name: 'فروشگاه پارس',
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl(base, '/icons/icon-512.png'),
      },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'فروشگاه پارس', item: absoluteUrl(base, '/') },
      { '@type': 'ListItem', position: 2, name: 'وبلاگ', item: absoluteUrl(base, '/blog') },
      { '@type': 'ListItem', position: 3, name: post.title, item: pageUrl },
    ],
  };

  return (
    <div className="min-h-screen bg-cream-50 pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />

      {/* ——— هدر ساده — هم‌خانواده با سایر صفحات استاندارد ——— */}
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
            href="/blog"
            className="mr-auto flex items-center gap-1 rounded-xl border border-cream-200 px-3 py-2 text-[11px] font-bold text-ink-600 transition-colors hover:bg-cream-100"
          >
            همهٔ نوشته‌ها
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
            <li>
              <Link href="/blog" className="transition-colors hover:text-brand-700">
                وبلاگ
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="font-bold text-ink-700">{post.title}</li>
          </ol>
        </nav>

        {/* ——— متن نوشته ——— */}
        <article className="mt-4 overflow-hidden rounded-3xl bg-white shadow-card">
          {post.coverUrl && (
            <div className="relative aspect-[16/9] w-full bg-cream-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.coverUrl} alt={post.title} className="absolute inset-0 h-full w-full object-cover" />
            </div>
          )}
          <div className="p-5">
            <h1 className="text-lg font-black leading-8 text-ink-900">{post.title}</h1>

            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[10.5px] text-ink-400">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" aria-hidden />
                {formatJalaliDate(post.publishedAt)}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" aria-hidden />
                {toFaDigits(post.viewCount)} بازدید
              </span>
              {post.tags.map((t) => (
                <span key={t} className="rounded-full bg-brand-50 px-2.5 py-1 font-bold text-brand-700">
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-4 border-t border-cream-100 pt-4">
              <MarkdownContent source={post.content} variant="ssr" />
            </div>
          </div>
        </article>

        {/* ——— نوشته‌های دیگر — لینک‌سازی داخلی برای سئو ——— */}
        {others.length > 0 && (
          <section className="mt-6">
            <h2 className="px-1 text-[13px] font-black text-ink-900">نوشته‌های دیگر وبلاگ</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {others.map((o) => (
                <Link
                  key={o.id}
                  href={`/blog/${o.slug}`}
                  className="group flex items-start gap-3 rounded-2xl bg-white p-3 shadow-card ring-1 ring-cream-100 transition-shadow hover:shadow-lg"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream-100 text-ink-300">
                    <Newspaper className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 block text-[12px] font-black leading-5 text-ink-800 group-hover:text-brand-700">
                      {o.title}
                    </span>
                    <span className="mt-1 block text-[10px] text-ink-400">{formatJalaliDate(o.publishedAt)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-4 text-center text-[10.5px] text-ink-300">
        فروشگاه پارس — از مزرعه تا سفرهٔ شما
      </footer>
    </div>
  );
}
