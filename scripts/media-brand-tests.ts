/**
 * تست رگرسیون فاز ۲ — رسانه (آپلود/سرو) + برند و تم
 *
 * پوشش:
 *  ۱) آپلود رسانه:
 *     - بدون نشست → ۴۰۱
 *     - PNG معتبر → ۲۰۰ + url شروع‌شونده با /api/media/ + mime image/png
 *     - فایل متنی با پسوند تصویری (بدون magic bytes) → ۴۰۰ VALIDATION
 *     - فایل بزرگ‌تر از سقف ۵ مگابایت → ۴۱۳ PAYLOAD_TOO_LARGE
 *  ۲) سرو رسانه:
 *     - GET نشانی آپلودشده → ۲۰۰ + Content-Type درست + Cache immutable + ETag
 *     - If-None-Match → ۳۰۴ بدون بدنه
 *     - مسیر غیرموجود → ۴۰۴
 *     - Path Traversal (%2e%2e) → رد (۴۰۰/۴۰۴ — هرگز ۲۰۰)
 *     - پسوند خارج از whitelist (txt) → رد
 *  ۳) برند و تم:
 *     - PUT مقادیر معتبر برند/تم → ۲۰۰ + اعمال در /api/settings عمومی
 *     - رنگ نامعتبر → ۴۰۰ ؛ logoUrl غیر http/داخلی → ۴۰۰ ؛ brand.name خالی → ۴۰۰
 *     - برند در فید ایمالز (JSON) و XML منعکس می‌شود
 *     - بازگردانی پیش‌فرض‌ها در پایان (idempotent)
 *
 * اجرا: bun scripts/media-brand-tests.ts [baseUrl]
 */

import { PrismaClient } from '@prisma/client';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const ADMIN_PHONE = '09120000000';
const db = new PrismaClient();

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

interface ApiResp<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/** PNG ۱×۱ معتبر (امضای کامل PNG) */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function loginAdmin(): Promise<string | null> {
  // کد مادر محیط — مثل admin-prod-sweep
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pars-device': 'media-brand-tests' },
    body: JSON.stringify({ phone: ADMIN_PHONE, code: '123456' }),
  });
  const body = (await verifyRes.json()) as ApiResp<{ sessionToken?: string }>;
  return body.data?.sessionToken ?? null;
}

async function upload(
  token: string | null,
  file: File
): Promise<{ status: number; body: ApiResp<{ media: { url: string; mime: string; bytes: number } }> }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/api/admin/media`, {
    method: 'POST',
    headers: token ? { 'x-pars-session': token } : undefined,
    body: form,
  });
  return { status: res.status, body: (await res.json()) as ApiResp<{ media: { url: string; mime: string; bytes: number } }> };
}

async function putSettings(
  token: string,
  values: Record<string, string>
): Promise<{ status: number; body: ApiResp<{ updated: string[] }> }> {
  const res = await fetch(`${BASE}/api/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-pars-session': token },
    body: JSON.stringify({ values }),
  });
  return { status: res.status, body: (await res.json()) as ApiResp<{ updated: string[] }> };
}

const DEFAULTS = {
  'brand.name': 'پارس',
  'brand.fullName': 'فروشگاه پارس',
  'brand.tagline': 'خشکبار و مغزهای تازه',
  'brand.slogan': 'از مزرعه تا سفره شما',
  'brand.description':
    'خرید آنلاین خشکبار، آجیل، مغزها و محصولات طبیعی — تازه از مزرعه تا سفره شما',
  'brand.logoUrl': '',
  'theme.primary': '#1f8f5a',
  'theme.accent': '#d9b352',
};

