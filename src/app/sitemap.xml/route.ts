import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { absoluteUrl, baseUrlFromHeaders } from '@/lib/site';
import { xmlEscape } from '@/server/services/feed.service';

export const dynamic = 'force-dynamic';

/**
 * GET /sitemap.xml — نقشه سایت (فاز سئو)
 *
 * فروشگاه رابط کاربری اپلیکیشنی (view-stack) دارد؛ صفحات ایندکس‌پذیر:
 *   - صفحه اصلی «/»
 *   - صفحه استاندارد هر دسته‌بندی «/c/{slug}» (درخواست کاربر — سئو AI)
 *   - صفحه استاندارد هر محصول «/p/{slug}» (متادیتا و JSON-LD کامل دارد)
 *   - پرسش‌های متداول «/faq» (JSON-LD کامل دارد)
 *   - صفحات اختصاصی پنل «/p/{slug}» (قوانین و شرایط و ... — درخواست کاربر)
 * مسیر /admin و /api در robots.txt بلاک شده‌اند و در sitemap نمی‌آیند.
 */
export async function GET(req: NextRequest) {
  const base = baseUrlFromHeaders(req.headers);

  const [products, categories, contentPages, posts] = await Promise.all([
    db.product.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { slug: true, updatedAt: true },
    }),
    // دسته‌بندی‌های فعال با حداقل یک محصول فعال (درخواست کاربر — سئو)
    db.category.findMany({
      where: { isActive: true, products: { some: { isActive: true } } },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, updatedAt: true },
    }),
    // صفحات اختصاصی فعال — قوانین و شرایط و ... (درخواست کاربر)
    db.contentPage.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { slug: true, updatedAt: true },
    }),
    // نوشته‌های منتشرشدهٔ وبلاگ (درخواست کاربر — ورودی سئو)
    db.post.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const nowISO = new Date().toISOString();
  const entries: string[] = [
    '  <url>',
    `    <loc>${xmlEscape(`${base}/`)}</loc>`,
    `    <lastmod>${nowISO}</lastmod>`,
    '    <changefreq>daily</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    ...categories.flatMap((c) => [
      '  <url>',
      `    <loc>${xmlEscape(absoluteUrl(base, `/c/${c.slug}`))}</loc>`,
      `    <lastmod>${c.updatedAt.toISOString()}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      '    <priority>0.7</priority>',
      '  </url>',
    ]),
    ...products.flatMap((p) => [
      '  <url>',
      `    <loc>${xmlEscape(absoluteUrl(base, `/p/${p.slug}`))}</loc>`,
      `    <lastmod>${p.updatedAt.toISOString()}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      '    <priority>0.8</priority>',
      '  </url>',
    ]),
    '  <url>',
    `    <loc>${xmlEscape(absoluteUrl(base, '/faq'))}</loc>`,
    `    <lastmod>${nowISO}</lastmod>`,
    '    <changefreq>monthly</changefreq>',
    '    <priority>0.6</priority>',
    '  </url>',
    ...contentPages.flatMap((p) => [
      '  <url>',
      `    <loc>${xmlEscape(absoluteUrl(base, `/p/${p.slug}`))}</loc>`,
      `    <lastmod>${p.updatedAt.toISOString()}</lastmod>`,
      '    <changefreq>monthly</changefreq>',
      '    <priority>0.5</priority>',
      '  </url>',
    ]),
    // صفحهٔ اصلی وبلاگ (درخواست کاربر — ورودی سئو)
    '  <url>',
    `    <loc>${xmlEscape(absoluteUrl(base, '/blog'))}</loc>`,
    `    <lastmod>${nowISO}</lastmod>`,
    '    <changefreq>daily</changefreq>',
    '    <priority>0.8</priority>',
    '  </url>',
    ...posts.flatMap((p) => [
      '  <url>',
      `    <loc>${xmlEscape(absoluteUrl(base, `/blog/${p.slug}`))}</loc>`,
      `    <lastmod>${p.updatedAt.toISOString()}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      '    <priority>0.7</priority>',
      '  </url>',
    ]),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
}
