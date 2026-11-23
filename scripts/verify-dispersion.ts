/* راستی‌آزمایی پراکندگی قیمت و یکتایی نام‌ها — bun scripts/verify-dispersion.ts */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  // ——— ۱) نام مشخص و یکتا برای هر کاربر ———
  const users = await db.user.findMany({
    where: { role: 'USER' },
    select: { id: true, fullName: true, firstName: true, lastName: true, phone: true },
  });
  const nameCount = new Map<string, number>();
  for (const u of users) nameCount.set(u.fullName ?? '', (nameCount.get(u.fullName ?? '') ?? 0) + 1);
  const dupNames = [...nameCount.entries()].filter(([, c]) => c > 1);
  const noName = users.filter((u) => !u.firstName || !u.lastName || !u.fullName);
  console.log('── نام‌ها ──');
  console.log('کاربران USER:', users.length);
  console.log('نام تکراری:', dupNames.length, dupNames.length ? JSON.stringify(dupNames) : '✓ همه یکتا');
  console.log('کاربر بدون نام کامل:', noName.length, noName.length ? '✗' : '✓');

  // ——— ۲) پراکندگی قیمت فاکتورها ———
  const orders = await db.order.findMany({
    where: { status: { not: 'CANCELED' } },
    select: { totalToman: true },
    orderBy: { totalToman: 'asc' },
  });
  const t = orders.map((o) => o.totalToman);
  const q = (p: number) => t[Math.min(t.length - 1, Math.floor(p * t.length))]!;
  const buckets = [0, 0, 0, 0, 0]; // <300k, 300k-1M, 1-2.5M, 2.5-5M, >5M
  for (const v of t) {
    if (v < 300_000) buckets[0]!++;
    else if (v < 1_000_000) buckets[1]!++;
    else if (v < 2_500_000) buckets[2]!++;
    else if (v < 5_000_000) buckets[3]!++;
    else buckets[4]!++;
  }
  console.log('\n── پراکندگی مبلغ فاکتورها (غیرلغوشده) ──');
  console.log('تعداد:', t.length);
  console.log('کمینه:', t[0], '| P25:', q(0.25), '| میانه:', q(0.5), '| P75:', q(0.75), '| P90:', q(0.9), '| P95:', q(0.95), '| بیشینه:', t[t.length - 1]);
  console.log('جمع مبالغ:', t.reduce((a, b) => a + b, 0), 'تومان');
  console.log('سبد خریذ <۳۰۰هزار:', buckets[0], '| ۳۰۰هزار-۱م:', buckets[1], '| ۱-۲.۵م:', buckets[2], '| ۲.۵-۵م:', buckets[3], '| >۵م:', buckets[4]);

  // ——— ۳) دادهٔ نقشهٔ استان‌ها (شبیه‌سازی geo APIs) ———
  const addrProvs = await db.address.findMany({ select: { province: true } });
  const userProv = new Map<string, number>();
  for (const a of addrProvs) userProv.set(a.province, (userProv.get(a.province) ?? 0) + 1);
  const ordersAll = await db.order.findMany({ select: { addressSnapshot: true, totalToman: true, status: true } });
  const orderProv = new Map<string, { n: number; rev: number }>();
  for (const o of ordersAll) {
    const snap = JSON.parse(o.addressSnapshot ?? '{}') as { province?: string };
    if (!snap.province) continue;
    const e = orderProv.get(snap.province) ?? { n: 0, rev: 0 };
    e.n++;
    if (o.status !== 'CANCELED') e.rev += o.totalToman;
    orderProv.set(snap.province, e);
  }
  console.log('\n── نقشهٔ استان‌ها ──');
  console.log('استان‌های مشتریان (آدرس):', userProv.size, 'از ۳۱');
  console.log('استان‌های فاکتورها (snapshot):', orderProv.size, 'از ۳۱');
  const top = [...orderProv.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  console.log('برترین استان‌های فاکتور:', top.map(([p, e]) => `${p}:${e.n} فاکتور`).join('، '));

  // ——— ۴) نمونهٔ نام‌ها ———
  const sample = await db.user.findMany({
    where: { role: 'USER' },
    select: { fullName: true, provinceRef: true },
  }).catch(() => null);
  const named = await db.user.findMany({ where: { role: 'USER' }, select: { fullName: true }, take: 150 });
  console.log('\nنمونهٔ ۱۲ نام از ۱۴۶ مشتری:');
  console.log(named.slice(0, 12).map((u) => u.fullName).join(' | '));
}
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
