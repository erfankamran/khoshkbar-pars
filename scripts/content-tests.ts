/**
 * تست رگرسیون فاز ۳ — محتوای مستقل فروشگاه (FAQ / تماس / نمادها / لینک فوتر)
 *
 * پوشش:
 *  ۱) خوانندهٔ عمومی GET /api/content:
 *     - ۲۰۰ + چهار آرایهٔ faq/contacts/badges/footerLinks
 *     - دادهٔ seed در FAQ و تماس دیده می‌شود
 *     - نمادهای seed غیرفعال‌اند → در خروجی عمومی نیستند
 *  ۲) گیت دسترسی: بدون نشست → ۴۰۱ برای هر ۴ اندپوینت admin
 *  ۳) CRUD پرسش‌های متداول:
 *     - ایجاد → ۲۰۰؛ ایجاد نامعتبر (پرسش کوتاه) → ۴۰۰
 *     - ویرایش → ۲۰۰ + اعمال؛ غیرفعال‌سازی → ناپدید از /api/content
 *     - PATCH شناسهٔ ساختگی → ۴۰۴؛ حذف → ۲۰۰ و حذف واقعی
 *  ۴) CRUD شماره‌های تماس:
 *     - ایجاد معتبر (۰۲۱...) → ۲۰۰؛ شمارهٔ نامعتبر → ۴۰۰
 *     - ویرایش + حذف
 *  ۵) CRUD نمادهای اعتماد:
 *     - ایجاد با تصویر آپلودی /api/media (مسیر واقعی آپلود) → ۲۰۰
 *     - لینک نامعتبر (javascript:) → ۴۰۰
 *     - فعال‌سازی → دیده‌شدن در /api/content؛ حذف
 *  ۶) CRUD لینک‌های فوتر:
 *     - ایجاد /faq → ۲۰۰؛ url نامعتبر → ۴۰۰؛ ویرایش + حذف
 *
 * اجرا: bun scripts/content-tests.ts [baseUrl]
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

/** PNG ۱×۱ معتبر — برای ساخت نماد با تصویر آپلودی واقعی */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function loginAdmin(): Promise<string | null> {
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pars-device': 'content-tests' },
    body: JSON.stringify({ phone: ADMIN_PHONE, code: '123456' }),
  });
  const body = (await verifyRes.json()) as ApiResp<{ sessionToken?: string }>;
  return body.data?.sessionToken ?? null;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function api<T>(
  path: string,
  method: Method = 'GET',
  token?: string | null,
  body?: unknown
): Promise<{ status: number; json: ApiResp<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { 'x-pars-session': token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as ApiResp<T> };
}

interface ContentShape {
  faq: Array<{ id: string; question: string; answer: string }>;
  contacts: Array<{ id: string; label: string; phone: string }>;
  badges: Array<{ id: string; title: string; imageUrl: string; linkUrl: string | null }>;
  footerLinks: Array<{ id: string; title: string; url: string }>;
}

