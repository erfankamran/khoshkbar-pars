/**
 * تست رگرسیون پنل مدیریت — فاز ۱۱.۱ (RBAC + داشبورد)
 *
 * سناریوها:
 *  ۱) بدون نشست → ۴۰۱ UNAUTHENTICATED (هیچ داده‌ای نشت نمی‌کند)
 *  ۲) هدر جعلی → ۴۰۱
 *  ۳) کاربر عادی واردشده → ۴۰۳ FORBIDDEN + ثبت SecurityLog(FORBIDDEN)
 *  ۴) ورود مدیر (OTP) → ۲۰۰ با ساختار کامل آمار
 *  ۵) me با هدر مدیر → role=ADMIN
 *
 * پیش‌نیاز: کاربر مدیر با شماره 09120000000 (seed یا scripts/set-admin.ts)
 * اجرا: bun scripts/admin-tests.ts [baseUrl]
 */

import { PrismaClient } from '@prisma/client';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const ADMIN_PHONE = '09120000000';
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

interface ApiResp<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function otpLogin(phone: string): Promise<string | null> {
  const reqRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const reqBody = (await reqRes.json()) as ApiResp<{ devCode?: string }>;
  if (!reqBody.ok || !reqBody.data?.devCode) {
    // cooldown شصت‌ثانیه‌ای OTP (اجرای پشت‌سرهم با شماره ثابت) — صبر و یک تلاش مجدد
    if (reqBody.error?.code === 'OTP_COOLDOWN') {
      // «۶ ثانیه دیگر…» — ارقام فارسی → لاتین و استخراج ثانیه
      const secs = parseInt(
        reqBody.error.message.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).match(/\d+/)?.[0] ?? '60',
        10
      );
      console.log(`  ⏳ cooldown OTP — ${secs + 2} ثانیه صبر…`);
      await new Promise((r) => setTimeout(r, (secs + 2) * 1000));
      return otpLogin(phone);
    }
    return null;
  }
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: reqBody.data.devCode }),
  });
  const verifyBody = (await verifyRes.json()) as ApiResp<{ sessionToken?: string }>;
  return verifyBody.data?.sessionToken ?? null;
}

async function main() {
  console.log(`— تست RBAC پنل مدیریت روی ${BASE} —\n`);

  // ——— ۱) بدون نشست ———
  console.log('۱) دسترسی بدون نشست:');
  const noAuth = await fetch(`${BASE}/api/admin/stats`);
  const noAuthBody = (await noAuth.json()) as ApiResp<unknown>;
  check(
    'GET /api/admin/stats بدون نشست → ۴۰۱',
    noAuth.status === 401 && noAuthBody.error?.code === 'UNAUTHENTICATED',
    `status=${noAuth.status}`
  );

  // ——— ۲) هدر جعلی ———
  console.log('\n۲) توکن جعلی:');
  const junk = await fetch(`${BASE}/api/admin/stats`, {
    headers: { 'x-pars-session': 'f'.repeat(64) },
  });
  check('هدر جعلی → ۴۰۱ (نشست جعلی ممکن نیست)', junk.status === 401, `status=${junk.status}`);

  // ——— ۳) کاربر عادی → ۴۰۳ + لاگ امنیتی ———
  console.log('\n۳) کاربر عادی واردشده:');
  const userPhone = `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const userToken = await otpLogin(userPhone);
  check('ورود کاربر عادی موفق', !!userToken);
  const forbiddenRes = await fetch(`${BASE}/api/admin/stats`, {
    headers: { 'x-pars-session': userToken ?? '' },
  });
  const forbiddenBody = (await forbiddenRes.json()) as ApiResp<unknown>;
  check(
    'کاربر عادی → ۴۰۳ FORBIDDEN',
    forbiddenRes.status === 403 && forbiddenBody.error?.code === 'FORBIDDEN',
    `status=${forbiddenRes.status} code=${forbiddenBody.error?.code ?? '-'}`
  );

  if (userToken) {
    const meRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { 'x-pars-session': userToken },
    });
    const meBody = (await meRes.json()) as ApiResp<{ user: { phone: string } | null }>;
    const userId = (
      await db.user.findUnique({ where: { phone: userPhone }, select: { id: true } })
    )?.id;
    const forbiddenLogs = userId
      ? await db.securityLog.count({ where: { event: 'FORBIDDEN', userId } })
      : 0;
    check(
      'تلاش غیرمجاز در SecurityLog ثبت شد (FORBIDDEN)',
      forbiddenLogs >= 1,
      `count=${forbiddenLogs}`
    );
    void meBody;
  }

  // ——— ۴) مدیر → ۲۰۰ ———
  console.log('\n۴) ورود مدیر و داشبورد:');
  const adminToken = await otpLogin(ADMIN_PHONE);
  check('ورود مدیر با OTP موفق', !!adminToken);
  if (adminToken) {
    const meRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { 'x-pars-session': adminToken },
    });
    const meBody = (await meRes.json()) as ApiResp<{ user: { role: string } | null }>;
    check(
      'نقش نشست مدیر ADMIN است',
      meBody.data?.user?.role === 'ADMIN',
      JSON.stringify(meBody.data?.user)
    );

    const statsRes = await fetch(`${BASE}/api/admin/stats`, {
      headers: { 'x-pars-session': adminToken },
    });
    const stats = (await statsRes.json()) as ApiResp<{
      revenue: { todayToman: number; weekToman: number; monthToman: number };
      ordersByStatus: Record<string, number>;
      ordersToday: number;
      users: { total: number; today: number };
      activeProducts: number;
      pendingReviews: number;
      topProducts: unknown[];
      recentOrders: unknown[];
      lowStock: unknown[];
      totalItemsSold: number;
    }>;
    check('GET /api/admin/stats با مدیر → ۲۰۰', statsRes.status === 200 && stats.ok === true);
    check(
      'ساختار آمار کامل (درآمد/وضعیت‌ها/پرفروش‌ها/سفارش‌ها/موجودی)',
      stats.data != null &&
        typeof stats.data.revenue?.todayToman === 'number' &&
        typeof stats.data.revenue?.weekToman === 'number' &&
        typeof stats.data.revenue?.monthToman === 'number' &&
        typeof stats.data.ordersByStatus === 'object' &&
        Array.isArray(stats.data.topProducts) &&
        Array.isArray(stats.data.recentOrders) &&
        Array.isArray(stats.data.lowStock) &&
        typeof stats.data.users?.total === 'number' &&
        typeof stats.data.activeProducts === 'number' &&
        typeof stats.data.pendingReviews === 'number' &&
        typeof stats.data.totalItemsSold === 'number',
      JSON.stringify(stats.data ? Object.keys(stats.data) : stats.error)
    );
    check(
      'محصول فعال شمرده شد (داده واقعی seed)',
      (stats.data?.activeProducts ?? 0) > 0,
      `activeProducts=${stats.data?.activeProducts}`
    );
  } else {
    check('ورود مدیر با OTP موفق', false, 'کاربر مدیر موجود نیست؟ bun scripts/set-admin.ts 09120000000');
  }

  console.log(`\nنتیجه: ${passed} موفق، ${failed} ناموفق`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error('خطای اجرای تست:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
