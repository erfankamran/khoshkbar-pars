/**
 * تست رگرسیون اعلان گروهی و گزارش فروش (فاز ۱۱.۶)
 *
 * پوشش:
 *  ۱) امنیت: بدون نشست ۴۰۱ روی هر سه endpoint
 *  ۲) برادکست — اعتبارسنجی: عنوان/متن کوتاه یا بلند ۴۰۰، URL خارجی ۴۰۰،
 *     segment نامعتبر ۴۰۰
 *  ۳) برادکست ADMINS: تعداد گیرندگان = مدیران فعال؛ لاگ‌ها دقیقاً برای همان
 *     کاربران؛ نمایش در تاریخچه با شمارش‌های درست؛ حسابرسی BROADCAST_SEND
 *  ۴) برادکست PROMO_OPTIN: فقط دارندگان رضایت pushEnabled+promotions
 *     (یا ۴۰۰ NO_RECIPIENTS اگر کسی نیست)
 *  ۵) گزارش: ساختار daily بر اساس بازه، بازه نامعتبر ۴۰۰، همخوانی مجموع
 *     درآمد با aggregate مستقل دیتابیس، جمع وضعیت‌ها/پرداخت‌ها = کل سفارش‌ها
 *
 * اجرا: bun scripts/admin-broadcast-report-tests.ts [baseUrl]
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
async function login(phone: string): Promise<string | null> {
  const code = await mintOtp(phone);
  const verify = await req<OkEnvelope<{ sessionToken?: string }>>('POST', '/api/auth/otp/verify', null, {
    phone,
    code,
  });
  return verify.body.data?.sessionToken ?? null;
}

async function adminLogin(phones: string[]): Promise<string | null> {
  for (const phone of phones) {
    const token = await login(phone);
    if (token) return token;
    console.log(`  ↺ شماره ${phone} محدودیت OTP — شماره بعدی`);
  }
  return null;
}

interface BroadcastResult {
  broadcastId: string;
  recipients: number;
  pushTargets: number;
  sent: number;
  failed: number;
}

interface BroadcastItem {
  broadcastId: string;
  title: string;
  segment: string;
  kind: string;
  createdAt: string;
  counts: { total: number; sent: number; failed: number };
}

interface BroadcastList {
  items: BroadcastItem[];
  total: number;
}

interface Report {
  rangeDays: number;
  totals: { revenueToman: number; ordersCount: number; aovToman: number; cancelRate: number; itemsSold: number };
  daily: Array<{ day: string; revenueToman: number; ordersCount: number }>;
  ordersByStatus: Record<string, number>;
  paymentBreakdown: Record<string, number>;
  newUsers: { total: number; daily: Array<{ day: string; count: number }> };
  topProducts: Array<{ productId: string; title: string; quantity: number; revenueToman: number }>;
}

// ------------------------------------------------------------
// سناریو
// ------------------------------------------------------------

async function main() {
  console.log('════════ تست فاز ۱۱.۶ — اعلان گروهی و گزارش فروش ════════');

  section('۱) امنیت — دسترسی بدون نشست');
  check('تاریخچه بدون نشست → ۴۰۱', (await req('GET', '/api/admin/notifications', null)).status === 401);
  check(
    'ارسال بدون نشست → ۴۰۱',
    (await req('POST', '/api/admin/notifications', null, { title: 'x', body: 'y', segment: 'ALL' })).status === 401
  );
  check('گزارش بدون نشست → ۴۰۱', (await req('GET', '/api/admin/reports?days=7', null)).status === 401);

  const ADMIN_PHONES = ['09121111111', '09120000000', '09121111112', '09121111113'];
  const adminSession = await adminLogin(ADMIN_PHONES);
  if (!adminSession) {
    check('ورود مدیر (ADMIN)', false, 'همه شماره‌ها محدودیت OTP — بعد از یک ساعت اجرا کنید');
    console.log(`\n════════\nنتیجه: ${passed} موفق، ${failed} ناموفق\n════════`);
    await db.$disconnect();
    return;
  }
  check('ورود مدیر (ADMIN)', true);
  const me = await req<OkEnvelope<{ user: { id: string; phone: string } }>>('GET', '/api/auth/me', adminSession);
  const adminPhone = me.body.data?.user.phone ?? '';

  section('۲) اعتبارسنجی برادکست');
  const emptyTitle = await req('POST', '/api/admin/notifications', adminSession, {
    title: '  ',
    body: 'متن تست',
    segment: 'ALL',
  });
  check('عنوان خالی → ۴۰۰', emptyTitle.status === 400);
  const longTitle = await req('POST', '/api/admin/notifications', adminSession, {
    title: 'x'.repeat(61),
    body: 'متن تست',
    segment: 'ALL',
  });
  check('عنوان بلندتر از ۶۰ → ۴۰۰', longTitle.status === 400);
  const longBody = await req('POST', '/api/admin/notifications', adminSession, {
    title: 'عنوان تست',
    body: 'x'.repeat(301),
    segment: 'ALL',
  });
  check('متن بلندتر از ۳۰۰ → ۴۰۰', longBody.status === 400);
  const externalUrl = await req('POST', '/api/admin/notifications', adminSession, {
    title: 'عنوان تست',
    body: 'متن تست',
    segment: 'ALL',
    url: 'https://evil.example.com',
  });
  check('URL خارجی → ۴۰۰', externalUrl.status === 400);
  const badSegment = await req('POST', '/api/admin/notifications', adminSession, {
    title: 'عنوان تست',
    body: 'متن تست',
    segment: 'GALAXY',
  });
  check('segment نامعتبر → ۴۰۰', badSegment.status === 400);

  section('۳) برادکست به مدیران (ADMINS)');
  const activeAdmins = await db.user.count({ where: { role: 'ADMIN', isActive: true } });
  const bcAdmins = await req<OkEnvelope<BroadcastResult>>('POST', '/api/admin/notifications', adminSession, {
    title: 'تست اطلاعیه مدیران',
    body: 'این یک اعلان آزمایشی فاز ۱۱.۶ است',
    segment: 'ADMINS',
    kind: 'ANNOUNCEMENT',
  });
  check('ارسال به ADMINS → ۲۰۰', bcAdmins.status === 200 && !!bcAdmins.body.data);
  check(
    'گیرندگان = مدیران فعال',
    bcAdmins.body.data?.recipients === activeAdmins,
    `expected ${activeAdmins}, got ${bcAdmins.body.data?.recipients}`
  );
  const bcId = bcAdmins.body.data?.broadcastId ?? '';
  check('broadcastId برگشت', bcId.length > 0);

  const logs = await db.notificationLog.findMany({
    where: { data: { contains: bcId } },
    select: { userId: true, status: true },
  });
  check('تعداد لاگ‌ها = گیرندگان', logs.length === bcAdmins.body.data?.recipients);
  const logOwners = await db.user.findMany({
    where: { id: { in: logs.map((l) => l.userId ?? '') } },
    select: { role: true, isActive: true },
  });
  check('همه گیرندگان مدیر فعال هستند', logOwners.every((u) => u.role === 'ADMIN' && u.isActive));

  check('حسابرسی BROADCAST_SEND', await hasAudit(adminPhone, 'BROADCAST_SEND'));

  const listAfter = await req<OkEnvelope<BroadcastList>>(
    'GET',
    '/api/admin/notifications?limit=20',
    adminSession
  );
  const inList = listAfter.body.data?.items.find((i) => i.broadcastId === bcId);
  check('برادکست در تاریخچه دیده می‌شود', !!inList);
  check(
    'شمارش تاریخچه درست است',
    inList?.counts.total === logs.length && inList?.segment === 'ADMINS' && inList?.kind === 'ANNOUNCEMENT'
  );

  section('۴) برادکست مشترکان تبلیغات (PROMO_OPTIN)');
  const optinCount = await db.notificationPreference.count({
    where: { pushEnabled: true, promotions: true },
  });
  const bcOptin = await req<OkEnvelope<BroadcastResult>>('POST', '/api/admin/notifications', adminSession, {
    title: 'پیشنهاد ویژه پارس',
    body: 'تخفیف ۱۵٪ محصولات منتخب تا پایان هفته',
    segment: 'PROMO_OPTIN',
    kind: 'PROMOTION',
  });
  if (optinCount === 0) {
    check('بدون مشترک رضایت‌دار → ۴۰۰ NO_RECIPIENTS', bcOptin.status === 400 && bcOptin.body.error?.code === 'NO_RECIPIENTS');
  } else {
    check('ارسال به OPTIN → ۲۰۰', bcOptin.status === 200);
    check('گیرندگان = دارندگان رضایت تبلیغات', bcOptin.body.data?.recipients === optinCount);
  }

  section('۵) گزارش فروش — ساختار');
  const r7 = await req<OkEnvelope<Report>>('GET', '/api/admin/reports?days=7', adminSession);
  check('گزارش ۷ روزه → ۲۰۰', r7.status === 200 && !!r7.body.data);
  check('۷ سبد روزانه', r7.body.data?.daily.length === 7);
  const r14 = await req<OkEnvelope<Report>>('GET', '/api/admin/reports?days=14', adminSession);
  check('۱۴ سبد روزانه', r14.body.data?.daily.length === 14);
  const r30 = await req<OkEnvelope<Report>>('GET', '/api/admin/reports?days=30', adminSession);
  check('۳۰ سبد روزانه', r30.body.data?.daily.length === 30);

  section('۶) گزارش فروش — صحت اعداد');
  const report = r14.body.data!;
  // مقایسه با aggregate مستقل دیتابیس — همان بازه «از اولین کلید تا امروز»
  const firstDay = report.daily[0] ? new Date(`${report.daily[0].day}T00:00:00`) : new Date();
  const expectedAgg = await db.order.aggregate({
    where: { createdAt: { gte: firstDay }, status: { not: 'CANCELED' } },
    _sum: { totalToman: true },
    _count: { _all: true },
  });
  check(
    'درآمد مجموع با دیتابیس همخوان است',
    report.totals.revenueToman === (expectedAgg._sum.totalToman ?? 0),
    `expected ${expectedAgg._sum.totalToman ?? 0}, got ${report.totals.revenueToman}`
  );
  const totalOrdersInRange = await db.order.count({ where: { createdAt: { gte: firstDay } } });
  check('سفارش‌های کل = مجموع وضعیت‌ها', Object.values(report.ordersByStatus).reduce((a, b) => a + b, 0) === totalOrdersInRange);
  check(
    'پرداخت‌ها نیز جمعاً کل سفارش‌ها',
    Object.values(report.paymentBreakdown).reduce((a, b) => a + b, 0) === totalOrdersInRange
  );
  const expectedNewUsers = await db.user.count({ where: { createdAt: { gte: firstDay } } });
  check('کاربران جدید همخوان است', report.newUsers.total === expectedNewUsers);
  check(
    'پرفروش‌ها مرتب نزولی هستند',
    report.topProducts.every((p, i, arr) => i === 0 || arr[i - 1]!.quantity >= p.quantity)
  );
  const aovExpected = expectedAgg._count._all > 0 ? Math.round((expectedAgg._sum.totalToman ?? 0) / expectedAgg._count._all) : 0;
  check('میانگین سبد درست محاسبه شده', report.totals.aovToman === aovExpected);

  section('۷) گزارش — بازه نامعتبر');
  const badDays = await req('GET', '/api/admin/reports?days=45', adminSession);
  check('بازه ۴۵ → ۴۰۰', badDays.status === 400);
  const nanDays = await req('GET', '/api/admin/reports?days=abc', adminSession);
  check('بازه غیرعددی → ۴۰۰', nanDays.status === 400);

  console.log(`\n════════\nنتیجه: ${passed} موفق، ${failed} ناموفق\n════════`);
  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

async function hasAudit(phone: string, action: string): Promise<boolean> {
  const logs = await db.securityLog.findMany({
    where: { event: 'ADMIN_ACTION', phone },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  return logs.some((l) => (l.meta ?? '').includes(`"action":"${action}"`));
}

main().catch((e) => {
  console.error('خطای اجرا:', e);
  void db.$disconnect();
  process.exit(1);
});
