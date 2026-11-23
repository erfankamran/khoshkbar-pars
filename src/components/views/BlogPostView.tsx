'use client';

import { CalendarDays, Eye, Newspaper } from 'lucide-react';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/States';
import { useApi } from '@/hooks/use-api';
import { formatJalaliDate } from '@/lib/jalali';
import { toFaDigits } from '@/lib/fa';
import { MarkdownContent } from '@/components/shared/MarkdownContent';

/**
 * نمای نوشتهٔ وبلاگ در اپ موبایل (درخواست کاربر) — خواندن کامل نوشته
 * داده از GET /api/posts/[slug] — پیش‌نویس/ناموجود → حالت «یافت نشد»
 * محتوا با MarkdownContent مشترک (بدون HTML خام — امن در برابر تزریق)
 */
export function BlogPostView({ slug }: { slug?: string }) {
  const { data, loading, error } = useApi<{
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    coverUrl: string | null;
    tags: string[];
    publishedAt: string;
    viewCount: number;
  }>(slug ? `/api/posts/${encodeURIComponent(slug)}` : null);

  if (loading) {
    return (
      <div className="min-h-full">
        <TopBar title="وبلاگ" />
        <div className="px-4 py-4">
          <div className="shimmer h-7 w-56 rounded-xl" aria-hidden />
          <div className="mt-4 shimmer aspect-[16/9] w-full rounded-3xl" aria-hidden />
          <div className="mt-4 space-y-2.5" aria-label="در حال بارگذاری">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="shimmer h-4 w-full rounded-lg" aria-hidden />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-full">
        <TopBar title="وبلاگ" />
        <EmptyState
          icon={Newspaper}
          title="نوشتهٔ موردنظر یافت نشد"
          description={error ?? 'این نوشته حذف شده یا هنوز منتشر نشده است'}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <TopBar title="وبلاگ پارس" />

      <article className="px-4 py-4">
        <h1 className="text-[16px] font-black leading-7 text-ink-900">{data.title}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[10px] text-ink-400">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" aria-hidden />
            {formatJalaliDate(data.publishedAt)}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" aria-hidden />
            {toFaDigits(data.viewCount)} بازدید
          </span>
          {data.tags.map((t) => (
            <span key={t} className="rounded-full bg-brand-50 px-2 py-0.5 font-bold text-brand-700">
              {t}
            </span>
          ))}
        </div>

        {data.coverUrl && (
          <div className="relative mt-3 aspect-[16/9] w-full overflow-hidden rounded-3xl bg-cream-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.coverUrl} alt={data.title} className="absolute inset-0 h-full w-full object-cover" />
          </div>
        )}

        <div className="mt-4">
          <MarkdownContent source={data.content} variant="spa" />
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-ink-300">
          فروشگاه پارس — فروشگاه خشکبار و محصولات ویژهٔ شما
        </p>
      </article>
    </div>
  );
}
