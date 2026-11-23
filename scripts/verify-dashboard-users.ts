// ============================================================
// e2e verify dashboard users — درخواست کاربر: کلیک کاربر از داشبورد
//  1) admin login → 200
//  2) GET /api/admin/stats → recentOrders[0].customerUserId + recentUsers شکل درست
//  3) recentUsers[i].totalSpentToman === detail API stats.totalSpentToman (همسویی منطق)
//  4) GET /api/admin/users/{id} برای کاربر اخیر → پروفایل + آمار + سفارش‌ها
//  5) دسترسی بدون توکن → 401
// ============================================================
const BASE = 'http://localhost:3000';

interface ApiResp<T> { ok: boolean; data?: T; error?: string }

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

const H = { 'x-pars-session': token! };

// 2) stats
const statsRes = await fetch(`${BASE}/api/admin/stats`, { headers: H });
const stats = (await statsRes.json()) as ApiResp<{
  users: { total: number; today: number };
  recentOrders: Array<{ code: string; customerUserId: string; customerPhone: string; customerName: string | null }>;
  recentUsers: Array<{
    id: string; fullName: string | null; phone: string; avatarUrl: string | null;
    role: string; isActive: boolean; createdAt: string; ordersCount: number; totalSpentToman: number;
  }>;
}>;
check('GET /api/admin/stats 200', statsRes.status === 200);
const ru = stats.data?.recentUsers ?? [];
check('recentUsers exists (≤6)', Array.isArray(ru) && ru.length <= 6, `count=${ru.length}`);
check('recentUsers[0] has id+phone', !!ru[0]?.id && !!ru[0]?.phone);
check('recentUsers[0] has ordersCount number', typeof ru[0]?.ordersCount === 'number');
check('recentUsers[0] has totalSpentToman number', typeof ru[0]?.totalSpentToman === 'number');
const ro = stats.data?.recentOrders ?? [];
check('recentOrders[0].customerUserId present', !!ro[0]?.customerUserId);

// 3) همسویی مجموع خرید داشبورد با دیالوگ جزئیات
if (ru[0]) {
  const detailRes = await fetch(`${BASE}/api/admin/users/${ru[0].id}`, { headers: H });
  const detail = (await detailRes.json()) as ApiResp<{
    user: { id: string; phone: string };
    stats: { totalSpentToman: number; totalCount: number };
    recentOrders: unknown[];
    addresses: unknown[];
  }>;
  check('GET /api/admin/users/[id] 200', detailRes.status === 200);
  check('detail.phone === stats.phone', detail.data?.user.phone === ru[0].phone);
  check(
    'dashboard totalSpent === detail totalSpent',
    ru[0].totalSpentToman === detail.data?.stats.totalSpentToman,
    `dashboard=${ru[0].totalSpentToman} detail=${detail.data?.stats.totalSpentToman}`,
  );
  check('detail.recentOrders is array', Array.isArray(detail.data?.recentOrders));
  check('detail.addresses is array', Array.isArray(detail.data?.addresses));
}

// 4) کاربر بدون سفارش — مجموع باید ۰ باشد
const noOrderUser = ru.find((u) => u.ordersCount === 0);
if (noOrderUser) {
  check('user without orders → spent=0', noOrderUser.totalSpentToman === 0);
} else {
  console.log('  ℹ️ همه کاربران اخیر سفارش دارند — تست صرف‌نظر شد');
}

// 5) دسترسی بدون توکن
const anon = await fetch(`${BASE}/api/admin/stats`);
check('anon stats → 401', anon.status === 401);

console.log(`\n——— ${pass} pass / ${fail} fail ———`);
process.exit(fail === 0 ? 0 : 1);
