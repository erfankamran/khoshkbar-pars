'use client';

import { CalendarDays, Eye, Newspaper } from 'lucide-react';
import { EmptyState } from '@/components/shared/States';
import { useApi } from '@/hooks/use-api';
import { useRouterStore } from '@/stores/router-store';
import { formatJalaliDate } from '@/lib/jalali';
import { toFaDigits } from '@/lib/fa';

/**
 * نمای وبلاگ در اپ موبایل (درخواست کاربر) — تب «وبلاگ» منوی پایین
 * داده از GET /api/posts — فقط نوشته‌های منتشرشده؛ لمس کارت → نمای نوشته
 * صفحهٔ استاندارد و ایندکس‌پذیرِ همین محتوا در /blog (SSR برای سئو) است
 */
export function BlogView() {
  const push = useRouterStore((s) => s.push);
  const { data, loading, error } = useApi<{ posts: Array<{
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    coverUrl: string | null;
    tags: string[];
    publishedAt: string;
    viewCount: number;
  }> }>('/api/posts');

  if (loading) {
    return (
      <div className="min-h-full">
        <h1 className="px-4 pb-1 pt-5 text-lg font-black text-ink-900">وبلاگ پارس</h1>
        <div className="space-y-3 px-4" aria-label="در حال بارگذاری">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shimmer h-40 rounded-3xl" aria-hidden />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-full">
        <h1 className="px-4 pb-1 pt-5 text-lg font-black text-ink-900">وبلاگ پارس</h1>
        <EmptyState
          icon={Newspaper}
          title="دریافت نوشته‌ها ناموفق بود"
          description={error ?? 'اتصال را بررسی کنید'}
        />
      </div>
    );
  }

  if (data.posts.length === 0) {
    return (
      <div className="min-h-full">
        <h1 className="px-4 pb-1 pt-5 text-lg font-black text-ink-900">وبلاگ پارس</h1>
        <EmptyState
          icon={Newspaper}
          title="هنوز نوشته‌ای منتشر نشده"
          description="به‌زودی مقالات تازه دربارهٔ آجیل و تغذیهٔ سالم اینجا می‌آیند."
        />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <h1 className="px-4 pb-1 pt-5 text-lg font-black text-ink-900">وبلاگ پارس</h1>
      <p className="px-4 pb-3 text-[11px] leading-5 text-ink-400">
        مقالات آجیل، خشکبار و تغذیهٔ سالم
      </p>

      <div className="space-y-3 px-4">
        {data.posts.map((p) => (
          <article
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => push({ view: 'blogPost', params: { slug: p.slug }, key: `blogPost:${p.slug}` })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                push({ view: 'blogPost', params: { slug: p.slug }, key: `blogPost:${p.slug}` });
              }
            }}
            className="cursor-pointer overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-cream-100 transition-shadow active:shadow-lg"
            aria-label={p.title}
          >
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-cream-100">
              {p.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.coverUrl} alt={p.title} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center bg-cream-50">
                  <Newspaper className="h-7 w-7 text-cream-300" aria-hidden />
                </span>
              )}
            </div>
            <div className="p-3.5">
              <h2 className="text-[13px] font-black leading-6 text-ink-900">{p.title}</h2>
              {p.excerpt && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink-500">{p.excerpt}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-ink-400">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" aria-hidden />
                  {formatJalaliDate(p.publishedAt)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" aria-hidden />
                  {toFaDigits(p.viewCount)}
                </span>
                {p.tags.slice(0, 2).map((t) => (
                  <span key={t} className="rounded-full bg-cream-100 px-2 py-0.5 font-bold text-ink-500">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
