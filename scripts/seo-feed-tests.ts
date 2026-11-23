/**
 * تست رگرسیون سئو و فیدهای مقایسه قیمت — فاز ۱۳
 *
 * پوشش:
 *  ۱) robots.txt پویا (بلاک /admin و /api + معرفی Sitemap)
 *  ۲) sitemap.xml (صفحه اصلی + همه محصولات + صفحات اختصاصی پنل)
 *  ۳) فید رسمی ترب — Product API v3 (ساختار مستند github.com/torob/Torob-Sync)
 *  ۴) فید ایمالز — XML + API استخراج JSON (سازگاری شمارش ردیف‌ها)
 *  ۵) صفحه استاندارد محصول /p/[slug] — متادیتا، canonical، JSON-LD، alt
 *  ۶) ۴۰۴ صحیح برای محصول ناموجود
 *  ۷) صفحه اصلی — متادیتا + alt همه تصاویر
 *
 * اجرا: bun scripts/seo-feed-tests.ts [baseUrl]
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';

let pass = 0;
let failCount = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    failCount++;
    failures.push(name);
    console.log(`  ❌ ${name} ${extra}`);
  }
}

async function getText(path: string): Promise<{ status: number; text: string; type: string }> {
  const res = await fetch(`${BASE}${path}`);
  return {
    status: res.status,
    text: await res.text(),
    type: res.headers.get('content-type') ?? '',
  };
}

async function getJson(path: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE}${path}`);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* بدنه غیر JSON */
  }
  return { status: res.status, json };
}

/** همه تگ‌های <img> HTML باید attribute alt داشته باشند */
function imgAltAudit(html: string): { total: number; missing: number } {
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  const missing = tags.filter((t) => !/\balt=/.test(t)).length;
  return { total: tags.length, missing };
}

