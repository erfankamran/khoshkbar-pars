import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { normalizePersian } from '@/lib/fa';
import { CARD_SELECT, toCardDTO, type ProductCardDTO } from './catalog.service';
import type { SearchQuery } from '@/server/validators/catalog.schema';

/**
 * جستجوی زنده محصولات (فاز ۵) — نرمال‌سازی دوسویه
 *
 * استراتژی (بخش ۹ مشخصات):
 * - سمت نوشتن (Seed/پنل): searchText = نرمال‌شدهٔ title + توضیحات + ویژگی‌ها + دسته
 *   با همان normalizePersian که سمت کلاینت هم دارد (تک‌منبع منطق: src/lib/fa.ts).
 * - سمت خواندن: کوئری کاربر نرمال و توکنایز می‌شود؛ هر توکن با contains در
 *   searchText چک می‌شود (AND بین توکن‌ها). نتیجه: «پيارم» (ی عربی)، «زردالو»
 *   (بدون مد) و «كشمش» (ک عربی) همگی درست پیدا می‌شوند.
 * - رتبه‌بندی نهایی در JS: تطابق عنوان ×۳ > توضیح کوتاه ×۲ > بقیه ×۱، سپس فروش.
 *
 * Expected SQL statements (اندازه‌گیری‌شده در dev.log):
 *   - q خالی (پیشنهاد جستجو): ۴ دستور ثابت
 *   - q پر: ۵ دستور ثابت (کاندیدها ×۴ + دسته‌ها ×۱)
 * یادداشت آینده: در رشد کاتالوگ (بیش از ~۱۰هزار محصول) به FTS5/Meilisearch
 * مهاجرت می‌شود — ساختار DTO تغییری نمی‌کند.
 */

export interface SearchResultDTO {
  mode: 'search' | 'suggest';
  query: string;
  tokens: string[];
  results: ProductCardDTO[];
  /** چیپ دسته‌بندی‌های مرتبط (فقط در mode=search) */
  categories: Array<{ slug: string; title: string }>;
}

export async function searchProducts(q: SearchQuery, role?: string): Promise<SearchResultDTO> {
  const normalized = normalizePersian(q.q);
  const tokens = normalized
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 5); // حداکثر ۵ توکن — محافظت از کوئری

  // ——— کوئری خالی → پیشنهاد: پرفروش‌ها ———
  if (tokens.length === 0) {
    const rows = await db.product.findMany({
      where: { isActive: true },
      orderBy: { salesCount: 'desc' },
      take: 8,
      select: CARD_SELECT,
    });
    return {
      mode: 'suggest',
      query: q.q,
      tokens: [],
      results: rows.map((product) => toCardDTO(product, role)),
      categories: [],
    };
  }

  // ——— کاندیدها: همه توکن‌ها باید در searchText باشند (AND) ———
  const candidates = await db.product.findMany({
    where: {
      isActive: true,
      AND: tokens.map((t) => ({ searchText: { contains: t } })),
    },
    select: CARD_SELECT,
    take: 60, // سقف امن برای رتبه‌بندی JS
    orderBy: { salesCount: 'desc' },
  });

  // رتبه‌بندی نرم بر اساس محل تطابق (عنوان مهم‌تر است)
  const scored = candidates
    .map((p) => {
      const t = normalizePersian(p.title);
      const s = normalizePersian(p.shortDescription ?? '');
      let score = 0;
      for (const token of tokens) {
        if (t.includes(token)) score += 3;
        else if (s.includes(token)) score += 2;
        else score += 1; // تطابق در توضیحات/ویژگی‌ها/دسته
      }
      // تطابق کامل عنوان با همه توکن‌ها بالاترین اولویت
      if (tokens.every((tk) => t.includes(tk))) score += 2;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || b.p.salesCount - a.p.salesCount)
    .slice(0, q.limit);

  // ——— چیپ دسته‌های مرتبط (کاتالوگ دسته کوچک است → JS) ———
  const allCats = await db.category.findMany({
    where: { isActive: true },
    select: { slug: true, title: true },
    orderBy: { sortOrder: 'asc' },
  });
  const cats = allCats
    .filter((c) => tokens.some((t) => normalizePersian(c.title).includes(t)))
    .slice(0, 3);

  return {
    mode: 'search',
    query: q.q,
    tokens,
    results: scored.map((x) => toCardDTO(x.p, role)),
    categories: cats,
  };
}

/** جهت‌گیری ترتیب واریانت‌ها در نوع Prisma — جلوگیری از تکرار */
export const variantOrder = Prisma.SortOrder.asc;
