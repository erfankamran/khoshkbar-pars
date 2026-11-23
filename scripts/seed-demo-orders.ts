/**
 * پخش قطعی همه سفارش‌ها روی ~۳۳۰ روز اخیر — گزارش واقع‌گرایانه فروش روزانه/ماهانه داشبورد
 * (درخواست کاربر: «گزارش‌های فروش ماهانه و روزانه» — داده انبوهِ متمرکز در چند روز،
 *  نمودارها را به یک ستون غول‌آسا تبدیل می‌کند؛ این اسکریپت همه را متوازن پخش می‌کند)
 *
 * - کاملاً قطعی: هر سفارش از hash کد خودش seed می‌شود → اجرای تکراری = نتیجه یکسان
 *   (مستقل از تعداد/ترتیب سفارش‌ها) — امن برای اجرای چندباره
 * - وضعیت بر اساس عمر: قدیمی‌ها تحویل‌شده/لغو، جدیدترها در جریان کار
 * - SHIPPED/DELIVERED کد رهگیری پست می‌گیرند (تست دکمه «بررسی وضعیت بسته پست»)
 * - createdAt کاربران هم بر اساس hash شماره پخش می‌شود
 *
 * اجرا: bun scripts/seed-demo-orders.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const MARK = 'DEMO-SPREAD';

// ——— LCG محلی برای هر رکورد (قطعی، مستقل از ترتیب) ———
function makeRng(seedNum: number) {
  let s = seedNum % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
/** djb2 → [0,1) */
function hash01(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h * 33 + text.charCodeAt(i)) % 2147483647;
  return h / 2147483647;
}

type Status = 'DELIVERED' | 'SHIPPED' | 'PROCESSING' | 'PAID' | 'PENDING_PAYMENT' | 'CANCELED';

/** وضعیت بر اساس عمر سفارش (روز) */
function statusFor(daysAgo: number, r: number): Status {
  if (daysAgo > 25) return r < 0.85 ? 'DELIVERED' : 'CANCELED';
  if (daysAgo > 8)
    return r < 0.55 ? 'DELIVERED' : r < 0.85 ? 'SHIPPED' : r < 0.95 ? 'CANCELED' : 'PROCESSING';
  if (daysAgo > 1)
    return r < 0.35 ? 'SHIPPED' : r < 0.6 ? 'PROCESSING' : r < 0.92 ? 'PAID' : 'CANCELED';
  return r < 0.45 ? 'PAID' : r < 0.8 ? 'PENDING_PAYMENT' : 'PROCESSING';
}

function paymentFields(status: Status, createdAt: Date, r: () => number) {
  const paid = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(status);
  const canceled = status === 'CANCELED';
  const cod = paid && !canceled && r() < 0.25;
  const paidAt =
    paid && !cod
      ? new Date(createdAt.getTime() + Math.floor(r() * 40 + 2) * 60_000)
      : canceled
        ? new Date(createdAt.getTime() + Math.floor(r() * 40 + 2) * 60_000)
        : null;
  return {
    paymentMethod: cod ? 'COD' : 'ONLINE_GATEWAY',
    paymentStatus: canceled ? 'REFUNDED' : paid ? 'PAID' : 'UNPAID',
    paidAt,
  };
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function digits(rng: () => number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += String(Math.floor(rng() * 10));
  return out;
}

async function main() {
  // ——— ۱) همه سفارش‌ها — پخش قطعی بر اساس hash کد ———
  const orders = await db.order.findMany({
    select: { id: true, code: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
  let touched = 0;
  for (const o of orders) {
    const r = makeRng(Math.floor(hash01(o.code) * 2147483646) + 1);
    const daysAgo = Math.floor(330 * Math.pow(r(), 1.45));
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);
    createdAt.setHours(9 + Math.floor(r() * 12), Math.floor(r() * 60), Math.floor(r() * 60), 0);
    const status = statusFor(daysAgo, r());
    const pay = paymentFields(status, createdAt, r);
    const tracking =
      status === 'SHIPPED' || status === 'DELIVERED' ? `24${digits(r, 22)}` : null;
    await db.order.update({
      where: { id: o.id },
      data: {
        createdAt,
        status,
        shippingMethodName: 'پست پیشتاز',
        shippingMethodEta: '۲ تا ۴ روز کاری',
        trackingCode: tracking,
        adminNote: MARK,
        ...pay,
      },
    });
    touched++;
  }

  // ——— ۲) پخش createdAt کاربران (ثبت‌نام واقع‌گرایانه) — قطعی بر اساس شماره ———
  const FIXED_DAYS: Record<string, number> = {
    '09120000000': 330, // مدیر
    '09121234567': 280, // کاربر نمایشی
  };
  const users = await db.user.findMany({ select: { id: true, phone: true } });
  let usersTouched = 0;
  for (const u of users) {
    const fixed = FIXED_DAYS[u.phone];
    const daysAgo = fixed ?? 3 + Math.floor(310 * hash01(u.phone));
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(10 + Math.floor(hash01(u.phone + 'h') * 10), Math.floor(hash01(u.phone + 'm') * 60), 0, 0);
    await db.user.update({ where: { id: u.id }, data: { createdAt: d } });
    usersTouched++;
  }

  // ——— گزارش نهایی ———
  const byStatus = await db.order.groupBy({ by: ['status'], _count: { _all: true } });
  const withTracking = await db.order.count({ where: { trackingCode: { not: null } } });
  const range = await db.order.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } });
  const monthAgg = await db.order.findMany({ select: { createdAt: true } });
  const byMonth = new Map<string, number>();
  for (const o of monthAgg) {
    const k = `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
  }
  console.log(
    JSON.stringify(
      {
        ordersSpread: touched,
        usersTouched,
        total: orders.length,
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
        withTracking,
        range: { min: range._min.createdAt, max: range._max.createdAt },
        byMonth: Object.fromEntries([...byMonth.entries()].sort()),
      },
      null,
      1
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
