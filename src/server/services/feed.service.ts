import { unstable_cache } from 'next/cache';
import { CACHE_TAGS, STORE_CACHE_SCOPE } from '@/server/lib/cache-tags';
import { db } from '@/lib/db';
import { parseProductAttributes } from '@/lib/product-attributes';
import { absoluteUrl, toTehranISO } from '@/lib/site';
import { formatWeight } from '@/lib/fa';

/**
 * سرویس فید محصولات (فاز ۱۳) — نمایش محصولات در موتورهای مقایسه قیمت
 *
 * دو خروجی استاندارد از یک منبع حقیقت (کوئری یکتای دیتابیس):
 *  ۱) ترب — Product API v3 (مستند رسمی: github.com/torob/Torob-Sync → product_api_v3.md)
 *     - قیمت: عدد صحیح «تومان»
 *     - هر واریانت وزنی یک ردیف فید است؛ گروه‌بندی با product_group_id = slug محصول
 *     - page_unique باید پایدار بماند → «{slug}-{وزن}»
 *     - image_links مطلق و تصویر اول = تصویر اصلی
 *     - availability بولی؛ date_added/date_updated با ISO 8601 و آفست تهران
 *  ۲) ایمالز — فید XML استاندارد + API استخراج JSON (هم‌ارز افزونه رسمی
 *     «Emalls Extraction API»: نام، قیمت، تصاویر، مشخصات، موجودی)
 *
 * نکته N+1: کل فید با یک findMany و select صریح خوانده می‌شود — تعداد
 * دستور SQL ثابت است و به تعداد محصولات ربطی ندارد.
 */

/** برند نمایش‌داده‌شده در فیدها — فاز ۲: از تنظیمات برند خوانده می‌شود (پیش‌فرض: پارس) */
export async function feedBrand(): Promise<string> {
  const { getBrandTheme } = await import('@/server/services/content.service');
  return (await getBrandTheme()).name;
}

/** ردیف تخت فید — یک واریانت فعال از یک محصول فعال */
export interface FeedRow {
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  categoryName: string;
  images: string[]; // مسیرهای نسبی به ترتیب sortOrder — تصویر اول اصلی
  attributes: Array<{ k: string; v: string }>;
  /** ISO string — از unstable_cache به‌صورت JSON-safe بیرون می‌آید */
  createdAt: string;
  updatedAt: string;

  variantId: string;
  weightGrams: number;
  priceToman: number;
  compareAtPriceToman: number | null;
  stock: number;
  sku: string | null;
}

/** عنوان واریانت در فیدها — «پسته اکبری خوش‌رنگ - بسته ۵۰۰ گرم» */
export function feedRowTitle(row: FeedRow): string {
  return `${row.title} - بسته ${formatWeight(row.weightGrams)}`;
}

/** شناسه پایدار ردیف فید — هرگز برای یک واریانت تغییر نمی‌کند */
export function feedRowUniqueId(row: FeedRow): string {
  return `${row.slug}-${row.weightGrams}`;
}

/** کل ردیف‌های فید — محصولات فعال + واریانت‌های فعال، یک کوئری */
async function getFeedRowsUncached(): Promise<FeedRow[]> {
  const products = await db.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: {
      slug: true,
      title: true,
      shortDescription: true,
      description: true,
      attributes: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { title: true } },
      images: {
        orderBy: { sortOrder: 'asc' },
        select: { url: true },
      },
      variants: {
        where: { isActive: true, isWholesale: false },
        orderBy: { weightGrams: 'asc' },
        select: {
          id: true,
          weightGrams: true,
          priceToman: true,
          compareAtPriceToman: true,
          stock: true,
          sku: true,
        },
      },
    },
  });

  const rows: FeedRow[] = [];
  for (const p of products) {
    const attributes = parseProductAttributes(p.attributes).map(({ key, value }) => ({ k: key, v: value }));
    for (const v of p.variants) {
      rows.push({
        slug: p.slug,
        title: p.title,
        shortDescription: p.shortDescription,
        description: p.description,
        categoryName: p.category.title,
        images: p.images.map((i) => i.url),
        attributes,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        variantId: v.id,
        weightGrams: v.weightGrams,
        priceToman: v.priceToman,
        compareAtPriceToman: v.compareAtPriceToman,
        stock: v.stock,
        sku: v.sku,
      });
    }
  }
  return rows;
}

// ------------------------------------------------------------
// ترب — Product API v3 (ساختار دقیق مستند رسمی)
// ------------------------------------------------------------

export interface TorobProductV3 {
  page_unique: string;
  page_url: string;
  product_group_id: string;
  title: string;
  subtitle?: string;
  current_price: number;
  old_price?: number;
  availability: boolean;
  category_name?: string;
  image_links: string[];
  short_desc?: string;
  spec: Record<string, string>;
  date_added: string;
  date_updated?: string;
}