function countMatches(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

// ————————————————————————————————
console.log('—— ۱) robots.txt پویا ——');
{
  const { status, text, type } = await getText('/robots.txt');
  check('GET /robots.txt → 200', status === 200);
  check('content-type متنی', type.includes('text/plain'));
  check('قانون Allow برای همه ربات‌ها', text.includes('User-agent: *') && text.includes('Allow: /'));
  check('بلاک /admin', text.includes('Disallow: /admin'));
  check('بلاک /api', text.includes('Disallow: /api/'));
  check('معرفی آدرس Sitemap مطلق', /Sitemap: https?:\/\/\S+\/sitemap\.xml/.test(text));
}

// ————————————————————————————————
console.log('—— ۲) sitemap.xml ——');
let productSlugs: string[] = [];
{
  const { status, text, type } = await getText('/sitemap.xml');
  check('GET /sitemap.xml → 200', status === 200);
  check('content-type XML', type.includes('xml'));
  check('ساختار XML معتبر (هدر + urlset)', text.startsWith('<?xml') && text.includes('<urlset'));
  check('namespace استاندارد sitemaps.org', text.includes('http://www.sitemaps.org/schemas/sitemap/0.9'));

  const list = await getJson('/api/products?limit=24');
  const data = (list.json as { data?: { items?: Array<{ slug: string }> } } | undefined)?.data;
  productSlugs = (data?.items ?? []).map((i) => i.slug);
  check('لیست محصولات از API خوانده شد (≥۱)', productSlugs.length >= 1, `got ${productSlugs.length}`);

  const pageUrls = countMatches(text, /<loc>/g);
  check('sitemap شامل صفحه اصلی', text.includes(`<loc>${BASE}/</loc>`), `BASE=${BASE}`);
  // صفحات اختصاصی پنل (درخواست کاربر) هم در sitemap می‌آیند → حداقل: اصلی + محصولات
  check('حداقل یک <url> برای صفحه اصلی و هر محصول', pageUrls >= productSlugs.length + 1, `loc=${pageUrls} slugs=${productSlugs.length}`);
  const sampleSlugs = productSlugs.slice(0, 3);
  check('آدرس /p/{slug} محصولات در sitemap هست', sampleSlugs.every((s) => text.includes(`/p/${s}</loc>`)));
  // هر محصول دقیقاً یک بار (اسلاگ صفحات محتوا از محصولات جدا است)
  const dup = sampleSlugs.some((s) => countMatches(text, new RegExp(`/p/${s}</loc>`, 'g')) !== 1);
  check('هر محصول دقیقاً یک <url> دارد', !dup);
  // اگر صفحهٔ محتوای فعال وجود داشته باشد، در sitemap هم هست (درخواست کاربر)
  const termsRes = await fetch(`${BASE}/p/terms`);
  if (termsRes.status === 200) {
    check('صفحهٔ محتوای فعال /p/terms در sitemap هست', text.includes('/p/terms</loc>'));
  }
  check('lastmod برای صفحات محصول هست', text.includes('<lastmod>'));
}

// ————————————————————————————————
console.log('—— ۳) فید رسمی ترب (Product API v3) ——');
interface TorobProduct {
  page_unique: string;
  page_url: string;
  product_group_id: string;
  title: string;
  current_price: number;
  old_price?: number;
  availability: boolean;
  category_name?: string;
  image_links: string[];
  spec: Record<string, string>;
  date_added: string;
}
interface TorobFeed {
  api_version: string;
  current_page: number | null;
  total: number;
  max_pages: number | null;
  products: TorobProduct[];
}
let torobTotal = -1;
{
  const { status, json } = await getJson('/api/feeds/torob');
  check('GET /api/feeds/torob → 200', status === 200);
  const feed = json as TorobFeed | null;
  check('api_version = torob_api_v3', feed?.api_version === 'torob_api_v3');
  check('صفحه‌بندی: current_page=1', feed?.current_page === 1);
  torobTotal = feed?.total ?? 0;
  check('total ≥ ۱ (واریانت‌های فعال)', torobTotal >= 1, `total=${torobTotal}`);
  check('max_pages سازگار', (feed?.max_pages ?? 0) >= 1);

  const ps = feed?.products ?? [];
  check('صفحه اول پر است', ps.length === Math.min(100, torobTotal), `got ${ps.length}`);
  check('page_unique یکتا', new Set(ps.map((p) => p.page_unique)).size === ps.length);
  check('page_url مطلق و به /p/ اشاره می‌کند', ps.every((p) => /^https?:\/\//.test(p.page_url) && p.page_url.includes('/p/')));
  check('قیمت تومان صحیح مثبت', ps.every((p) => Number.isInteger(p.current_price) && p.current_price > 0));
  check('availability بولی', ps.every((p) => typeof p.availability === 'boolean'));
  check('تصاویر مطلق و غیرخالی', ps.every((p) => Array.isArray(p.image_links) && p.image_links.length > 0 && p.image_links.every((u) => /^https?:\/\//.test(u))));
  check('spec دیکشنری است', ps.every((p) => typeof p.spec === 'object' && p.spec !== null));
  check('date_added با آفست تهران', ps.every((p) => /\+03:30$/.test(p.date_added)));
  check('گروه‌بندی واریانت‌ها (product_group_id)', ps.every((p) => typeof p.product_group_id === 'string' && p.product_group_id.length > 0));

  const first = ps[0];
  check('عنوان شامل برچسب وزن بسته است', typeof first?.title === 'string' && first.title.includes('بسته'));

  // صفحه‌بندی: صفحه فراتر از انتها → خالی
  const far = await getJson('/api/feeds/torob?page=999');
  const farFeed = far.json as TorobFeed | null;
  check('صفحه فراتر از انتها → 200 و خالی', far.status === 200 && (farFeed?.products.length ?? 1) === 0);
  check('صفحه فراتر: current_page=999', farFeed?.current_page === 999);
}

// ————————————————————————————————
console.log('—— ۴) فید ایمالز (XML + JSON) ——');
{
  const { status, text, type } = await getText('/feeds/emalls.xml');
  check('GET /feeds/emalls.xml → 200', status === 200);
  check('content-type XML', type.includes('xml'));
  check('ساختار XML معتبر', text.startsWith('<?xml') && text.includes('<products'));
  const productCount = countMatches(text, /<product>/g);
  check('تعداد <product> = total فید ترب (هم‌منبعی)', productCount === torobTotal, `xml=${productCount} torob=${torobTotal}`);
  check('لینک محصول مطلق در CDATA', text.includes('<link><![CDATA[http'));
  check('تصویر مطلق در CDATA', text.includes('<image><![CDATA[http'));
  check('قیمت عددی', /<price>\d+<\/price>/.test(text));
  check('وضعیت موجودی استاندارد', text.includes('<availability>in_stock</availability>') || text.includes('<availability>out_of_stock</availability>'));
  check('بسته‌شدن صحیح تگ‌ها', countMatches(text, /<product>/g) === countMatches(text, /<\/product>/g));

  const { status: jStatus, json } = await getJson('/api/feeds/emalls');
  check('GET /api/feeds/emalls → 200', jStatus === 200);
  const data = json as { count: number; products: Array<Record<string, unknown>> } | null;
  check('count سازگار با فید XML', data?.count === torobTotal, `json=${data?.count}`);
  const first = data?.products?.[0];
  check('فیلدهای اصلی ردیف JSON', !!first && typeof first.url === 'string' && typeof first.price === 'number' && typeof first.image === 'string');
  check('availability در JSON', first?.availability === 'in_stock' || first?.availability === 'out_of_stock');
}

// ————————————————————————————————
console.log('—— ۵) صفحه استاندارد محصول /p/[slug] ——');
{
  const slug = productSlugs[0];
  check('اسلاگ نمونه موجود', !!slug);

  const res = await fetch(`${BASE}/p/${slug}`);
  const html = await res.text();
  check(`GET /p/${slug} → 200`, res.status === 200);
  check('متادیتای title اختصاصی', html.includes('<title>') && !html.includes('پارس | فروشگاه خشکبار'));
  check('canonical به آدرس محصول', html.includes('rel="canonical"') && html.includes(`/p/${slug}`));
  check('OpenGraph (og:title)', html.includes('og:title'));
  check('Twitter Card', html.includes('twitter:card'));
  check('lang="fa" و dir="rtl"', html.includes('lang="fa"') && html.includes('dir="rtl"'));

  // JSON-LD — باید Product معتبر با Offer باشد
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1]
  );
  const parsed = ldBlocks
    .map((b) => {
      try {
        return JSON.parse(b) as { '@type'?: string; offers?: { priceCurrency?: string; price?: number }; aggregateRating?: Record<string, unknown> };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const productLd = parsed.find((x) => x['@type'] === 'Product');
  const breadcrumbLd = parsed.find((x) => x['@type'] === 'BreadcrumbList');
  const orgLd = parsed.find((x) => x['@type'] === 'OnlineStore');
  check('JSON-LD Product وجود دارد', !!productLd);
  check('JSON-LD Offer با IRR و قیمت مثبت', productLd?.offers?.priceCurrency === 'IRR' && Number(productLd?.offers?.price) > 0);
  check('JSON-LD BreadcrumbList وجود دارد', !!breadcrumbLd);
  check('JSON-LD OnlineStore سازمان (layout)', !!orgLd);

  // alt تصاویر صفحه محصول
  const audit = imgAltAudit(html);
  check('همه تصاویر صفحه محصول alt دارند', audit.total > 0 && audit.missing === 0, `total=${audit.total} missing=${audit.missing}`);
  check('تصاویر از مسیر /images/ سرو می‌شوند', html.includes('/images/products/') || html.includes('/icons/'));
}

// ————————————————————————————————
console.log('—— ۶) ۴۰۴ محصول ناموجود ——');
{
  const res = await fetch(`${BASE}/p/does-not-exist-xyz`);
  check('GET /p/{ناموجود} → 404', res.status === 404);
  const html = await res.text();
  check('صفحه ۴۰۴ دوستانه با لینک فروشگاه', html.includes('پیدا نشد') || html.includes('فروشگاه'));
}

// ————————————————————————————————
console.log('—— ۷) صفحه اصلی ——');
{
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  check('GET / → 200', res.status === 200);
  check('متادیتای OpenGraph صفحه اصلی', html.includes('og:title') && html.includes('og:site_name'));
  check('JSON-LD سازمان در صفحه اصلی', html.includes('"@type":"OnlineStore"'));
  const audit = imgAltAudit(html);
  check(`همه تصاویر صفحه اصلی alt دارند (${audit.total} تصویر)`, audit.missing === 0, `missing=${audit.missing}`);
}

// ————————————————————————————————
console.log('—— ۸) صفحه ادمین فید و سئو ——');
{
  const res = await fetch(`${BASE}/admin/feeds`);
  const html = await res.text();
  check('GET /admin/feeds → 200', res.status === 200);
  check('متادیتای noindex برای ادمین', html.includes('noindex'));
}

// ————————————————————————————————
console.log('————————————————');
console.log(`نتیجه: ${pass} ✅ | ${failCount} ❌`);
if (failCount > 0) {
  console.log('خطاها:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('SEO-FEED-TESTS: ALL GREEN ✅');
