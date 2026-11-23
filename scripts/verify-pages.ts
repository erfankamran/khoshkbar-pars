// ============================================================
// e2e verify pages — درخواست کاربر: ساخت صفحهٔ اختصاصی + قوانین در ورود
//  ۱) admin login → GET /api/admin/pages → صفحهٔ terms موجود
//  ۲) POST ایجاد صفحهٔ تست → ۲۰۰ / تکراری → ۴۰۹ / slug نامعتبر → ۴۰۰
//  ۳) GET /api/content → pages شامل terms و تست
//  ۴) GET /api/pages/terms → متن کامل؛ GET /api/pages/[غیرموجود] → null
//  ۵) غیرفعال‌سازی → عمومی مخفی؛ DELETE → حذف کامل
//  ۶) بدون توکن → ۴۰۱
// ============================================================
const BASE = 'http://localhost:3000';

interface ApiResp<T> { ok: boolean; data?: T; error?: string; message?: string }

async function otpLogin(phone: string): Promise<string | null> {
  await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  await new Promise((r) => setTimeout(r, 300));
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code: '123456' }),
  });
  const body = (await verifyRes.json()) as ApiResp<{ sessionToken?: string }>;
  return body.data?.sessionToken ?? null;
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const token = await otpLogin('09120000000');
check('admin login', !!token);
const H = { 'content-type': 'application/json', 'x-pars-session': token! };

// ۱) فهرست ادمین
const listRes = await fetch(`${BASE}/api/admin/pages`, { headers: H });
const list = (await listRes.json()) as ApiResp<{ pages: Array<{ id: string; slug: string; title: string; body: string; isActive: boolean; showInFooter: boolean }> }>;
check('GET /api/admin/pages 200', listRes.status === 200);
const terms = list.data?.pages.find((p) => p.slug === 'terms');
check('seeded terms page exists', !!terms);
check('terms body length > 1500 chars', (terms?.body.length ?? 0) > 1500, String(terms?.body.length));
check('terms active + in footer', terms?.isActive === true && terms?.showInFooter === true);
const termsId = terms?.id ?? '';

// ۲) ایجاد/تکراری/نامعتبر
const createRes = await fetch(`${BASE}/api/admin/pages`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ slug: 'verify-test-page', title: 'صفحهٔ تست', body: 'متن تستی برای بررسی کامل چرخهٔ ایجاد و حذف صفحه.', sortOrder: 99 }),
});
check('POST create page 200', createRes.status === 200);
const created = (await createRes.json()) as ApiResp<{ page: { id: string } }>;
const testId = created.data?.page.id ?? '';

const dupRes = await fetch(`${BASE}/api/admin/pages`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ slug: 'verify-test-page', title: 'تکراری', body: 'متن کافی برای اعتبارسنجی طول.' }),
});
check('duplicate slug → 409', dupRes.status === 409, String(dupRes.status));

const badRes = await fetch(`${BASE}/api/admin/pages`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ slug: 'Invalid Slug!', title: 'نامعتبر', body: 'متن کافی برای اعتبارسنجی طول.' }),
});
check('invalid slug → 400', badRes.status === 400, String(badRes.status));

// ۳) عمومی — فهرست فوتر
const contentRes = await fetch(`${BASE}/api/content`);
const content = (await contentRes.json()) as ApiResp<{ pages: Array<{ slug: string; title: string }> }>;
check('content.pages includes terms', (content.data?.pages ?? []).some((p) => p.slug === 'terms'));
check('content.pages includes test page', (content.data?.pages ?? []).some((p) => p.slug === 'verify-test-page'));

// ۴) خواندن با slug
const termsRes = await fetch(`${BASE}/api/pages/terms`);
const termsPublic = (await termsRes.json()) as ApiResp<{ slug: string; title: string; body: string } | null>;
check('GET /api/pages/terms 200', termsRes.status === 200);
check('terms public body present', (termsPublic.data?.body.length ?? 0) > 1500);

const missingRes = await fetch(`${BASE}/api/pages/no-such-page`);
const missing = (await missingRes.json()) as ApiResp<null>;
check('missing page → data:null', missingRes.status === 200 && missing.data === null);

// ۵) غیرفعال‌سازی → مخفی؛ حذف → از بین
const deactRes = await fetch(`${BASE}/api/admin/pages/${testId}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ isActive: false }),
});
check('PATCH deactivate 200', deactRes.status === 200);
const hiddenRes = await fetch(`${BASE}/api/pages/verify-test-page`);
const hidden = (await hiddenRes.json()) as ApiResp<null>;
check('inactive page hidden from public', hidden.data === null);

const delRes = await fetch(`${BASE}/api/admin/pages/${testId}`, { method: 'DELETE', headers: H });
check('DELETE test page 200', delRes.status === 200);

// ۶) بدون توکن
const anon = await fetch(`${BASE}/api/admin/pages`);
check('anon admin pages → 401', anon.status === 401);

console.log(`\n——— ${pass} pass / ${fail} fail ———`);
process.exit(fail === 0 ? 0 : 1);