async function main() {
  console.log(`— تست فاز ۳ روی ${BASE} —\n`);

  // ——— ۱) خوانندهٔ عمومی ———
  console.log('۱) GET /api/content (عمومی):');
  const pub = await api<ContentShape>('/api/content');
  check('GET عمومی → ۲۰۰', pub.status === 200, `got ${pub.status}`);
  const c = pub.json.data;
  check('ساختار چهار آرایه‌ای', !!c && Array.isArray(c.faq) && Array.isArray(c.contacts) && Array.isArray(c.badges) && Array.isArray(c.footerLinks));
  check('FAQ شامل دادهٔ seed', (c?.faq.length ?? 0) >= 4, `got ${c?.faq.length ?? 0}`);
  check(
    'FAQ: پرسش هزینه ارسال هست',
    (c?.faq.some((f) => f.question.includes('هزینه')) ?? false)
  );
  check('تماس شامل پشتیبانی', (c?.contacts.some((x) => x.label === 'پشتیبانی') ?? false));
  check('لینک فوتر شامل «دربارهٔ پارس»', (c?.footerLinks.some((l) => l.url === '/about') ?? false));
  check('نماد غیرفعالِ seed در خروجی نیست', (c?.badges.length ?? 0) === 0, `got ${c?.badges.length ?? 0}`);

  // ——— ۲) گیت دسترسی ———
  console.log('۲) گیت دسترسی (بدون نشست):');
  for (const p of ['/api/admin/faq', '/api/admin/contacts', '/api/admin/badges', '/api/admin/footer-links']) {
    const r = await api(p, 'GET', null);
    check(`${p} بدون نشست → ۴۰۱`, r.status === 401, `got ${r.status}`);
  }

  const token = await loginAdmin();
  check('ورود مدیر با کد مادر', !!token);

  if (!token) {
    console.log('بدون نشست مدیر ادامه نمی‌یابد');
    process.exit(1);
  }

  // ——— ۳) FAQ ———
  console.log('۳) CRUD پرسش‌های متداول:');
  const badFaq = await api('/api/admin/faq', 'POST', token, {
    question: 'کم',
    answer: 'این پاسخ برای آزمون طول کافی است و از چهار کاراکتر بیشتر است',
  });
  check('پرسش کوتاه → ۴۰۰', badFaq.status === 400, `got ${badFaq.status}`);

  const faqRes = await api<{ item: { id: string } }>('/api/admin/faq', 'POST', token, {
    question: 'پرسش آزمون فاز ۳ — ارسال به شهرستان هم دارید؟',
    answer:
      'بله، ارسال به همهٔ شهرهای ایران انجام می‌شود. این پرسش توسط تست خودکار ساخته و در پایان حذف می‌شود.',
    sortOrder: 99,
  });
  check('ایجاد پرسش → ۲۰۰', faqRes.status === 200, `got ${faqRes.status}`);
  const faqId = faqRes.json.data?.item.id;

  if (faqId) {
    const pubAfter = await api<ContentShape>('/api/content');
    check('پرسش جدید در /api/content هست', pubAfter.json.data?.faq.some((f) => f.id === faqId) ?? false);

    const upd = await api('/api/admin/faq', 'PATCH', token, undefined);
    // (بدون id — مسیر [id] جدا است؛ این فراخوان فقط GET لیست است)
    check('GET لیست admin شامل پرسش', (await api<{ faq: Array<{ id: string }> }>(`/api/admin/faq`, 'GET', token)).json.data?.faq.some((f) => f.id === faqId) ?? false);

    const patch = await api(`/api/admin/faq/${faqId}`, 'PATCH', token, { question: 'پرسش آزمون ویرایش‌شده — ارسال به شهرستان دارید؟' });
    check('ویرایش پرسش → ۲۰۰', patch.status === 200, `got ${patch.status}`);

    const hide = await api(`/api/admin/faq/${faqId}`, 'PATCH', token, { isActive: false });
    check('غیرفعال‌سازی → ۲۰۰', hide.status === 200);
    const pubHidden = await api<ContentShape>('/api/content');
    check('پرسش غیرفعال از عمومی حذف شد', !(pubHidden.json.data?.faq.some((f) => f.id === faqId) ?? false));

    const fake = await api('/api/admin/faq/nonexistent-id-xyz', 'PATCH', token, { isActive: true });
    check('PATCH شناسهٔ ساختگی → ۴۰۴', fake.status === 404, `got ${fake.status}`);

    const del = await api(`/api/admin/faq/${faqId}`, 'DELETE', token);
    check('حذف پرسش → ۲۰۰', del.status === 200, `got ${del.status}`);
    const gone = await api(`/api/admin/faq/${faqId}`, 'PATCH', token, { isActive: true });
    check('بعد از حذف → ۴۰۴', gone.status === 404, `got ${gone.status}`);
  }

  // ——— ۴) تماس ———
  console.log('۴) CRUD شماره‌های تماس:');
  const badPhone = await api('/api/admin/contacts', 'POST', token, {
    label: 'آزمون تماس',
    phone: 'not-a-phone',
  });
  check('شمارهٔ نامعتبر → ۴۰۰', badPhone.status === 400, `got ${badPhone.status}`);

  const contactRes = await api<{ contact: { id: string } }>('/api/admin/contacts', 'POST', token, {
    label: 'آزمون تماس فاز ۳',
    phone: '021-55512345',
    sortOrder: 90,
  });
  check('ایجاد شماره → ۲۰۰', contactRes.status === 200, `got ${contactRes.status}`);
  const contactId = contactRes.json.data?.contact.id;

  if (contactId) {
    const patch = await api(`/api/admin/contacts/${contactId}`, 'PATCH', token, { phone: '02155567890' });
    check('ویرایش شماره → ۲۰۰', patch.status === 200, `got ${patch.status}`);
    const pubC = await api<ContentShape>('/api/content');
    check('شمارهٔ ویرایش‌شده در عمومی', pubC.json.data?.contacts.some((x) => x.id === contactId && x.phone === '02155567890') ?? false);
    const del = await api(`/api/admin/contacts/${contactId}`, 'DELETE', token);
    check('حذف شماره → ۲۰۰', del.status === 200, `got ${del.status}`);
  }

  // ——— ۵) نمادها ———
  console.log('۵) CRUD نمادهای اعتماد:');
  const badLink = await api('/api/admin/badges', 'POST', token, {
    title: 'نماد آزمون',
    imageUrl: '/images/products/pistachio-akbari.webp',
    linkUrl: 'javascript:alert(1)',
  });
  check('لینک javascript: → ۴۰۰', badLink.status === 400, `got ${badLink.status}`);

  // تصویر آپلودی واقعی → url از /api/media
  const form = new FormData();
  form.append('file', new File([PNG_1PX], 'badge.png', { type: 'image/png' }));
  const uploadRes = await fetch(`${BASE}/api/admin/media`, {
    method: 'POST',
    headers: { 'x-pars-session': token },
    body: form,
  });
  const uploadBody = (await uploadRes.json()) as ApiResp<{ media: { url: string } }>;
  const mediaUrl = uploadBody.data?.media.url ?? '';
  check('آپلود تصویر نماد → ۲۰۰ + /api/media/', uploadRes.status === 200 && mediaUrl.startsWith('/api/media/'), `${uploadRes.status} ${mediaUrl}`);

  const badgeRes = await api<{ badge: { id: string } }>('/api/admin/badges', 'POST', token, {
    title: 'نماد آزمون فاز ۳',
    imageUrl: mediaUrl,
    linkUrl: 'https://example.com/badge',
    sortOrder: 95,
  });
  check('ایجاد نماد → ۲۰۰', badgeRes.status === 200, `got ${badgeRes.status}`);
  const badgeId = badgeRes.json.data?.badge.id;

  if (badgeId) {
    const pubB = await api<ContentShape>('/api/content');
    check('نماد فعال در عمومی هست', pubB.json.data?.badges.some((b) => b.id === badgeId) ?? false);

    const hide = await api(`/api/admin/badges/${badgeId}`, 'PATCH', token, { isActive: false });
    check('غیرفعال‌سازی نماد → ۲۰۰', hide.status === 200);
    const pubHidden = await api<ContentShape>('/api/content');
    check('نماد غیرفعال از عمومی حذف شد', !(pubHidden.json.data?.badges.some((b) => b.id === badgeId) ?? false));

    const del = await api(`/api/admin/badges/${badgeId}`, 'DELETE', token);
    check('حذف نماد → ۲۰۰', del.status === 200, `got ${del.status}`);
  }

  // ——— ۶) لینک‌های فوتر ———
  console.log('۶) CRUD لینک‌های فوتر:');
  const badUrl = await api('/api/admin/footer-links', 'POST', token, {
    title: 'لینک آزمون',
    url: 'ftp://bad.example',
  });
  check('url نامعتبر → ۴۰۰', badUrl.status === 400, `got ${badUrl.status}`);

  const linkRes = await api<{ link: { id: string } }>('/api/admin/footer-links', 'POST', token, {
    title: 'لینک آزمون فاز ۳',
    url: '/faq',
    sortOrder: 88,
  });
  check('ایجاد لینک → ۲۰۰', linkRes.status === 200, `got ${linkRes.status}`);
  const linkId = linkRes.json.data?.link.id;

  if (linkId) {
    const patch = await api(`/api/admin/footer-links/${linkId}`, 'PATCH', token, { title: 'لینک آزمون ویرایش‌شده' });
    check('ویرایش لینک → ۲۰۰', patch.status === 200, `got ${patch.status}`);
    const del = await api(`/api/admin/footer-links/${linkId}`, 'DELETE', token);
    check('حذف لینک → ۲۰۰', del.status === 200, `got ${del.status}`);
  }

  // ——— بررسی پایانی state ———
  const pubEnd = await api<ContentShape>('/api/content');
  check('FAQ به state اولیه بازگشت', (pubEnd.json.data?.faq.length ?? 0) >= 4);
  check('بدون رکورد آزمون باقی مانده', !(pubEnd.json.data?.contacts.some((x) => x.label.includes('آزمون')) ?? false));

  await db.$disconnect();

  console.log('');
  if (failCount === 0) {
    console.log(`ALL GREEN — ${pass}/${pass + failCount} تست فاز ۳ سبز ✅`);
    process.exit(0);
  }
  console.log(`قرمز: ${failCount} — ${failures.join(' | ')}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
