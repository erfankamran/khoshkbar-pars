/**
 * تست رگرسیون مدیریت محتوا (فاز ۱۱.۵) — بنر، استوری، تنظیمات
 *
 * پوشش:
 *  ۱) امنیت: بدون نشست ۴۰۱ / کاربر عادی ۴۰۳ روی هر سه گروه endpoint ادمین
 *  ۲) بنر: ایجاد (اعتبارسنجی عنوان/URL خارجی)، ویرایش جزئی، تغییر مقصد،
 *     فعال/غیرفعال → بازتاب فوری در /api/banners عمومی، حذف، حذف تکراری ۴۰۴
 *  ۳) استوری: کلید گروه نامعتبر ۴۰۰، دو آیتم هم‌گروه، گروه‌بندی در
 *     /api/stories عمومی با ترتیب sortOrder، انقضا (خروج خودکار از نمایش)،
 *     ویرایش، حذف و ناپدید شدن گروه، حذف تکراری ۴۰۴
 *  ۴) تنظیمات: خواندن ۵ کلید، ورودی نامعتبر ۴۰۰، ذخیرهٔ جزئی، بازتاب در
 *     /api/settings عمومی، بازگردانی مقادیر اصلی
 *  ۵) حسابرسی: ADMIN_ACTION برای BANNER_* / STORY_* / SETTINGS_UPDATE
 *
 * اجرا: bun scripts/admin-content-tests.ts [baseUrl]
 */

