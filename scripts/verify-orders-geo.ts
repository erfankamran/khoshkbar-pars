// تأیید API پراکندگی جغرافیایی فاکتورهای فروش (/api/admin/orders/geo) + geo کاربران
// استفاده: BASE=http://localhost:3000 bun scripts/verify-orders-geo.ts
const BASE = process.env.BASE ?? 'http://localhost:3000';

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
const auth = { 'x-pars-session': token };

// ——— ۱) دسترسی غیرمجاز باید رد شود ———
const anonRes = await fetch(`${BASE}/api/admin/orders/geo`);
check('GET /api/admin/orders/geo بدون توکن → 401', anonRes.status === 401, String(anonRes.status));

// ——— ۲) geo سفارش‌ها ———
const geoRes = await fetch(`${BASE}/api/admin/orders/geo`, { headers: auth });
check('GET /api/admin/orders/geo با توکن → 200', geoRes.ok, String(geoRes.status));
const geo = (await geoRes.json()) as {
  data?: {
    provinces: Array<{ name: string; ordersCount: number; revenueToman: number; cities: string[] }>;
    invoicesTotal: number;
    revenueTotal: number;
  };
};
const g = geo.data;
check('geo.provinces non-empty', (g?.provinces.length ?? 0) > 0, `got ${g?.provinces.length ?? 0}`);
if (g) {
  check('هر استان ordersCount >= 1', g.provinces.every((p) => p.ordersCount >= 1));
  check('هر استان revenueToman >= 0', g.provinces.every((p) => p.revenueToman >= 0));
  check('برخی استان‌ها شهر دارند', g.provinces.some((p) => p.cities.length > 0));
  const sumOrders = g.provinces.reduce((s, p) => s + p.ordersCount, 0);
  const sumRevenue = g.provinces.reduce((s, p) => s + p.revenueToman, 0);
  check('invoicesTotal = مجموع استان‌ها', g.invoicesTotal === sumOrders, `${g.invoicesTotal} vs ${sumOrders}`);
  check('revenueTotal = مجموع استان‌ها', g.revenueTotal === sumRevenue, `${g.revenueTotal} vs ${sumRevenue}`);
  console.log('  ℹ️ برترین استان‌ها:', g.provinces.slice(0, 5).map((p) => `${p.name}(فاکتور:${p.ordersCount}، مبلغ:${p.revenueToman})`).join(' | '));
}

// ——— ۳) سازگاری با شمارش وضعیت‌ها (geo فقط غیرلغوشده‌ها) ———
const ordersRes = await fetch(`${BASE}/api/admin/orders?page=1&pageSize=1&status=all`, { headers: auth });
const orders = (await ordersRes.json()) as { data?: { counts: Record<string, number> } };
const counts = orders.data?.counts;
if (counts && g) {
  const nonCanceled = (counts.all ?? 0) - (counts.CANCELED ?? 0);
  check('invoicesTotal هم‌ارز سفارش‌های غیرلغوشده', g.invoicesTotal === nonCanceled, `geo:${g.invoicesTotal} vs counts:${nonCanceled}`);
}

// ——— ۴) geo کاربران (دادهٔ نقشهٔ مشتریان) ———
const usersGeoRes = await fetch(`${BASE}/api/admin/users/geo`, { headers: auth });
const usersGeo = (await usersGeoRes.json()) as {
  data?: { provinces: Array<{ name: string; users: number; cities: string[] }>; cities: Array<{ name: string; province: string; users: number }> };
};
check('GET /api/admin/users/geo → provinces', (usersGeo.data?.provinces.length ?? 0) > 0);
check('GET /api/admin/users/geo → cities', (usersGeo.data?.cities.length ?? 0) > 0);
console.log('  ℹ️ استان‌های مشتریان:', (usersGeo.data?.provinces ?? []).slice(0, 5).map((p) => `${p.name}(${p.users})`).join(' | '));

console.log(`\n——— ${pass} pass / ${fail} fail ———`);
process.exit(fail === 0 ? 0 : 1);
