import type { NextRequest } from 'next/server';
import { listPublishedPosts, postSeoDescription } from '@/server/services/blog.service';
import { absoluteUrl, baseUrlFromHeaders, toTehranISO } from '@/lib/site';
import { xmlEscape } from '@/server/services/feed.service';

export const dynamic = 'force-dynamic';

/**
 * GET /feeds/blog.xml — فید RSS وبلاگ (درخواست کاربر — ورودی سئو)
 *
 * - ۵۰ نوشتهٔ آخر منتشرشده؛ خوانندگان RSS و موتورهای جستجو مشترکان همیشگی‌اند
 * - dates با ISO تهران (+03:30) — هم‌راستا با فیدهای ترب/ایمالز
 */
export async function GET(req: NextRequest) {
  const base = baseUrlFromHeaders(req.headers);
  const { posts } = await listPublishedPosts({ take: 50 });

  const items = posts
    .map((p) => {
      const url = absoluteUrl(base, `/blog/${p.slug}`);
      const desc = postSeoDescription({ metaDescription: null, excerpt: p.excerpt, content: '', blocks: null }) || p.excerpt;
      return [
        '    <item>',
        `      <title>${xmlEscape(p.title)}</title>`,
        `      <link>${xmlEscape(url)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
        `      <pubDate>${xmlEscape(toTehranISO(p.publishedAt))}</pubDate>`,
        ...(p.excerpt ? [`      <description>${xmlEscape(desc.slice(0, 300))}</description>`] : []),
        ...(p.tags.length ? p.tags.map((t) => `      <category>${xmlEscape(t)}</category>`) : []),
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape('وبلاگ فروشگاه پارس')}</title>
    <link>${xmlEscape(absoluteUrl(base, '/blog'))}</link>
    <description>${xmlEscape('مقالات آجیل، خشکبار و تغذیهٔ سالم — فروشگاه پارس')}</description>
    <language>fa-ir</language>
    <lastBuildDate>${xmlEscape(toTehranISO(new Date()))}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
}
