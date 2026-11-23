// تأیید API فیلتر جغرافیایی کاربران + بخش geo داشبورد — بدون مرورگر
// استفاده: DATABASE_URL=… OTP_MASTER_CODE=… BASE=http://localhost:3001 bun scripts/verify-geo-api.ts
const BASE = process.env.BASE ?? 'http://localhost:3001';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

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
  const body = (await verifyRes.json()) as { data?: { sessionToken?: string } };
  return body.data?.sessionToken ?? null;
}

const token = await otpLogin('09120000000');
if (!token) throw new Error('admin login failed');
// سرور کوکی HttpOnly pars_session را ترجیح می‌دهد؛ فال‌بک هدر x-pars-session
const auth = { 'x-pars-session': token };

// ——— ۱) آمار داشبورد: بخش geo ———
const statsRes = await fetch(`${BASE}/api/admin/stats`, { headers: auth });
const stats = (await statsRes.json()) as { data?: { geo?: { provinces: Array<{ name: string; revenueToman: number; ordersCount: number; customers: number; cities: string[] }>; provincesWithSales: number; citiesWithSales: number } } };
const geo = stats.data?.geo;
check('GET /api/admin/stats → geo present', !!geo);
if (geo) {
  check('geo.provinces non-empty', geo.provinces.length > 0, `got ${geo.provinces.length}`);
  console.log('  ℹ️ top provinces:', geo.provinces.slice(0, 5).map((p) => `${p.name}(فروش:${p.revenueToman}، سفارش:${p.ordersCount}، مشتری:${p.customers})`).join(' | '));
  check('provincesWithSales > 0', geo.provincesWithSales > 0, String(geo.provincesWithSales));
  check('provinces have cities list', geo.provinces.some((p) => p.cities.length > 0));
}

// ——— ۲) فیلتر کاربران بر اساس استان ———
const firstProvince = geo?.provinces[0]?.name ?? 'تهران';
const filteredRes = await fetch(
  `${BASE}/api/admin/users?page=1&pageSize=50&filter=all&province=${encodeURIComponent(firstProvince)}`,
  { headers: auth }
);
const filtered = (await filteredRes.json()) as { data?: { users: Array<{ id: string; locations?: { provinces: string[]; cities: string[] } }>; total: number } };
check('GET users?province → 200 with users', filteredRes.ok && Array.isArray(filtered.data?.users));
const fl = filtered.data?.users ?? [];
check('filtered users have locations', fl.every((u) => Array.isArray(u.locations?.provinces)));
const locOk = fl.every((u) => u.locations.provinces.length === 0 || u.locations.provinces.includes(firstProvince));
check(`all filtered users relate to ${firstProvince}`, locOk);
console.log(`  ℹ️ province=${firstProvince}: ${filtered.data?.total} کاربر`);

// ——— ۳) فیلتر بر اساس شهر ———
const firstCity = geo?.provinces[0]?.cities?.[0];
if (firstCity) {
  const cityRes = await fetch(
    `${BASE}/api/admin/users?page=1&pageSize=50&filter=all&city=${encodeURIComponent(firstCity)}`,
    { headers: auth }
  );
  const cityData = (await cityRes.json()) as { data?: { total: number; users: Array<{ locations: { cities: string[] } }> } };
  check(`GET users?city=${firstCity} → 200`, cityRes.ok);
  const cu = cityData.data?.users ?? [];
  check('city-filtered users have that city', cu.every((u) => u.locations.cities.includes(firstCity)));
  console.log(`  ℹ️ city=${firstCity}: ${cityData.data?.total} کاربر`);
}

// ——— ۴) geo facets ———
const geoRes = await fetch(`${BASE}/api/admin/users/geo`, { headers: auth });
const geoData = (await geoRes.json()) as { data?: { provinces: Array<{ name: string; users: number; cities: string[] }>; cities: Array<{ name: string; province: string; users: number }> } };
check('GET /api/admin/users/geo → provinces', (geoData.data?.provinces.length ?? 0) > 0);
check('GET /api/admin/users/geo → cities', (geoData.data?.cities.length ?? 0) > 0);
console.log('  ℹ️ geo facets:', (geoData.data?.provinces ?? []).slice(0, 5).map((p) => `${p.name}(${p.users})`).join(' | '));

console.log(`\n——— ${pass} pass / ${fail} fail ———`);
process.exit(fail === 0 ? 0 : 1);
