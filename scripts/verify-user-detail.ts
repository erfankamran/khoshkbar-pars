// ============================================================
// e2e verify user detail + map picker feature
//  1) GET /api/admin/users — list works
//  2) GET /api/admin/users/[id] — profile + stats + orders + addresses
//  3) Stats consistency: totalCount == paid+pending+canceled, spent >= 0
//  4) Compare with direct DB aggregate (ground truth)
//  5) Unauthorized access (no token) → 401
// ============================================================
const BASE = 'http://localhost:3000';
import { PrismaClient } from '@prisma/client';

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

// 1) list
const listRes = await fetch(`${BASE}/api/admin/users?page=1&pageSize=50`, {
  headers: { 'x-pars-session': token! },
});
const list = (await listRes.json()) as ApiResp<{ users: Array<{ id: string; phone: string; _count: { orders: number } }>; total: number }>;
check('list 200', listRes.status === 200);
check('list has users', (list.data?.users.length ?? 0) > 0);

// ——— ۲) با بیشترین سفارش جزئیات بگیر ———
const target = [...(list.data?.users ?? [])].sort((a, b) => b._count.orders - a._count.orders)[0];
check('picked a user', !!target);

const detailRes = await fetch(`${BASE}/api/admin/users/${target.id}`, {
  headers: { 'x-pars-session': token! },
});
const detail = (await detailRes.json()) as ApiResp<{
  user: { id: string; phone: string; role: string; isActive: boolean; _count: { orders: number; addresses: number } };
  stats: { totalSpentToman: number; paidCount: number; pendingCount: number; canceledCount: number; totalCount: number; lastOrderAt: string | null };
  recentOrders: Array<{ id: string; code: string; status: string; totalToman: number }>;
  addresses: unknown[];
}>;
check('detail 200', detailRes.status === 200);
check('profile phone matches', detail.data?.user.phone === target.phone);
check('stats present', !!detail.data?.stats);
check(
  'totalCount = paid+pending+canceled',
  detail.data ? detail.data.stats.totalCount === detail.data.stats.paidCount + detail.data.stats.pendingCount + detail.data.stats.canceledCount : false
);
check('stats.totalCount == user._count.orders', detail.data ? detail.data.stats.totalCount === detail.data.user._count.orders : false);
check('recentOrders ≤ 10', (detail.data?.recentOrders.length ?? 99) <= 10);
check('addresses present', Array.isArray(detail.data?.addresses));
check('addresses count matches _count', detail.data ? detail.data.addresses.length === detail.data.user._count.addresses : false);

// ——— ۴) مقایسه با دیتابیس (حقیقت مطلق) ———
const db = new PrismaClient();
const PAID = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const dbOrders = await db.order.findMany({ where: { userId: target.id }, select: { status: true, totalToman: true } });
const dbSpent = dbOrders.filter((o: { status: string }) => PAID.includes(o.status)).reduce((s: number, o: { totalToman: number }) => s + o.totalToman, 0);
const dbPaid = dbOrders.filter((o: { status: string }) => PAID.includes(o.status)).length;
check(
  'totalSpentToman == DB ground truth',
  detail.data ? detail.data.stats.totalSpentToman === dbSpent : false,
  `api=${detail.data?.stats.totalSpentToman} db=${dbSpent}`
);
check(
  'paidCount == DB ground truth',
  detail.data ? detail.data.stats.paidCount === dbPaid : false,
  `api=${detail.data?.stats.paidCount} db=${dbPaid}`
);
await db.$disconnect();

// ——— ۵) بدون توکن → ۴۰۱ ———
const unauth = await fetch(`${BASE}/api/admin/users/${target.id}`);
check('unauthorized → 401', unauth.status === 401);

// کاربر بدون سفارش
const noOrderUser = (list.data?.users ?? []).find((u) => u._count.orders === 0);
if (noOrderUser) {
  const d2 = (await (await fetch(`${BASE}/api/admin/users/${noOrderUser.id}`, { headers: { 'x-pars-session': token! } })).json()) as ApiResp<{ stats: { totalSpentToman: number; totalCount: number } }>;
  check('no-order user → spent 0', d2.data?.stats.totalSpentToman === 0);
  check('no-order user → totalCount 0', d2.data?.stats.totalCount === 0);
}

console.log(`\nنتیجه: ${pass} سبز / ${fail} قرمز`);
if (fail > 0) process.exit(1);
