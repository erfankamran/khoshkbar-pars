import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { baseUrlFromHeaders } from '@/lib/site';
import { getBrandTheme } from '@/server/services/content.service';
import { formatPrice, toFaDigits } from '@/lib/fa';

export const dynamic = 'force-dynamic';

/**
 * GET /llms.txt — معرفی ساختاریافتهٔ فروشگاه برای هوش مصنوعی‌ها (درخواست کاربر)
 *
 * فرمت پیشنهاد llmstxt.org: تیتر برند + خلاصهٔ نقل‌قول‌شدنی + لینک‌های
 * کلیدی به صفحات واقعی. موتورهای AI متن HTML سادهٔ SSR را می‌خوانند؛ این
 * فایل مکمل است (برخی ابزارها آن را می‌خوانند و بی‌ضرر است) — اصل، همان
 * صفحات SSR و دادهٔ ساختاریافته است.
 *
 * برند و فهرست‌ها از دیتابیس (پنل مدیریت) خوانده می‌شود؛ اگر دیتابیس در
 * دسترس نباشد، فایل حداقلی برند برگردانده می‌شود تا ۵۰۰ ندهیم.
 */

const FALLBACK_BRAND = {
  fullName: 'فروشگاه پارس',
  name: 'پارس',
  description: 'خرید آنلاین خشکبار، آجیل، مغزها و محصولات طبیعی — تازه از مزرعه تا سفره شما',
  slogan: '',
};

function mdEscapeLink(text: string): string {
  // براکت در متن لینک مارک‌داون نمی‌نشیند
  return text.replace(/[[\]]/g, ' ').trim();
}

export async function GET(req: NextRequest) {
  const base = baseUrlFromHeaders(req.headers);

  let brand = FALLBACK_BRAND;
  let cats: { slug: string; title: string; description: string | null; _count: { products: number } }[] = [];
  let products: {
    slug: string;
    title: string;
    shortDescription: string | null;
    variants: { priceToman: number }[];
  }[] = [];
  let pages: { slug: string; title: string }[] = [];
  let posts: { slug: string; title: string; excerpt: string | null }[] = [];
  let faqCount = 0;

  try {
    const [brandRes, catsRes, productsRes, pagesRes, postsRes, faqRes] = await Promise.all([
      getBrandTheme(),
      db.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          slug: true,
          title: true,
          description: true,
          _count: { select: { products: { where: { isActive: true } } } },
        },
      }),
      // پرفروش‌ترین‌ها — ۵۰ مورد کافی و سبک است
      db.product.findMany({
        where: { isActive: true },
        orderBy: { salesCount: 'desc' },
        take: 50,
        select: {
          slug: true,
          title: true,
          shortDescription: true,
          variants: { where: { isActive: true }, select: { priceToman: true } },
        },
      }),
      db.contentPage.findMany({
        where: { isActive: true, showInFooter: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, title: true },
      }),
      // نوشته‌های منتشرشدهٔ وبلاگ (درخواست کاربر — ورودی سئو)
      db.post.findMany({
        where: { isPublished: true },
        orderBy: { publishedAt: 'desc' },
        take: 20,
        select: { slug: true, title: true, excerpt: true },
      }),
      db.faqItem.count({ where: { isActive: true } }),
    ]);

    brand = {
      fullName: brandRes.fullName || FALLBACK_BRAND.fullName,
      name: brandRes.name || FALLBACK_BRAND.name,
      description: brandRes.description || FALLBACK_BRAND.description,
      slogan: brandRes.slogan || '',
    };
    cats = catsRes.filter((c) => c._count.products > 0);
    products = productsRes;
    pages = pagesRes;
    posts = postsRes;
    faqCount = faqRes;
  } catch {
    // دیتابیس در دسترس نیست → فایل حداقلی برند
  }

  const lines: string[] = [
    `# ${brand.fullName}`,
    '',
    // شعار فقط اگر داخل توضیح تکرار نشده باشد
    ...(brand.slogan && !brand.description.includes(brand.slogan)
      ? [`> ${brand.description} — ${brand.slogan}`]
      : [`> ${brand.description}`]),
    '',
    `${brand.fullName} فروشگاه آنلاین خشکبار و آجیل ایرانی است؛ سفارش‌ها با ارسال سراسری و ضمانت تازگی ارسال می‌شوند. برای قیمت و وزن‌های به‌روز هر محصول، صفحهٔ همان محصول مرجع رسمی است.`,
    '',
  ];

  if (cats.length) {
    lines.push('## دسته‌بندی‌ها', '');
    for (const c of cats) {
      lines.push(
        `- [${mdEscapeLink(c.title)}](${base}/c/${c.slug}): ${toFaDigits(c._count.products)} محصول${c.description ? ` — ${c.description}` : ''}`
      );
    }
    lines.push('');
  }

  if (products.length) {
    lines.push('## محصولات پرفروش', '');
    for (const p of products) {
      const prices = p.variants.map((v) => v.priceToman);
      const minPrice = prices.length ? Math.min(...prices) : 0;
      const pricePart = minPrice > 0 ? ` از ${formatPrice(minPrice)} تومان` : '';
      const descPart = p.shortDescription ? ` — ${p.shortDescription}` : '';
      lines.push(`- [${mdEscapeLink(p.title)}](${base}/p/${p.slug}):${pricePart}${descPart}`);
    }
    lines.push('');
  }

  if (posts.length) {
    lines.push('## وبلاگ — مقالات آجیل و تغذیهٔ سالم', '');
    for (const p of posts) {
      const descPart = p.excerpt ? `: ${p.excerpt.slice(0, 120)}` : ': مقالهٔ آموزشی';
      lines.push(`- [${mdEscapeLink(p.title)}](${base}/blog/${p.slug})${descPart}`);
    }
    lines.push('');
  }

  lines.push('## اطلاعات و راهنما', '');
  lines.push(
    `- [پرسش‌های متداول](${base}/faq): ${faqCount > 0 ? `پاسخ ${toFaDigits(faqCount)} پرسش رایج خرید، ارسال و مرجوعی` : 'پاسخ پرسش‌های رایج خرید و ارسال'}`
  );
  for (const p of pages) {
    lines.push(`- [${mdEscapeLink(p.title)}](${base}/p/${p.slug}): صفحهٔ اطلاعات رسمی فروشگاه`);
  }
  lines.push('');
  lines.push('## فید قیمت‌ها', '');
  lines.push(`- [فید محصولات (ایمالز)](${base}/feeds/emalls.xml): قیمت و موجودی به‌روز همهٔ محصولات`);
  lines.push(`- [فید RSS وبلاگ](${base}/feeds/blog.xml): آخرین مقالات آجیل و تغذیه`);
  lines.push('');

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
}
