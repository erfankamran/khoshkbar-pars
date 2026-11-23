import { unstable_cache } from 'next/cache';
import { CACHE_TAGS, STORE_CACHE_SCOPE } from '@/server/lib/cache-tags';
import { db } from '@/lib/db';
import { BRAND } from '@/lib/config';
import { parseShippingMethods, type ShippingMethod } from '@/server/services/shipping.service';

/**
 * محتوای صفحه اصلی: بنر، استوری، تنظیمات عمومی (فاز ۵)
 * هیچ کلید داخلی/مخفی از settings بیرون داده نمی‌شود (whitelist).
 */

// ——— بنرها — Expected queries: 1 ———
async function getBannersUncached() {
  const rows = await db.banner.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      title: true,
      subtitle: true,
      imageUrl: true,
      linkView: true,
      linkParams: true,
      sortOrder: true,
    },
  });

  return {
    items: rows.map((b) => {
      let params: Record<string, string> = {};
      if (b.linkParams) {
        try {
          const parsed: unknown = JSON.parse(b.linkParams);
          if (parsed && typeof parsed === 'object') {
            params = Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).filter(
                (x): x is [string, string] => typeof x[1] === 'string'
              )
            );
          }
        } catch {
          /* params خراب → مقصد خالی، UI نمی‌شکند */
        }
      }
      return {
        id: b.id,
        title: b.title,
        subtitle: b.subtitle,
        imageUrl: b.imageUrl,
        linkView: b.linkView,
        linkParams: params,
      };
    }),
  };
}

// ——— استوری‌ها گروه‌بندی‌شده — Expected queries: 1 ———
async function getStoriesUncached() {
  const rows = await db.story.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      groupKey: true,
      groupTitle: true,
      thumbUrl: true,
      mediaType: true,
      mediaUrl: true,
      caption: true,
      linkView: true,
      linkParams: true,
      sortOrder: true,
    },
  });

  // گروه‌بندی بر اساس groupKey — حفظ ترتیب اولین ظهور گروه
  const groups = new Map<
    string,
    {
      groupKey: string;
      groupTitle: string;
      thumbUrl: string;
      items: Array<{
        id: string;
        mediaType: string;
        mediaUrl: string;
        caption: string | null;
        linkView: string | null;
        linkParams: Record<string, string>;
      }>;
    }
  >();

  for (const s of rows) {
    let params: Record<string, string> = {};
    if (s.linkParams) {
      try {
        const parsed: unknown = JSON.parse(s.linkParams);
        if (parsed && typeof parsed === 'object') {
          params = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
              (x): x is [string, string] => typeof x[1] === 'string'
            )
          );
        }
      } catch {
        /* params خراب → بدون لینک */
      }
    }

    const group = groups.get(s.groupKey);
    const item = {
      id: s.id,
      mediaType: s.mediaType,
      mediaUrl: s.mediaUrl,
      caption: s.caption,
      linkView: s.linkView,
      linkParams: params,
    };
    if (group) group.items.push(item);
    else
      groups.set(s.groupKey, {
        groupKey: s.groupKey,
        groupTitle: s.groupTitle,
        thumbUrl: s.thumbUrl,
        items: [item],
      });
  }

  return { groups: Array.from(groups.values()) };
}

// ——— تنظیمات عمومی — Expected queries: 1 ———
const PUBLIC_SETTINGS = [
  'freeShippingThresholdToman',
  'deliveryFeeToman',
  'minOrderToman',
  'storeOpen',
  'supportPhone',
  // فاز ۱۵ — ارسال پستی و درگاه پرداخت (مرچنت کد عمداً عمومی نیست)
  'shippingMethods',
  'shippingNote',
  'onlineGatewayEnabled',
  'codEnabled',
  'gatewayProvider',
  // فاز ۲ — برند و تم (namespace پیشوندی؛ همه عمومی‌اند)
  'brand.name',
  'brand.fullName',
  'brand.tagline',
  'brand.slogan',
  'brand.description',
  'brand.logoUrl',
  'theme.primary',
  'theme.accent',
  // نقشه موقعیت فروشگاه — فقط مختصات؛ هیچ داده حساسی در آن نیست
  'store.mapLat',
  'store.mapLng',
  // اسکرین اسپلش (صفحه آغازین) — همه عمومی و بی‌خطرند (درخواست کاربر)
  'splash.enabled',
  'splash.logoUrl',
  'splash.backgroundColor',
  'splash.title',
  'splash.slogan',
  'splash.durationMs',
] as const;

