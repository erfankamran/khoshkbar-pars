import type { NextRequest } from 'next/server';
import { cdata, getEmallsItems } from '@/server/services/feed.service';
import { baseUrlFromHeaders } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * GET /feeds/emalls.xml — فید XML محصولات برای ایمالز
 *
 * ساختار استاندارد فید مقایسه قیمت (products/product) با فیلدهای:
 * id، title، link، price (تومان)، old_price، category، image، images،
 * brand، availability، stock، short_description، description، sku، attributes
 * همین داده در قالب JSON هم از /api/feeds/emalls در دسترس است.
 */
export async function GET(req: NextRequest) {
  const base = baseUrlFromHeaders(req.headers);
  const items = await getEmallsItems(base);

  const productBlocks = items
    .map((p) => {
      const lines: string[] = [];
      lines.push('  <product>');
      lines.push(`    <id>${cdata(p.id)}</id>`);
      lines.push(`    <title>${cdata(p.title)}</title>`);
      lines.push(`    <link>${cdata(p.url)}</link>`);
      lines.push(`    <price>${p.price}</price>`);
      if (p.old_price !== undefined) lines.push(`    <old_price>${p.old_price}</old_price>`);
      lines.push(`    <category>${cdata(p.category)}</category>`);
      lines.push(`    <image>${cdata(p.image)}</image>`);
      if (p.images.length > 1) {
        lines.push('    <images>');
        for (const img of p.images) lines.push(`      <image>${cdata(img)}</image>`);
        lines.push('    </images>');
      }
      lines.push(`    <brand>${cdata(p.brand)}</brand>`);
      lines.push(`    <availability>${p.availability}</availability>`);
      lines.push(`    <stock>${p.stock}</stock>`);
      if (p.sku) lines.push(`    <sku>${cdata(p.sku)}</sku>`);
      lines.push(`    <short_description>${cdata(p.short_desc)}</short_description>`);
      lines.push(`    <description>${cdata(p.description)}</description>`);
      if (p.attributes.length > 0) {
        lines.push('    <attributes>');
        for (const a of p.attributes) {
          lines.push('      <attribute>');
          lines.push(`        <key>${cdata(a.key)}</key>`);
          lines.push(`        <value>${cdata(a.value)}</value>`);
          lines.push('      </attribute>');
        }
        lines.push('    </attributes>');
      }
      lines.push(`    <updated_at>${p.updated_at}</updated_at>`);
      lines.push('  </product>');
      return lines.join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<products count="${items.length}">
${productBlocks}
</products>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