export interface TorobFeedV3 {
  api_version: 'torob_api_v3';
  current_page: number | null;
  total: number;
  max_pages: number | null;
  next_cursor: string | null;
  products: TorobProductV3[];
}

/** اندازه صفحه فید ترب — طبق عرف مستند (صفحه‌بندی page-based) */
export const TOROB_PAGE_SIZE = 100;

export async function getTorobFeed(
  baseUrl: string,
  page = 1,
  perPage: number = TOROB_PAGE_SIZE
): Promise<TorobFeedV3> {
  const rows = await getFeedRows();
  const total = rows.length;
  const start = (page - 1) * perPage;
  const slice = rows.slice(start, start + perPage);

  const products: TorobProductV3[] = slice.map((r) => ({
    page_unique: feedRowUniqueId(r),
    page_url: absoluteUrl(baseUrl, `/p/${r.slug}`),
    product_group_id: r.slug,
    title: feedRowTitle(r),
    ...(r.shortDescription ? { subtitle: r.shortDescription, short_desc: r.shortDescription } : {}),
    current_price: r.priceToman,
    // old_price فقط وقتی معنا دارد که از قیمت فعلی بزرگ‌تر باشد (تخفیف واقعی)
    ...(r.compareAtPriceToman && r.compareAtPriceToman > r.priceToman
      ? { old_price: r.compareAtPriceToman }
      : {}),
    availability: r.stock > 0,
    category_name: r.categoryName,
    // مطلق‌سازی تصاویر — تصویر اول باید تصویر اصلی باشد (همین ترتیب در DB حفظ شده)
    image_links: r.images.map((u) => absoluteUrl(baseUrl, u)),
    spec: Object.fromEntries(r.attributes.map((a) => [a.k, a.v])),
    date_added: toTehranISO(r.createdAt),
    date_updated: toTehranISO(r.updatedAt),
  }));

  return {
    api_version: 'torob_api_v3',
    current_page: page,
    total,
    max_pages: Math.max(1, Math.ceil(total / perPage)),
    next_cursor: null,
    products,
  };
}

// ------------------------------------------------------------
// ایمالز — ردیف‌های مشترک XML و JSON
// ------------------------------------------------------------

export interface EmallsItem {
  id: string;
  title: string;
  url: string;
  /** قیمت فروش به تومان (عدد صحیح) */
  price: number;
  old_price?: number;
  category: string;
  image: string;
  images: string[];
  brand: string;
  availability: 'in_stock' | 'out_of_stock';
  stock: number;
  short_desc: string;
  description: string;
  sku?: string;
  attributes: Array<{ key: string; value: string }>;
  updated_at: string;
}

export async function getEmallsItems(baseUrl: string): Promise<EmallsItem[]> {
  // فاز ۲: برند از تنظیمات پنل (brand.name) با پیش‌فرض «پارس»
  const [rows, brand] = await Promise.all([getFeedRows(), feedBrand()]);
  return rows.map((r) => {
    const images = r.images.map((u) => absoluteUrl(baseUrl, u));
    return {
      id: feedRowUniqueId(r),
      title: feedRowTitle(r),
      url: absoluteUrl(baseUrl, `/p/${r.slug}`),
      price: r.priceToman,
      ...(r.compareAtPriceToman && r.compareAtPriceToman > r.priceToman
        ? { old_price: r.compareAtPriceToman }
        : {}),
      category: r.categoryName,
      image: images[0] ?? absoluteUrl(baseUrl, '/icons/icon-512.png'),
      images: images.length ? images : [absoluteUrl(baseUrl, '/icons/icon-512.png')],
      brand,
      availability: r.stock > 0 ? ('in_stock' as const) : ('out_of_stock' as const),
      stock: r.stock,
      short_desc: r.shortDescription ?? '',
      description: r.description ?? r.shortDescription ?? '',
      ...(r.sku ? { sku: r.sku } : {}),
      attributes: r.attributes.map((a) => ({ key: a.k, value: a.v })),
      updated_at: toTehranISO(r.updatedAt),
    };
  });
}

/** escape متن برای گره‌های XML (خارج از CDATA) */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** بلوک CDATA امن — توالی ]]> داخل متن خنثی می‌شود */
export function cdata(s: string): string {
  return `<![CDATA[${s.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

const getFeedRowsCached = unstable_cache(getFeedRowsUncached, ['feed:rows', STORE_CACHE_SCOPE], { revalidate: 300, tags: [CACHE_TAGS.FEED] });

export async function getFeedRows(): Promise<FeedRow[]> {
  return getFeedRowsCached();
}
