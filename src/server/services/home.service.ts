import { unstable_cache } from 'next/cache';
import { CACHE_TAGS, STORE_CACHE_SCOPE } from '@/server/lib/cache-tags';
import { getCategories, getProducts } from './catalog.service';
import { getBanners, getStories } from './content.service';
import type { ProductCardDTO } from './catalog.service';
import type { ProductQuery } from '@/server/validators/catalog.schema';

/**
 * سرویس تجمیعی صفحه اصلی (فاز ۶)
 *
 * چرا یک اندپوینت تجمیعی؟
 * - موبایل: یک رفت‌وبرگشت شبکه به‌جای ۷ درخواست جداگانه (تأخیر درک‌شده بسیار کمتر)
 * - کوئری‌ها با Promise.all موازی می‌شوند؛ SQLite آن‌ها را صف می‌کند ولی
 *   مجموع زمان همچنان از جمع درخواست‌های HTTP جداگانه بسیار کمتر است.
 *
 * Expected SQL statements (هر بخش طبق اندازه‌گیری فاز ۵):
 *   banners 1 + stories 1 + categories 1
 *   + bestseller 6 + newest 6 + discounted 6 + suggested 6
 *   = مجموع ۲۷ دستور در «یک» درخواست HTTP (ثابت — مستقل از داده)
 * (+۱ دستور SELECT 1 سلامت اتصال Prisma در صورت شروع اتصال جدید)
 */

/** یک ردیف افقی محصولات صفحه اصلی */
export interface HomeSectionDTO {
  key: 'suggested' | 'discounted' | 'bestseller' | 'newest';
  items: ProductCardDTO[];
}

export interface HomeDataDTO {
  banners: Awaited<ReturnType<typeof getBanners>>['items'];
  stories: Awaited<ReturnType<typeof getStories>>['groups'];
  categories: Awaited<ReturnType<typeof getCategories>>['items'];
  sections: Record<HomeSectionDTO['key'], HomeSectionDTO['items']>;
  /** بخش ویژه «هدایای سازمانی» — محصولات دسته GIFT_CATEGORY_SLUG (خارج از sections ۴گانه تا تست/ساختار ثابت بماند) */
  gifts: HomeSectionDTO['items'];
}

// اسلاگ دسته ویژه صفحه اصلی — تعریف مشترک در src/lib/config (کلاینت هم مصرف می‌کند)
import { GIFT_CATEGORY_SLUG } from '@/lib/config';
export { GIFT_CATEGORY_SLUG };

/** کوئری استاندارد هر بخش: ۸ آیتم اول، صفحه ۱ */
function sectionQuery(
  section: ProductQuery['section']
): ProductQuery {
  return {
    category: undefined,
    section,
    sort: section === 'new' ? 'newest' : 'popular',
    page: 1,
    limit: 8,
  };
}

async function getHomeDataUncached(role?: string): Promise<HomeDataDTO> {
  const [banners, stories, categories, bestseller, newest, discounted, suggested, gifts] =
    await Promise.all([
      getBanners(),
      getStories(),
      getCategories(),
      getProducts(sectionQuery('bestseller'), role),
      getProducts(sectionQuery('new'), role),
      getProducts(sectionQuery('discounted'), role),
      getProducts(sectionQuery('suggested'), role),
      // بخش ویژه هدایای سازمانی — جدیدترین‌های آن دسته (اگر دسته خالی/غیرفعال بود → آرایه خالی و بخش رندر نمی‌شود)
      getProducts({
        category: GIFT_CATEGORY_SLUG,
        section: 'new',
        sort: 'newest',
        page: 1,
        limit: 8,
      }, role),
    ]);

  return {
    banners: banners.items,
    stories: stories.groups,
    categories: categories.items,
    sections: {
      suggested: suggested.items,
      discounted: discounted.items,
      bestseller: bestseller.items,
      newest: newest.items,
    },
    gifts: gifts.items,
  };
}

const getHomeDataCached = unstable_cache(getHomeDataUncached, ['home:data', STORE_CACHE_SCOPE], { revalidate: 300, tags: [CACHE_TAGS.HOME] });

export async function getHomeData(role?: string): Promise<HomeDataDTO> {
  return role === 'PARTNER' ? getHomeDataUncached(role) : getHomeDataCached();
}
