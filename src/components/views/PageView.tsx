'use client';

import { FileText } from 'lucide-react';
import { TopBar } from '@/components/shared/TopBar';
import { useApi } from '@/hooks/use-api';
import { useRouterStore } from '@/stores/router-store';
import { formatJalaliDate } from '@/lib/jalali';
import { parsePageBlocks } from '@/lib/page-blocks';
import { MarkdownContent } from '@/components/shared/MarkdownContent';
import { PageBlocks } from '@/components/shared/PageBlocks';

/**
 * نمای صفحهٔ اختصاصی فروشگاه (درخواست کاربر) — قوانین و شرایط و ...
 * دو حالت محتوا: مارک‌داون امن (MarkdownContent) یا بلوک‌های صفحه‌ساز
 * (تمپلیت‌های آماده — رندر با PageBlocks مشترک با صفحهٔ SSR /p/[slug])
 * داده از GET /api/pages/[slug] — فقط صفحات فعال
 */
export function PageView({ slug }: { slug: string }) {
  const push = useRouterStore((s) => s.push);
  const { data, loading, error } = useApi<{
    id: string;
    slug: string;
    title: string;
    body: string;
    editorMode: 'markdown' | 'blocks';
    blocks: string | null;
    updatedAt: string;
  }>(slug ? `/api/pages/${encodeURIComponent(slug)}` : null);

  // ——— حالت بارگذاری ———
  if (loading) {
    return (
      <div className="min-h-full">
        <TopBar title="بارگذاری…" />
        <div className="px-4 py-4">
          <div className="shimmer h-8 w-40 rounded-xl" aria-hidden />
          <div className="mt-4 space-y-2.5" aria-label="در حال بارگذاری">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="shimmer h-4 w-full rounded-lg" aria-hidden />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ——— حالت خطا / صفحهٔ یافت‌نشده ———
  if (error || !data) {
    return (
      <div className="min-h-full">
        <TopBar title="صفحهٔ فروشگاه" />
        <div className="px-4 py-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream-100 text-ink-300">
            <FileText className="h-7 w-7" aria-hidden />
          </span>
          <p className="mt-3 text-[13px] font-black text-ink-800">صفحهٔ موردنظر یافت نشد</p>
          <p className="mt-1 text-[11px] text-ink-400">
            {error ?? 'این صفحه حذف شده یا غیرفعال است'}
          </p>
          <button
            type="button"
            onClick={() => push({ view: 'home' })}
            className="mt-4 h-10 rounded-2xl bg-brand-600 px-5 text-[12px] font-black text-white transition-colors hover:bg-brand-700"
          >
            بازگشت به فروشگاه
          </button>
        </div>
      </div>
    );
  }

  // ——— رندر مارک‌داون — کامپوننت مشترک با صفحهٔ SSR /p/[slug] ———

  return (
    <div className="min-h-full">
      <TopBar title={data.title} />

      <div className="px-4 py-4">
        <h1 className="text-[16px] font-black leading-7 text-ink-900">{data.title}</h1>
        <p className="mt-1 text-[10px] text-ink-300">
          آخرین به‌روزرسانی: {formatJalaliDate(data.updatedAt)}
        </p>

        <div className="mt-4">
          {data.editorMode === 'blocks' && parsePageBlocks(data.blocks)?.length ? (
            <PageBlocks blocks={parsePageBlocks(data.blocks)!} />
          ) : (
            <MarkdownContent source={data.body} variant="spa" />
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-ink-300">
          فروشگاه پارس — فروشگاه خشکبار و محصولات ویژهٔ شما
        </p>
      </div>
    </div>
  );
}