/** پیش‌فرض‌های امن برند/تم برای کلیدهایی که هنوز ذخیره نشده‌اند */
const BRAND_THEME_DEFAULTS: Record<string, string> = {
  'brand.name': BRAND.name,
  'brand.fullName': BRAND.fullName,
  'brand.tagline': BRAND.tagline,
  'brand.slogan': BRAND.slogan,
  'brand.description': BRAND.description,
  'brand.logoUrl': '',
  'theme.primary': '#1f8f5a',
  'theme.accent': '#d9b352',
  // اسکرین اسپلش — پیش‌فرض‌ها هم‌راستا با پالت پارس و رفتار فعلی
  'splash.enabled': 'true',
  'splash.logoUrl': '',
  'splash.backgroundColor': '#06241a',
  'splash.title': '',
  'splash.slogan': '',
  'splash.durationMs': '1900',
};

export async function getPublicSettings() {
  const rows = await db.setting.findMany({
    where: { key: { in: [...PUBLIC_SETTINGS] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const out: Record<string, string | number | boolean | ShippingMethod[]> = {};
  for (const key of PUBLIC_SETTINGS) {
    if (key === 'shippingMethods') {
      out[key] = parseShippingMethods(map.get(key));
      continue;
    }
    const value = map.get(key);
    if (value === undefined) {
      // پیش‌فرض‌های امن برای کلیدهای بولی/متنی هنوز ذخیره‌نشده
      if (key === 'onlineGatewayEnabled' || key === 'codEnabled') out[key] = true;
      if (key === 'gatewayProvider') out[key] = 'SANDBOX';
      if (key in BRAND_THEME_DEFAULTS) out[key] = BRAND_THEME_DEFAULTS[key];
      continue;
    }
    const asNum = Number(value);
    if (value === 'true' || value === 'false') out[key] = value === 'true';
    else if (!Number.isNaN(asNum) && value.trim() !== '') out[key] = asNum;
    else out[key] = value;
  }
  return out;
}

// ——— برند و تم برای مصرف سمت سرور (متادیتا، JSON-LD، فیدها) — Expected queries: 1 ———

export interface BrandTheme {
  name: string;
  fullName: string;
  tagline: string;
  slogan: string;
  description: string;
  /** خالی = نشان پیش‌فرض */
  logoUrl: string;
  primary: string;
  accent: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** برند و تم فعال — ادغام مقادیر پنل روی پیش‌فرض‌های ثابت BRAND */
async function getBrandThemeUncached(): Promise<BrandTheme> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.keys(BRAND_THEME_DEFAULTS) } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const pick = (key: string, fallback: string): string => {
    const v = map.get(key)?.trim();
    return v !== undefined && v !== '' ? v : fallback;
  };
  const pickHex = (key: string, fallback: string): string => {
    const v = pick(key, fallback);
    return HEX_RE.test(v) ? v.toLowerCase() : fallback;
  };

  return {
    name: pick('brand.name', BRAND.name),
    fullName: pick('brand.fullName', BRAND.fullName),
    tagline: pick('brand.tagline', BRAND.tagline),
    slogan: pick('brand.slogan', BRAND.slogan),
    description: pick('brand.description', BRAND.description),
    logoUrl: pick('brand.logoUrl', ''),
    primary: pickHex('theme.primary', '#1f8f5a'),
    accent: pickHex('theme.accent', '#d9b352'),
  };
}

// ——— محتوای مستقل فروشگاه (فاز ۳) — خوانندهٔ عمومی ———
// FAQ / تماس / نمادها / لینک‌های فوتر — فقط فعال‌ها، به ترتیب نمایش.
// یک نقطهٔ خواندن برای نمای «سوالات متداول» و فوتر فروشگاه (Expected queries: ۴)

export interface SiteContentFaq {
  id: string;
  question: string;
  answer: string;
}

export interface SiteContentContact {
  id: string;
  label: string;
  phone: string;
}

export interface SiteContentBadge {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
}

export interface SiteContentFooterLink {
  id: string;
  title: string;
  url: string;
}

/**
 * لینک‌های بیرونی فروشگاه از env (درخواست کاربر) — در فوتر استفاده می‌شوند:
 *  - enamad    → لینک نماد اعتماد (اینماد)؛ معمولاً https://trustseal.enamad.ir/?id=…&Code=…
 *  - samandehi → لینک نشان ملی ساماندهی
 *  - torob     → لینک صفحهٔ فروشگاه در ترب
 *  - emalls    → لینک صفحهٔ فروشگاه در ایمالز
 * مدیریت از env یعنی بدون ورود به پنل و بدون rebuild (فقط ری‌استارت سرور).
 */
export type SiteContentServiceLinkKey = 'enamad' | 'samandehi' | 'torob' | 'emalls';

export interface SiteContentServiceLink {
  key: SiteContentServiceLinkKey;
  url: string;
}

export interface SiteContent {
  faq: SiteContentFaq[];
  contacts: SiteContentContact[];
  badges: SiteContentBadge[];
  footerLinks: SiteContentFooterLink[];
  // صفحات اختصاصی (درخواست کاربر) — فقط عنوان برای فوتر؛ متن با /api/pages/[slug]
  pages: Array<{ id: string; slug: string; title: string }>;
  // لینک‌های env (درخواست کاربر) — فقط مقادیر http(s) معتبر
  serviceLinks: SiteContentServiceLink[];
}

/** نگاشت لینک‌های بیرونی به نام متغیر محیطی — تک‌منبع حقیقت خواندن از env */
const SERVICE_LINK_ENV: Record<SiteContentServiceLinkKey, string> = {
  enamad: 'SHOP_ENAMAD_URL',
  samandehi: 'SHOP_SAMANDAHI_URL',
  torob: 'SHOP_TOROB_URL',
  emalls: 'SHOP_EMALLS_URL',
};

const HTTP_URL_RE = /^https?:\/\/\S+$/i;

/**
 * خواندن لینک‌های بیرونی از env — خالی یعنی «نمایش داده نشود».
 * امنیت: مقدار غیر http(s) یا دارای فاصله نادیده گرفته می‌شود تا هیچ
 * مقدار بیرونی نتواند پروتکل دیگری (مثل javascript:) تزریق کند.
 */
function getServiceLinks(): SiteContentServiceLink[] {
  const out: SiteContentServiceLink[] = [];
  for (const key of Object.keys(SERVICE_LINK_ENV) as SiteContentServiceLinkKey[]) {
    const raw = (process.env[SERVICE_LINK_ENV[key]] ?? '').trim();
    if (!raw || !HTTP_URL_RE.test(raw)) continue;
    out.push({ key, url: raw });
  }
  return out;
}

async function getSiteContentUncached(): Promise<Omit<SiteContent, 'serviceLinks'>> {
  const [faq, contacts, badges, footerLinks, pages] = await Promise.all([
    db.faqItem.findMany({
      where: { isActive: true },
      select: { id: true, question: true, answer: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
    db.contactNumber.findMany({
      where: { isActive: true },
      select: { id: true, label: true, phone: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
    db.trustBadge.findMany({
      where: { isActive: true },
      select: { id: true, title: true, imageUrl: true, linkUrl: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
    db.footerLink.findMany({
      where: { isActive: true },
      select: { id: true, title: true, url: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
    // صفحات فعال با نمایش در فوتر — چیپ خودکار فوتر (درخواست کاربر)
    db.contentPage.findMany({
      where: { isActive: true, showInFooter: true },
      select: { id: true, slug: true, title: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
  ]);
  return { faq, contacts, badges, footerLinks, pages };
}

// ——— صفحه اختصاصی با slug (درخواست کاربر) — Expected queries: ۱ ———

export interface PublicPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  // صفحه‌ساز با تمپلیت‌های آماده (درخواست کاربر)
  editorMode: 'markdown' | 'blocks';
  blocks: string | null; // JSON آرایهٔ بلوک‌ها
  updatedAt: string;
}

/** خواندن صفحه فعال با slug — غیرفعال/ناموجود → null */
export async function getPublicPageBySlug(slug: string): Promise<PublicPage | null> {
  const page = await db.contentPage.findFirst({
    where: { slug: slug.toLowerCase(), isActive: true },
    select: {
      id: true,
      slug: true,
      title: true,
      body: true,
      editorMode: true,
      blocks: true,
      updatedAt: true,
    },
  });
  if (!page) return null;
  return {
    ...page,
    editorMode: page.editorMode === 'blocks' ? 'blocks' : 'markdown',
    updatedAt: page.updatedAt.toISOString(),
  };
}

// ——— کش لایه خواندن (بازبینی پرفورمنس) — بازسازی فقط پس از mutation ادمین ———
// توجه: serviceLinks عمداً بیرون از unstable_cache خوانده می‌شود تا تغییر env
// بلافاصله پس از ری‌استارت سرور اعمال شود و منتظر انقضای کش (۳۰۰ ثانیه) نماند.
const getBannersCached = unstable_cache(getBannersUncached, ['content:banners', STORE_CACHE_SCOPE], { revalidate: 300, tags: [CACHE_TAGS.HOME] });
const getStoriesCached = unstable_cache(getStoriesUncached, ['content:stories', STORE_CACHE_SCOPE], { revalidate: 300, tags: [CACHE_TAGS.HOME] });
const getBrandThemeCached = unstable_cache(getBrandThemeUncached, ['content:brand', STORE_CACHE_SCOPE], { revalidate: 300, tags: [CACHE_TAGS.BRAND] });
const getSiteContentCached = unstable_cache(getSiteContentUncached, ['content:site', STORE_CACHE_SCOPE], { revalidate: 300, tags: [CACHE_TAGS.CONTENT] });

export async function getBanners(): Promise<Awaited<ReturnType<typeof getBannersUncached>>> {
  return getBannersCached();
}

export async function getStories(): Promise<Awaited<ReturnType<typeof getStoriesUncached>>> {
  return getStoriesCached();
}

export async function getBrandTheme(): Promise<BrandTheme> {
  return getBrandThemeCached();
}

export async function getSiteContent(): Promise<SiteContent> {
  return { ...(await getSiteContentCached()), serviceLinks: getServiceLinks() };
}
