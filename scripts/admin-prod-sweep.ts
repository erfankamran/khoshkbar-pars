/**
 * بررسی جامع وضعیت ادمین روی سرور production
 * ورود با کد مادر ۱۲۳۴۵۶ + تست همهٔ صفحات و APIهای ادمین
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const ADMIN_PAGES = [
  '/admin',
  '/admin/login',
  '/admin/orders',
  '/admin/products',
  '/admin/categories',
  '/admin/banners',
  '/admin/discounts',
  '/admin/reviews',
  '/admin/stories',
  '/admin/users',
  '/admin/notifications',
  '/admin/settings',
  '/admin/feeds',
];

const ADMIN_APIS = [
  '/api/admin/stats',
  '/api/admin/orders',
  '/api/admin/products',
  '/api/admin/categories',
  '/api/admin/banners',
  '/api/admin/discounts',
  '/api/admin/reviews',
  '/api/admin/stories',
  '/api/admin/users',
  '/api/admin/notifications',
  '/api/admin/settings',
];

const PUBLIC_APIS = [
  '/api/home',
  '/api/settings',
  '/api/categories',
  '/api/products',
  '/api/stories',
  '/api/push/vapid',
  '/feeds/torob.xml',
  '/feeds/emalls.xml',
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
];

async function main() {
  let pass = 0;
  let fail = 0;
  const fails: string[] = [];

  const check = (label: string, ok: boolean, extra = '') => {
    if (ok) {
      pass++;
      console.log(`  ✅ ${label} ${extra}`);
    } else {
      fail++;
      fails.push(label);
      console.log(`  ❌ ${label} ${extra}`);
    }
  };

  // ---- 1) ورود با کد مادر ----
  console.log('\n▶ ورود ادمین با کد مادر ۱۲۳۴۵۶');
  const loginRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pars-device': 'admin-sweep' },
    body: JSON.stringify({ phone: '09121111111', code: '123456' }),
  });
  const loginJson: any = await loginRes.json().catch(() => null);
  const token = loginJson?.data?.sessionToken ?? loginJson?.sessionToken;
  const role = loginJson?.data?.user?.role ?? loginJson?.user?.role;
  check(
    'POST /api/auth/otp/verify (master 123456)',
    loginRes.status === 200 && !!token,
    `role=${role ?? '؟'}`
  );

  const authHeaders: Record<string, string> = {
    'x-pars-session': token ?? '',
    Cookie: `pars_session=${token ?? ''}`,
  };

  // ---- 2) صفحات ادمین ----
  console.log('\n▶ صفحات ادمین');
  for (const page of ADMIN_PAGES) {
    const res = await fetch(`${BASE}${page}`, { headers: authHeaders, redirect: 'manual' });
    check(`GET ${page}`, res.status === 200, `→ ${res.status}`);
  }

  // ---- 3) APIهای ادمین ----
  console.log('\n▶ APIهای ادمین');
  for (const api of ADMIN_APIS) {
    const res = await fetch(`${BASE}${api}`, { headers: authHeaders });
    const ok = res.status === 200;
    let extra = `→ ${res.status}`;
    if (ok) {
      const j: any = await res.json().catch(() => null);
      const d = j?.data ?? j;
      const n = Array.isArray(d)
        ? `${d.length} آیتم`
        : typeof d === 'object' && d
          ? Object.keys(d).slice(0, 4).join(',')
          : '';
      extra += n ? ` [${n}]` : '';
    }
    check(`GET ${api}`, ok, extra);
  }

  // ---- 4) APIهای عمومی و فیدها ----
  console.log('\n▶ APIهای عمومی / SEO');
  for (const api of PUBLIC_APIS) {
    const res = await fetch(`${BASE}${api}`);
    check(`GET ${api}`, res.status === 200, `→ ${res.status}`);
  }

  // ---- 5) خلاصه ----
  console.log(`\n■ نتیجه: ${pass} موفق / ${fail} ناموفق`);
  if (fails.length) console.log('  موارد ناموفق: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
}

main();
