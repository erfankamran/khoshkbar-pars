'use client';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { ErrorState } from '@/components/shared/States';
import {
  BannerSkeleton,
  CategoryRowSkeleton,
  ProductRowSkeleton,
  StoriesSkeleton,
} from '@/components/shared/Skeletons';
import { BannerSlider } from '@/components/home/BannerSlider';
import { CategoryCircles } from '@/components/home/CategoryCircles';
import { HomeFaq } from '@/components/home/HomeFaq';
import { FeatureStrip } from '@/components/home/FeatureStrip';
import { StoriesRow } from '@/components/home/StoriesRow';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ProductRow } from '@/components/product/ProductRow';
import { useApi } from '@/hooks/use-api';
import { useRouterStore } from '@/stores/router-store';
import { GIFT_CATEGORY_SLUG } from '@/lib/config';
import type { HomeDataDTO } from '@/server/services/home.service';
import type { BannerDTO } from '@/components/home/BannerSlider';

/**
 * صفحه اصلی فروشگاه پارس (فاز ۶) — داده واقعی از /api/home
 *
 * ترتیب بخش‌ها:
 * استوری ← بنر ← دسته‌بندی ← پیشنهاد پارس ← هدایا ← تخفیف‌ها ← پرفروش‌ها ← تازه‌رسیدها ← پرسش‌های متداول ← نوار مزیت‌ها ← فوتر
 *
 * درخواست کاربر (۱۴۰۵/۰۸/۲۰): ۴ پرسش متداول ثابت + فوتر به انتهای صفحه برگشت —
 * (بخش‌های مزایا/تعهد کیفیت/نکتهٔ برند همچنان حذف‌اند). سئو همچنان از صفحات
 * مستقل SSR (/c/[slug]، /p/[slug]، /blog، /faq) پوشش داده می‌شود.
 *
 * سه حالت الزامی (بخش ۱۷): Skeleton کامل هم‌شکل محتوا / Error + تلاش مجدد / داده
 */

/** اسکلتون کامل صفحه — دقیقاً هم‌شکل محتوای واقعی (بدون CLS) */
function HomeSkeleton() {
  return (
    <div aria-label="در حال بارگذاری">
      <StoriesSkeleton />
      <BannerSkeleton />
      <SectionHeader title="دسته‌بندی محصولات" />
      <CategoryRowSkeleton />
      <SectionHeader title="پیشنهاد پارس" />
      <ProductRowSkeleton />
      <SectionHeader title="هدایای سازمانی" />
      <BannerSkeleton />
      <ProductRowSkeleton />
      <SectionHeader title="پرفروش‌ترین‌ها" />
      <ProductRowSkeleton />
    </div>
  );
}

export function HomeView() {
  const reset = useRouterStore((s) => s.reset);
  const push = useRouterStore((s) => s.push);
  const { data, loading, error, reload } = useApi<HomeDataDTO>('/api/home');

  if (error) {
    return (
      <ErrorState
        title="صفحه اصلی بارگذاری نشد"
        description={error}
        onRetry={reload}
        className="pt-16"
      />
    );
  }

  if (loading || !data) return <HomeSkeleton />;

  const { banners, stories, categories, sections, gifts } = data;

  // بنرهای بخش هدایا جدا می‌شوند تا فقط داخل همان بخش دیده شوند (بدون تکرار در اسلایدر بالای صفحه)
  const isGiftBanner = (b: BannerDTO) =>
    b.linkView === 'category' && b.linkParams?.slug === GIFT_CATEGORY_SLUG;
  const giftBanners = banners.filter(isGiftBanner);
  const topBanners = banners.filter((b) => !isGiftBanner(b));

  const goAllProducts = () => reset({ view: 'category' });
  const goGifts = () => push({ view: 'category', params: { slug: GIFT_CATEGORY_SLUG } });

  return (
    <div className="pb-8">
      {/* ——— استوری‌ها ——— */}
      {stories.length > 0 && <StoriesRow groups={stories} />}

      {/* ——— اسلایدر بنر ——— */}
      <BannerSlider banners={topBanners} />

      {/* ——— دسته‌بندی‌ها ——— */}
      <SectionHeader title="دسته‌بندی محصولات" onAction={goAllProducts} />
      <CategoryCircles categories={categories} />

      {/* ——— پیشنهاد پارس ——— */}
      {sections.suggested.length > 0 && (
        <>
          <SectionHeader
            title="پیشنهاد پارس"
            onAction={goAllProducts}
          />
          <ProductRow items={sections.suggested} />
        </>
      )}

      {/* ——— هدایای سازمانی: بنر اختصاصی بخش + محصولات دسته ——— */}
      {gifts.length > 0 && (
        <section aria-label="هدایای سازمانی">
          <SectionHeader title="هدایای سازمانی" onAction={goGifts} />
          {giftBanners.length > 0 && <BannerSlider banners={giftBanners} />}
          <ProductRow items={gifts} />
        </section>
      )}

      {/* ——— تخفیف‌های ویژه ——— */}
      {sections.discounted.length > 0 && (
        <>
          <SectionHeader title="تخفیف‌های ویژه" onAction={goAllProducts} />
          <ProductRow items={sections.discounted} />
        </>
      )}

      {/* ——— پرفروش‌ترین‌ها ——— */}
      {sections.bestseller.length > 0 && (
        <>
          <SectionHeader title="پرفروش‌ترین‌ها" onAction={goAllProducts} />
          <ProductRow items={sections.bestseller} />
        </>
      )}

      {/* ——— تازه‌رسیدها — آخرین ردیف محصولات ——— */}
      {sections.newest.length > 0 && (
        <>
          <SectionHeader title="تازه‌رسیدها" onAction={goAllProducts} />
          <ProductRow items={sections.newest} />
        </>
      )}

      {/* ——— پرسش‌های متداول: ۴ سوال ثابت در کد (درخواست کاربر) ——— */}
      <HomeFaq />

      {/* ——— نوار مزیت‌ها — بعد از پرسش‌های متداول، خارج از فوتر (بازخورد کاربر):
          مینیمال، بک‌گراند شفاف، بوردر سبز تم سایت، دو آیتم در هر ردیف ——— */}
      <FeatureStrip />

      {/* ——— فوتر — وکتور ظروف اصیل ایرانی روی لبهٔ بالایی ——— */}
      <SiteFooter />
    </div>
  );
}