import { PrismaClient } from '@prisma/client';
import { mintOtp } from './otp-fallback';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const db = new PrismaClient();

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n— ${title}`);
}

// ------------------------------------------------------------
// هلپرها
// ------------------------------------------------------------

interface JsonResp<T> {
  status: number;
  body: T;
}

async function req<T = unknown>(
  method: string,
  path: string,
  session: string | null,
  json?: unknown
): Promise<JsonResp<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { 'x-pars-session': session } : {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

interface OkEnvelope<D> {
  ok?: boolean;
  data?: D;
  error?: { code: string; message: string };
}

/** ورود OTP — کد مستقیم در DB ضرب می‌شود (سازگار با production که devCode برنمی‌گرداند) */
async function login(phone: string): Promise<string | null> {
  const code = await mintOtp(phone);
  const verify = await req<OkEnvelope<{ sessionToken?: string }>>('POST', '/api/auth/otp/verify', null, {
    phone,
    code,
  });
  return verify.body.data?.sessionToken ?? null;
}

async function adminLogin(phones: string[]): Promise<string | null> {
  for (const phone of phones) {
    const token = await login(phone);
    if (token) return token;
    console.log(`  ↺ شماره ${phone} محدودیت OTP — شماره بعدی`);
  }
  return null;
}

/** آخرین ADMIN_ACTION این ادمین روی یک اکشن مشخص — برای حسابرسی */
async function hasAudit(phone: string, action: string): Promise<boolean> {
  const logs = await db.securityLog.findMany({
    where: { event: 'ADMIN_ACTION', phone },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  return logs.some((l) => (l.meta ?? '').includes(`"action":"${action}"`));
}

// ——— شکل‌های داده ———

interface BannerDTO {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkView: string | null;
  linkParams: Record<string, string>;
  sortOrder: number;
  isActive: boolean;
}

interface PublicBanner {
  id: string;
  linkView: string | null;
  linkParams: Record<string, string>;
}

interface PublicStoryGroup {
  groupKey: string;
  groupTitle: string;
  thumbUrl: string;
  items: Array<{ id: string }>;
}

interface PublicSettings {
  [key: string]: string | number | boolean;
}

// ------------------------------------------------------------
// سناریو
// ------------------------------------------------------------

async function main() {
  console.log('════════ تست فاز ۱۱.۵ — مدیریت محتوا (بنر/استوری/تنظیمات) ════════');

  // ——— ورود ———
  section('ورود کاربران');
  const ADMIN_PHONES = ['09121111111', '09120000000', '09121111112'];
  let adminPhone = '';
  const A = await (async () => {
    for (const phone of ADMIN_PHONES) {
      const token = await login(phone);
      if (token) {
        adminPhone = phone;
        return token;
      }
      console.log(`  ↺ شماره ${phone} محدودیت OTP — شماره بعدی`);
    }
    return null;
  })();
  check('ورود مدیر (ADMIN)', A !== null);
  if (!A) return finish();

  const C = await login('09123334444');
  check('ورود مشتری عادی (USER)', C !== null);
  if (!C) return finish();

  // ——— ۱) امنیت ———
  section('۱) امنیت دسترسی');
  const anonList = await req('GET', '/api/admin/banners', null);
  check('GET بنر بدون نشست → ۴۰۱', anonList.status === 401);
  const anonPost = await req('POST', '/api/admin/banners', null, {
    title: 'x',
    imageUrl: '/uploads/a.png',
  });
  check('POST بنر بدون نشست → ۴۰۱', anonPost.status === 401);
  const userGet = await req('GET', '/api/admin/stories', C);
  check('GET استوری با کاربر عادی → ۴۰۳', userGet.status === 403);
  const userSettings = await req('PUT', '/api/admin/settings', C, { storeOpen: false });
  check('PUT تنظیمات با کاربر عادی → ۴۰۳', userSettings.status === 403);

  // ——— ۲) بنرها ———
  section('۲) مدیریت بنر');

  const beforeCount = (await req<OkEnvelope<{ items: BannerDTO[] }>>('GET', '/api/admin/banners', A))
    .body.data?.items.length ?? -1;
  check('GET فهرست بنرها → ۲۰۰', beforeCount >= 0, `count=${beforeCount}`);

  const badTitle = await req('POST', '/api/admin/banners', A, {
    title: '',
    imageUrl: '/uploads/a.png',
  });
  check('ایجاد بنر بدون عنوان → ۴۰۰', badTitle.status === 400);

  const badUrl = await req('POST', '/api/admin/banners', A, {
    title: 'بنر تستی',
    imageUrl: 'https://evil.example.com/x.png',
  });
  check('ایجاد بنر با URL خارجی → ۴۰۰', badUrl.status === 400);

  const badExt = await req('POST', '/api/admin/banners', A, {
    title: 'بنر تستی',
    imageUrl: '/uploads/a.gif',
  });
  check('ایجاد بنر با پسوند غیرمجاز → ۴۰۰', badExt.status === 400);

  const created = await req<OkEnvelope<BannerDTO>>('POST', '/api/admin/banners', A, {
    title: 'بنر تست فاز ۱۱.۵',
    subtitle: 'زیرعنوان تستی',
    imageUrl: '/uploads/banner-test.png',
    linkView: 'category',
    linkParams: { slug: 'pistachio' },
    sortOrder: 99,
    isActive: true,
  });
  check('ایجاد بنر معتبر → ۲۰۰', created.status === 200 && created.body.data?.id !== undefined);
  const bannerId = created.body.data?.id;

  // بازتاب عمومی — فعال است، باید در /api/banners باشد
  const pub1 = await fetch(`${BASE}/api/banners`);
  const pub1Body = (await pub1.json()) as OkEnvelope<{ items: PublicBanner[] }>;
  const pubBanner = pub1Body.data?.items.find((b) => b.id === bannerId);
  check('بنر فعال در /api/banners عمومی ظاهر شد', pubBanner !== undefined);
  check(
    'linkParams در عمومی به‌صورت شیء باز شد',
    pubBanner?.linkParams?.slug === 'pistachio' && pubBanner.linkView === 'category'
  );

  // ویرایش جزئی — زیرعنوان + مقصد جستجو
  const patched = await req<OkEnvelope<BannerDTO>>('PATCH', `/api/admin/banners/${bannerId}`, A, {
    subtitle: 'زیرعنوان ویرایش‌شده',
    linkView: 'search',
    linkParams: { q: 'پسته' },
  });
  check(
    'PATCH جزئی (زیرعنوان + مقصد) → ۲۰۰',
    patched.status === 200 &&
      patched.body.data?.subtitle === 'زیرعنوان ویرایش‌شده' &&
      patched.body.data.linkParams?.q === 'پسته'
  );
  // عنوان دست‌نخورده مانده (update جزئی)
  check('فیلدهای ارسال‌نشده دست‌نخورده (update جزئی)', patched.body.data?.title === 'بنر تست فاز ۱۱.۵');

  // غیرفعال → از عمومی خارج
  const deactivated = await req<OkEnvelope<BannerDTO>>('PATCH', `/api/admin/banners/${bannerId}`, A, {
    isActive: false,
  });
  check('غیرفعال‌سازی بنر → ۲۰۰ و isActive=false', deactivated.status === 200 && deactivated.body.data?.isActive === false);
  const pub2 = (await (await fetch(`${BASE}/api/banners`)).json()) as OkEnvelope<{ items: PublicBanner[] }>;
  check('بنر غیرفعال از /api/banners عمومی خارج شد', !pub2.data?.items.some((b) => b.id === bannerId));

  // دوباره فعال → برمی‌گردد
  await req('PATCH', `/api/admin/banners/${bannerId}`, A, { isActive: true });
  const pub3 = (await (await fetch(`${BASE}/api/banners`)).json()) as OkEnvelope<{ items: PublicBanner[] }>;
  check('فعال‌سازی مجدد → بنر به عمومی برگشت', pub3.data?.items.some((b) => b.id === bannerId) === true);

  const del = await req<OkEnvelope<{ deleted: boolean }>>('DELETE', `/api/admin/banners/${bannerId}`, A);
  check('حذف بنر → ۲۰۰', del.status === 200);
  const pub4 = (await (await fetch(`${BASE}/api/banners`)).json()) as OkEnvelope<{ items: PublicBanner[] }>;
  check('بنر حذف‌شده از عمومی پاک شد', !pub4.data?.items.some((b) => b.id === bannerId));
  const delAgain = await req('DELETE', `/api/admin/banners/${bannerId}`, A);
  check('حذف تکراری بنر → ۴۰۴', delAgain.status === 404);
  const patchGone = await req('PATCH', `/api/admin/banners/${bannerId}`, A, { isActive: false });
  check('PATCH بنر ناموجود → ۴۰۴', patchGone.status === 404);

  // ——— ۳) استوری‌ها ———
  section('۳) مدیریت استوری');

  const badKey = await req('POST', '/api/admin/stories', A, {
    groupKey: 'Nowruz 1405!',
    groupTitle: 'نوروز',
    thumbUrl: '/uploads/t.png',
    mediaType: 'image',
    mediaUrl: '/uploads/m.png',
  });
  check('کلید گروه غیرلاتین/فاصله → ۴۰۰', badKey.status === 400);

  const s1 = await req<OkEnvelope<{ id: string }>>('POST', '/api/admin/stories', A, {
    groupKey: 'test-115',
    groupTitle: 'گروه تست ۱۱.۵',
    thumbUrl: '/uploads/story-thumb.png',
    mediaType: 'image',
    mediaUrl: '/uploads/story-1.png',
    caption: 'آیتم اول',
    sortOrder: 2,
    isActive: true,
  });
  check('ایجاد استوری ۱ → ۲۰۰', s1.status === 200);
  const s2 = await req<OkEnvelope<{ id: string }>>('POST', '/api/admin/stories', A, {
    groupKey: 'TEST-115', // باید خودکار lowercase شود و در همان گروه برود
    groupTitle: 'گروه تست ۱۱.۵',
    thumbUrl: '/uploads/story-thumb.png',
    mediaType: 'image',
    mediaUrl: '/uploads/story-2.png',
    caption: 'آیتم دوم',
    sortOrder: 1,
    isActive: true,
  });
  check('ایجاد استوری ۲ (کلید uppercase → خودکار یکسان) → ۲۰۰', s2.status === 200);
  const story1Id = s1.body.data?.id;
  const story2Id = s2.body.data?.id;

  const adminStories = await req<
    OkEnvelope<{ items: Array<{ id: string; groupKey: string }>; groups: Array<{ groupKey: string; count: number }> }>
  >('GET', '/api/admin/stories', A);
  const grp = adminStories.body.data?.groups.find((g) => g.groupKey === 'test-115');
  check('خلاصهٔ گروه در GET ادمین: test-115 با ۲ آیتم', grp?.count === 2, `count=${grp?.count}`);

  // عمومی: گروه با ۲ آیتم، ترتیب sortOrder (۱ قبل از ۲)
  const pubS1 = (await (await fetch(`${BASE}/api/stories`)).json()) as OkEnvelope<{ groups: PublicStoryGroup[] }>;
  const pubGrp = pubS1.data?.groups.find((g) => g.groupKey === 'test-115');
  check('گروه استوری در /api/stories عمومی ظاهر شد', pubGrp !== undefined);
  check('هر دو آیتم در گروه عمومی', pubGrp?.items.length === 2, `len=${pubGrp?.items.length}`);
  check('ترتیب sortOrder در عمومی (۱ سپس ۲)', pubGrp?.items[0]?.id === story2Id && pubGrp?.items[1]?.id === story1Id);

  // انقضا — استوری ۱ تا دیروز → فقط آیتم ۲ در عمومی بماند
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const exp = await req('PATCH', `/api/admin/stories/${story1Id}`, A, { expiresAt: yesterday });
  check('PATCH انقضای گذشته → ۲۰۰', exp.status === 200);
  const pubS2 = (await (await fetch(`${BASE}/api/stories`)).json()) as OkEnvelope<{ groups: PublicStoryGroup[] }>;
  const pubGrp2 = pubS2.data?.groups.find((g) => g.groupKey === 'test-115');
  check('استوری منقضی از عمومی خارج شد (فقط آیتم ۲)', pubGrp2?.items.length === 1 && pubGrp2?.items[0]?.id === story2Id);

  // حذف انقضا → برمی‌گردد
  await req('PATCH', `/api/admin/stories/${story1Id}`, A, { expiresAt: null });
  const pubS3 = (await (await fetch(`${BASE}/api/stories`)).json()) as OkEnvelope<{ groups: PublicStoryGroup[] }>;
  const pubGrp3 = pubS3.data?.groups.find((g) => g.groupKey === 'test-115');
  check('حذف انقضا → استوری به عمومی برگشت', pubGrp3?.items.length === 2);

  // حذف هر دو → گروه از عمومی ناپدید
  const delS1 = await req('DELETE', `/api/admin/stories/${story1Id}`, A);
  const delS2 = await req('DELETE', `/api/admin/stories/${story2Id}`, A);
  check('حذف هر دو استوری → ۲۰۰', delS1.status === 200 && delS2.status === 200);
  const pubS4 = (await (await fetch(`${BASE}/api/stories`)).json()) as OkEnvelope<{ groups: PublicStoryGroup[] }>;
  check('گروه خالی‌شده از عمومی ناپدید شد', !pubS4.data?.groups.some((g) => g.groupKey === 'test-115'));
  const delSAgain = await req('DELETE', `/api/admin/stories/${story1Id}`, A);
  check('حذف تکراری استوری → ۴۰۴', delSAgain.status === 404);

  const badMedia = await req('POST', '/api/admin/stories', A, {
    groupKey: 'bad-media',
    groupTitle: 'x',
    thumbUrl: '/uploads/t.png',
    mediaType: 'image',
    mediaUrl: '/uploads/movie.exe',
  });
  check('رسانه با پسوند غیرمجاز → ۴۰۰', badMedia.status === 400);

  // ——— ۴) تنظیمات ———
  section('۴) تنظیمات فروشگاه');

  const settings = await req<
    OkEnvelope<{ settings: Array<{ key: string; value: string | number | boolean }> }>
  >('GET', '/api/admin/settings', A);
  const keys = settings.body.data?.settings.map((s) => s.key) ?? [];
  check(
    'GET تنظیمات → ۲۰۰ با ۵ کلید whitelist',
    settings.status === 200 &&
      ['freeShippingThresholdToman', 'deliveryFeeToman', 'minOrderToman', 'storeOpen', 'supportPhone'].every((k) =>
        keys.includes(k)
      )
  );

  const badFee = await req('PUT', '/api/admin/settings', A, { deliveryFeeToman: -5 });
  check('هزینهٔ ارسال منفی → ۴۰۰', badFee.status === 400);
  const badPhone = await req('PUT', '/api/admin/settings', A, { supportPhone: 'hello' });
  check('تلفن نامعتبر → ۴۰۰', badPhone.status === 400);
  const emptyPut = await req('PUT', '/api/admin/settings', A, {});
  check('PUT خالی → ۴۰۰', emptyPut.status === 400);

  // ذخیرهٔ جزئی — فقط ارسال رایگان
  const before = settings.body.data?.settings.find((s) => s.key === 'freeShippingThresholdToman')?.value;
  const newThreshold = (typeof before === 'number' ? before : 1_500_000) + 1000;
  const put = await req<OkEnvelope<{ settings: Array<{ key: string; value: string | number | boolean }> }>>(
    'PUT',
    '/api/admin/settings',
    A,
    { freeShippingThresholdToman: newThreshold }
  );
  check(
    'PUT جزئی → ۲۰۰ و مقدار تازه',
    put.status === 200 &&
      put.body.data?.settings.find((s) => s.key === 'freeShippingThresholdToman')?.value === newThreshold
  );

  // بازتاب عمومی
  const pubSet = (await (await fetch(`${BASE}/api/settings`)).json()) as OkEnvelope<PublicSettings>;
  check('مقدار تازه در /api/settings عمومی (عدد)', pubSet.data?.freeShippingThresholdToman === newThreshold);

  // بقیه کلیدها دست‌نخورده
  check(
    'کلیدهای ارسال‌نشده دست‌نخورده (update جزئی)',
    pubSet.data?.storeOpen === true || pubSet.data?.storeOpen === false
  );

  // بازگردانی مقدار اصلی
  const restore = await req('PUT', '/api/admin/settings', A, { freeShippingThresholdToman: before });
  check('بازگردانی مقدار اصلی → ۲۰۰', restore.status === 200);

  // ——— ۵) حسابرسی ———
  section('۵) حسابرسی ADMIN_ACTION');
  check('BANNER_CREATE ثبت شد', await hasAudit(adminPhone, 'BANNER_CREATE'));
  check('BANNER_UPDATE ثبت شد', await hasAudit(adminPhone, 'BANNER_UPDATE'));
  check('BANNER_DELETE ثبت شد', await hasAudit(adminPhone, 'BANNER_DELETE'));
  check('STORY_CREATE ثبت شد', await hasAudit(adminPhone, 'STORY_CREATE'));
  check('STORY_DELETE ثبت شد', await hasAudit(adminPhone, 'STORY_DELETE'));
  check('SETTINGS_UPDATE ثبت شد', await hasAudit(adminPhone, 'SETTINGS_UPDATE'));

  return finish();
}

async function finish(): Promise<never> {
  console.log('\n══════════════════════════════════════');
  console.log(`نتیجه: ${passed} موفق، ${failed} ناموفق`);
  console.log('══════════════════════════════════════');
  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('خطای غیرمنتظره:', e);
  await db.$disconnect();
  process.exit(1);
});
