import type { NextRequest } from 'next/server';
import { getTorobFeed } from '@/server/services/feed.service';
import { baseUrlFromHeaders } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * GET /api/feeds/torob?page=1 — فید رسمی ترب (Product API v3)
 *
 * ساختار پاسخ دقیقاً مطابق مستند رسمی ترب است:
 * https://github.com/torob/Torob-Sync → product_api_v3.md
 * (پاکت { ok, data } فروشگاه عمداً ندارد — ترب ساختار خام می‌خواهد)
 *
 * - قیمت به تومان (عدد صحیح)، availability بولی، تصاویر و page_url مطلق
 * - این آدرس در panel.torob.com به‌عنوان فید/API فروشگاه ثبت می‌شود
 */
export async function GET(req: NextRequest) {
  const pageParam = req.nextUrl.searchParams.get('page') ?? '1';
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
  const base = baseUrlFromHeaders(req.headers);
  const feed = await getTorobFeed(base, page);

  return new Response(JSON.stringify(feed), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // فید قیمت‌محور است؛ کش کوتاه ۵ دقیقه‌ای برای فشار کمتر روی DB
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
