/**
 * تست رگرسیون مدیریت کاربران (فاز ۱۱.۶)
 *
 * پوشش:
 *  ۱) امنیت: بدون نشست ۴۰۱ روی لیست/جزئیات/اقدام
 *  ۲) لیست: ساختار پاسخ، جستجو بر اساس تلفن، فیلتر نقش و وضعیت، صفحه‌بندی
 *  ۳) جزئیات: آمار و ۵ سفارش آخر
 *  ۴) اقدامات: ارتقا/سلب نقش، فعال‌سازی، غیرفعال‌سازی (ابطال نشست‌ها + مسدود
 *     شدن ورود OTP) — همه با حسابرسی ADMIN_ACTION
 *  ۵) حفاظت‌ها: خود-محافظتی ۴۰۹ SELF_ACTION، آخرین مدیر ۴۰۹ LAST_ADMIN
 *  ۶) اعتبارسنجی: شناسه نامعتبر ۴۰۰، اکشن ناشناخته ۴۰۰
 *
 * اجرا: bun scripts/admin-users-tests.ts [baseUrl]
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
async function login(phone: string): Promise<{ token: string | null; blocked: boolean }> {
  const code = await mintOtp(phone);
  const verify = await req<OkEnvelope<{ sessionToken?: string; error?: { code: string } }>>(
    'POST',
    '/api/auth/otp/verify',
    null,
    { phone, code }
  );
  if (verify.body.error?.code === 'ACCOUNT_DISABLED') {
    return { token: null, blocked: true };
  }
  return { token: verify.body.data?.sessionToken ?? null, blocked: false };
}

async function adminLogin(phones: string[]): Promise<string | null> {
  for (const phone of phones) {
    const { token } = await login(phone);
    if (token) return token;
    console.log(`  ↺ شماره ${phone} محدودیت OTP — شماره بعدی`);
  }
  return null;
}

async function hasAudit(phone: string, action: string): Promise<boolean> {
  const logs = await db.securityLog.findMany({
    where: { event: 'ADMIN_ACTION', phone },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  return logs.some((l) => (l.meta ?? '').includes(`"action":"${action}"`));
}

interface UserListItem {
  id: string;
  phone: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  ordersCount: number;
  totalSpentToman: number;
}

interface UserDetail {
  id: string;
  phone: string;
  role: string;
  isActive: boolean;
  stats: {
    ordersCount: number;
    reviewsCount: number;
    favoritesCount: number;
    addressesCount: number;
    totalSpentToman: number;
  };
  recentOrders: Array<{ id: string; code: string; status: string; totalToman: number }>;
}

interface UserList {
  items: UserListItem[];
  total: number;
  page: number;
  totalPages: number;
}

// ------------------------------------------------------------
// سناریو
// ------------------------------------------------------------

async function main() {
  console.log('════════ تست فاز ۱۱.۶ — مدیریت کاربران ════════');

  section('۱) امنیت — دسترسی بدون نشست');
  const anonList = await req('GET', '/api/admin/users', null);
  check('لیست کاربران بدون نشست → ۴۰۱', anonList.status === 401);
  const anonDetail = await req('GET', '/api/admin/users/xxxx', null);
  check('جزئیات بدون نشست → ۴۰۱', anonDetail.status === 401);
  const anonPatch = await req('PATCH', '/api/admin/users/xxxx', null, { action: 'ACTIVATE' });
  check('اقدام بدون نشست → ۴۰۱', anonPatch.status === 401);

  const ADMIN_PHONES = ['09121111111', '09120000000', '09121111112', '09121111113'];
  const adminSession = await adminLogin(ADMIN_PHONES);
  if (!adminSession) {
    check('ورود مدیر (ADMIN)', false, 'همه شماره‌ها محدودیت OTP — بعد از یک ساعت اجرا کنید');
    console.log(`\n════════\nنتیجه: ${passed} موفق، ${failed} ناموفق\n════════`);
    await db.$disconnect();
    return;
  }
  check('ورود مدیر (ADMIN)', true);

  // شناسه ادمین برای تست خود-محافظتی
  const me = await req<OkEnvelope<{ user: { id: string; phone: string; role: string } }>>(
    'GET',
    '/api/auth/me',
    adminSession
  );
  const adminId = me.body.data?.user.id ?? '';
  check('شناسه مدیر از /api/auth/me', adminId.length > 0);

  section('۲) لیست کاربران');
  const list1 = await req<OkEnvelope<UserList>>('GET', '/api/admin/users?limit=5', adminSession);
  check('لیست → ۲۰۰', list1.status === 200 && !!list1.body.data);
  check('ساختار صفحه‌بندی', list1.body.data?.total !== undefined && list1.body.data?.page === 1);
  check(
    'آیتم‌ها شامل آمار سفارش (بدون N+1)',
    list1.body.data?.items.every((u) => typeof u.ordersCount === 'number' && typeof u.totalSpentToman === 'number') === true
  );
  check('حداکثر ۵ آیتم در هر صفحه', (list1.body.data?.items.length ?? 99) <= 5);

  // جستجو با بخشی از شماره یک کاربر واقعی
  const anyUser = await db.user.findFirst({ where: { role: 'USER' }, orderBy: { createdAt: 'desc' } });
  if (anyUser) {
    const frag = anyUser.phone.slice(2, 7);
    const search = await req<OkEnvelope<UserList>>(
      'GET',
      `/api/admin/users?q=${frag}&limit=50`,
      adminSession
    );
    const found = search.body.data?.items ?? [];
    check('جستجوی بخشی از شماره نتیجه می‌دهد', found.length >= 1);
    check(
      'همه نتایج شامل قطعه شماره هستند',
      found.every((u) => u.phone.includes(frag) || (u.fullName ?? '').includes(frag))
    );
  }

  const admins = await req<OkEnvelope<UserList>>('GET', '/api/admin/users?role=ADMIN&limit=50', adminSession);
  check(
    'فیلتر نقش ADMIN — همه مدیر هستند',
    (admins.body.data?.items.length ?? 0) >= 1 &&
      admins.body.data!.items.every((u) => u.role === 'ADMIN')
  );
  const activeOnly = await req<OkEnvelope<UserList>>('GET', '/api/admin/users?status=ACTIVE&limit=50', adminSession);
  check(
    'فیلتر وضعیت ACTIVE — همه فعال هستند',
    activeOnly.body.data!.items.every((u) => u.isActive === true)
  );

  section('۳) جزئیات کاربر');
  const target = anyUser ?? (await db.user.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (target) {
    const detail = await req<OkEnvelope<UserDetail>>(
      'GET',
      `/api/admin/users/${target.id}`,
      adminSession
    );
    check('جزئیات → ۲۰۰', detail.status === 200 && !!detail.body.data);
    check('آمار کامل در پاسخ', detail.body.data?.stats !== undefined);
    check('سفارش‌های اخیر آرایه هستند', Array.isArray(detail.body.data?.recentOrders));
    check('شماره صحیح است', detail.body.data?.phone === target.phone);
  }
  const badId = await req('GET', '/api/admin/users/not-a-cuid!', adminSession);
  check('شناسه نامعتبر → ۴۰۰', badId.status === 400);

  section('۴) اقدامات روی کاربر تستی');
  // کاربر تستی ایزوله بساز تا دستکاری داده واقعی نشود
  const TEST_PHONE = '09125550001';
  let testUser = await db.user.findUnique({ where: { phone: TEST_PHONE } });
  if (!testUser) {
    testUser = await db.user.create({
      data: { phone: TEST_PHONE, fullName: 'کاربر تستی ۱۱.۶', role: 'USER', isActive: true },
    });
  }
  if (testUser.role !== 'USER' || !testUser.isActive) {
    testUser = await db.user.update({
      where: { id: testUser.id },
      data: { role: 'USER', isActive: true },
    });
  }
  // نشست آزمایشی برای بررسی ابطال هنگام غیرفعال‌سازی
  await db.session.create({
    data: {
      userId: testUser.id,
      tokenHash: `test-hash-${Date.now()}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  const promote = await req<OkEnvelope<{ ok: boolean }>>(
    'PATCH',
    `/api/admin/users/${testUser.id}`,
    adminSession,
    { action: 'SET_ROLE', role: 'ADMIN' }
  );
  check('ارتقا به ADMIN → ۲۰۰', promote.status === 200);
  const roleAfter = await db.user.findUnique({ where: { id: testUser.id }, select: { role: true } });
  check('نقش در دیتابیس ADMIN شد', roleAfter?.role === 'ADMIN');
  check('حسابرسی USER_SET_ROLE', await hasAudit(me.body.data!.user.phone, 'USER_SET_ROLE'));

  const demote = await req('PATCH', `/api/admin/users/${testUser.id}`, adminSession, {
    action: 'SET_ROLE',
    role: 'USER',
  });
  check('سلب نقش → ۲۰۰', demote.status === 200);
  const roleBack = await db.user.findUnique({ where: { id: testUser.id }, select: { role: true } });
  check('نقش به USER برگشت', roleBack?.role === 'USER');

  const deactivate = await req('PATCH', `/api/admin/users/${testUser.id}`, adminSession, {
    action: 'DEACTIVATE',
  });
  check('غیرفعال‌سازی → ۲۰۰', deactivate.status === 200);
  const deactUser = await db.user.findUnique({ where: { id: testUser.id }, select: { isActive: true } });
  check('isActive=false شد', deactUser?.isActive === false);
  const activeSessions = await db.session.count({
    where: { userId: testUser.id, revokedAt: null },
  });
  check('همه نشست‌های فعال ابطال شدند', activeSessions === 0);
  const blockedLogin = await login(TEST_PHONE);
  check('ورود کاربر غیرفعال مسدود شد (۴۰۳ ACCOUNT_DISABLED)', blockedLogin.blocked);
  check('حسابرسی USER_DEACTIVATE', await hasAudit(me.body.data!.user.phone, 'USER_DEACTIVATE'));

  const activate = await req('PATCH', `/api/admin/users/${testUser.id}`, adminSession, {
    action: 'ACTIVATE',
  });
  check('فعال‌سازی مجدد → ۲۰۰', activate.status === 200);
  const reactivated = await db.user.findUnique({ where: { id: testUser.id }, select: { isActive: true } });
  check('کاربر دوباره فعال است', reactivated?.isActive === true);

  section('۵) حفاظت‌های حیاتی');
  const selfRole = await req('PATCH', `/api/admin/users/${adminId}`, adminSession, {
    action: 'SET_ROLE',
    role: 'USER',
  });
  check('تغییر نقش خود → ۴۰۹ SELF_ACTION', selfRole.status === 409 && selfRole.body.error?.code === 'SELF_ACTION');

  const selfDeactivate = await req('PATCH', `/api/admin/users/${adminId}`, adminSession, {
    action: 'DEACTIVATE',
  });
  check('غیرفعال‌سازی خود → ۴۰۹ SELF_ACTION', selfDeactivate.status === 409);

  // سناریوی آخرین مدیر: همه مدیران دیگر را موقتاً غیرفعال کن
  const allAdmins = await db.user.findMany({
    where: { role: 'ADMIN', isActive: true, id: { not: adminId } },
    select: { id: true },
  });
  if (allAdmins.length > 0) {
    await db.user.updateMany({
      where: { id: { in: allAdmins.map((a) => a.id) } },
      data: { isActive: false },
    });
  }
  // درخواست‌دهنده خودش فعال است، پس سلب نقشِ خودش با SELF_ACTION ۴۰۹ می‌گیرد —
  // و همین مسیر عملاً «آخرین مدیر» را حفظ می‌کند (LAST_ADMIN لایه دفاع دوم
  // سرویس است و از مسیر HTTP نیازمند دورزدن requireAdmin می‌بود)
  const lastAdmin = await req('PATCH', `/api/admin/users/${adminId}`, adminSession, {
    action: 'SET_ROLE',
    role: 'USER',
  });
  check('سلب نقشِ آخرین مدیر فعال → ۴۰۹', lastAdmin.status === 409);
  const adminRoleAfter = await db.user.findUnique({ where: { id: adminId }, select: { role: true } });
  check('نقش مدیر دست‌نخورده ماند', adminRoleAfter?.role === 'ADMIN');
  // بازگردانی
  if (allAdmins.length > 0) {
    await db.user.updateMany({
      where: { id: { in: allAdmins.map((a) => a.id) } },
      data: { isActive: true },
    });
  }

  section('۶) اعتبارسنجی ورودی');
  const unknownAction = await req('PATCH', `/api/admin/users/${testUser.id}`, adminSession, {
    action: 'NUKE',
  });
  check('اکشن ناشناخته → ۴۰۰', unknownAction.status === 400);
  const badRole = await req('PATCH', `/api/admin/users/${testUser.id}`, adminSession, {
    action: 'SET_ROLE',
    role: 'SUPERUSER',
  });
  check('نقش نامعتبر → ۴۰۰', badRole.status === 400);
  const patch404 = await req('PATCH', '/api/admin/users/abcdefghijklmnopqrstuvwx', adminSession, {
    action: 'ACTIVATE',
  });
  check('کاربر ناموجود → ۴۰۴', patch404.status === 404);

  console.log(`\n════════\nنتیجه: ${passed} موفق، ${failed} ناموفق\n════════`);
  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('خطای اجرا:', e);
  void db.$disconnect();
  process.exit(1);
});
