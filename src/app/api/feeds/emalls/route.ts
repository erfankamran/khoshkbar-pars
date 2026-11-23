import type { NextRequest } from 'next/server';
import { getEmallsItems } from '@/server/services/feed.service';
import { getBrandTheme } from '@/server/services/content.service';
import { baseUrlFromHeaders } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * GET /api/feeds/emalls — API استخراج محصولات ایمالز (JSON)
 *
 * هم‌ارز خروجی افزونه رسمی «Emalls Extraction API» ایمالز:
 * نام، قیمت، تصاویر، مشخصات، گارانتی و وضعیت موجودی — تا ربات/وب‌سرویس
 * ایمالز بتواند کاتالوگ را بخواند و به صفحات متناظر متصل کند.
 * (نسخه XML همین داده: /feeds/emalls.xml)
 */
export async function GET(req: NextRequest) {
  const base = baseUrlFromHeaders(req.headers);
  // فاز ۲ — نام فروشگاه از تنظیمات برند (پیش‌فرض: فروشگاه پارس)
  const [products, brand] = await Promise.all([getEmallsItems(base), getBrandTheme()]);

  return new Response(
    JSON.stringify({
      shop: { name: brand.fullName || 'فروشگاه پارس', currency: 'IRT' },
      count: products.length,
      products,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      },
    }
  );
}