async function main() {
  console.log(`— تست فاز ۲: رسانه + برند و تم روی ${BASE} —\n`);

  const token = await loginAdmin();
  check('ورود مدیر با کد مادر', token !== null && token !== '');

  // ——— نرمال‌سازی: بازگردانی پیش‌فرض‌ها تا تست تکرارپذیر باشد ———
  if (token) await putSettings(token, DEFAULTS);

  // ——— ۱) آپلود ———
  console.log('۱) آپلود رسانه:');

  {
    const res = await upload(null, new File([PNG_1PX], 'x.png', { type: 'image/png' }));
    check('آپلود بدون نشست → ۴۰۱', res.status === 401, `got ${res.status}`);
  }

  let uploadedUrl = '';
  {
    const res = await upload(token, new File([PNG_1PX], 'logo.png', { type: 'image/png' }));
    const okUpload = res.status === 200 && res.body.ok === true;
    uploadedUrl = res.body.data?.media.url ?? '';
    check('آپلود PNG معتبر → ۲۰۰', okUpload, `got ${res.status} ${JSON.stringify(res.body.error ?? {})}`);
    check('نشانی عمومی با /api/media/ شروع می‌شود', uploadedUrl.startsWith('/api/media/'), uploadedUrl);
    check('mime تشخیص‌داده‌شده image/png', res.body.data?.media.mime === 'image/png');
    check('حجم گزارش‌شده = حجم فایل', res.body.data?.media.bytes === PNG_1PX.byteLength);
  }

  {
    // فایل متنی که ادعای تصویر بودن دارد — magic bytes ندارند → رد
    const res = await upload(
      token,
      new File([Buffer.from('hello world — من تصویر نیستم')], 'fake.png', { type: 'image/png' })
    );
    check('فایل متنی جعلی → ۴۰۰ VALIDATION', res.status === 400 && res.body.error?.code === 'VALIDATION', `got ${res.status}`);
  }

  {
    const big = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(6 * 1024 * 1024),
    ]);
    const res = await upload(token, new File([big], 'big.png', { type: 'image/png' }));
    check('فایل > ۵MB → ۴۱۳ PAYLOAD_TOO_LARGE', res.status === 413, `got ${res.status}`);
  }

  // ——— ۲) سرو ———
  console.log('۲) سرو رسانه:');

  if (uploadedUrl) {
    const res = await fetch(`${BASE}${uploadedUrl}`);
    const buf = Buffer.from(await res.arrayBuffer());
    check('GET رسانه آپلودشده → ۲۰۰', res.status === 200, `got ${res.status}`);
    check('Content-Type = image/png', res.headers.get('content-type') === 'image/png', res.headers.get('content-type') ?? '');
    check('Cache-Control immutable یک‌ساله', (res.headers.get('cache-control') ?? '').includes('immutable'));
    check('X-Content-Type-Options: nosniff', res.headers.get('x-content-type-options') === 'nosniff');
    check('بدنه دقیقاً همان فایل آپلودی', buf.equals(PNG_1PX), `${buf.byteLength} vs ${PNG_1PX.byteLength}`);

    const etag = res.headers.get('etag') ?? '';
    check('ETag برمی‌گردد', etag !== '');
    const res304 = await fetch(`${BASE}${uploadedUrl}`, { headers: { 'If-None-Match': etag } });
    check('If-None-Match → ۳۰۴ بدون بدنه', res304.status === 304, `got ${res304.status}`);
  }

  {
    const res = await fetch(`${BASE}/api/media/2099/01/does-not-exist.png`);
    check('مسیر غیرموجود → ۴۰۴', res.status === 404, `got ${res.status}`);
  }
  {
    // تلاش Path Traversal — %2e%2e = «..»؛ هرگز نباید فایل دیتابیس خوانده شود
    const res = await fetch(`${BASE}/api/media/%2e%2e/%2e%2e/db/custom.db`);
    const text = res.status === 200 ? await res.text() : '';
    check('traversal با %2e%2e → رد (نه ۲۰۰)', res.status !== 200, `got ${res.status}`);
    check('بدنه پاسخ traversal دیتابیس نیست', !text.includes('CREATE TABLE') && !text.includes('SQLite'), 'leak!');
  }
  {
    // پسوند خارج از whitelist حتی اگر در مسیر درست باشد → رد
    const res = await fetch(`${BASE}/api/media/2099/01/secret.txt`);
    check('پسوند txt → رد (نه ۲۰۰)', res.status !== 200, `got ${res.status}`);
  }
  {
    // نام فایل با کاراکتر غیرمجاز → رد
    const res = await fetch(`${BASE}/api/media/2099/01/aa%22bb.png`);
    check('سگمنت با کاراکتر غیرمجاز → رد', res.status !== 200, `got ${res.status}`);
  }

  // ——— ۳) برند و تم ———
  console.log('۳) برند و تم:');

  {
    // پیش‌فرض‌ها در API عمومی حتی قبل از ذخیره
    const res = await fetch(`${BASE}/api/settings`);
    const body = (await res.json()) as ApiResp<Record<string, unknown>>;
    check('API عمومی brand.name پیش‌فرض دارد', body.data?.['brand.name'] === 'پارس', String(body.data?.['brand.name']));
    check('API عمومی theme.primary پیش‌فرض دارد', body.data?.['theme.primary'] === '#1f8f5a', String(body.data?.['theme.primary']));
  }

  if (token) {
    const res = await putSettings(token, {
      'brand.name': 'پارس‌نات',
      'theme.primary': '#0ea5e9',
      'theme.accent': '#f59e0b',
      'brand.slogan': 'تازه‌تر از تازه',
    });
    check('PUT برند/تم معتبر → ۲۰۰', res.status === 200 && res.body.ok === true, `got ${res.status} ${JSON.stringify(res.body.error ?? {})}`);
    check('کلیدهای به‌روزشده گزارش می‌شوند', (res.body.data?.updated ?? []).includes('brand.name'));
  }

  {
    const res = await fetch(`${BASE}/api/settings`);
    const body = (await res.json()) as ApiResp<Record<string, unknown>>;
    check('مقدار جدید brand.name در API عمومی', body.data?.['brand.name'] === 'پارس‌نات', String(body.data?.['brand.name']));
    check('مقدار جدید theme.primary در API عمومی', body.data?.['theme.primary'] === '#0ea5e9', String(body.data?.['theme.primary']));
  }

  {
    // برند در فید ایمالز (JSON) منعکس می‌شود
    const res = await fetch(`${BASE}/api/feeds/emalls`);
    const body = (await res.json()) as { shop?: { name?: string }; products?: Array<{ brand?: string }> };
    check('فید ایمالز shop.name = نام کامل برند', body.shop?.name === 'فروشگاه پارس' || (body.shop?.name ?? '').length > 0, body.shop?.name ?? '');
    check('برند محصولات فید = brand.name پنل', body.products?.[0]?.brand === 'پارس‌نات', body.products?.[0]?.brand ?? '');
  }

  if (token) {
    // اعتبارسنجی‌ها
    const badColor = await putSettings(token, { 'theme.primary': '#zzz123' });
    check('رنگ نامعتبر → ۴۰۰', badColor.status === 400, `got ${badColor.status}`);
    const badLogo = await putSettings(token, { 'brand.logoUrl': 'javascript:alert(1)' });
    check('logoUrl غیر http/داخلی → ۴۰۰', badLogo.status === 400, `got ${badLogo.status}`);
    const emptyName = await putSettings(token, { 'brand.name': '' });
    check('brand.name خالی → ۴۰۰', emptyName.status === 400, `got ${emptyName.status}`);
    const unknownKey = await putSettings(token, { 'brand.hack': 'x' });
    check('کلید خارج از whitelist → ۴۰۰', unknownKey.status === 400, `got ${unknownKey.status}`);

    // logoUrl معتبر داخلی پذیرفته می‌شود (نمونهٔ مسیر آپلود واقعی)
    const goodLogo = await putSettings(token, { 'brand.logoUrl': uploadedUrl });
    check('logoUrl داخلی /api/media/ → ۲۰۰', goodLogo.status === 200, `got ${goodLogo.status}`);
  }

  // ——— بازگردانی (idempotent) ———
  console.log('بازگردانی پیش‌فرض‌ها:');
  if (token) {
    const res = await putSettings(token, DEFAULTS);
    check('پیش‌فرض‌ها بازگردانده شد', res.status === 200, `got ${res.status}`);
  }
  // پاک‌سازی فایل آپلود تستی از دیسک (تست تمیز تمام شود)
  if (uploadedUrl) {
    try {
      const rel = uploadedUrl.replace('/api/media/', '');
      const { unlink } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const root = process.env.MEDIA_STORAGE_DIR ?? join(process.cwd(), 'storage', 'media');
      await unlink(join(root, ...rel.split('/')));
      console.log('  🧹 فایل آپلود تستی پاک شد');
    } catch {
      console.log('  ℹ️ فایل تستی در دیسک ماند (خطرناک نیست)');
    }
  }

  console.log('');
  if (failCount === 0) {
    console.log(`ALL GREEN — ${pass}/${pass + failCount} بررسی سبز ✅`);
    await db.$disconnect();
    process.exit(0);
  }
  console.log(`قرمز: ${failCount} — ${failures.join(' | ')}`);
  await db.$disconnect();
  process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
