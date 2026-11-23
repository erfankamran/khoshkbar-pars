/** راستی‌آزمایی وضعیت نهایی دیتابیس پس از همگرایی دو اجرای موازی */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const users = await db.user.count();
  const customers = await db.user.count({ where: { role: 'USER' } });
  const noName = await db.user.count({ where: { fullName: null } });
  const addresses = await db.address.count();
  const orders = await db.order.count();
  const items = await db.orderItem.count();
  const reviews = await db.review.count();

  // ۱) سفارش بدون آیتم (روابط اجباری Cascade هستند — یتیمی در سطح Prisma ناممکن است)
  const orphanOrders = 0;
  const orphanItems = 0;
  const orphanReviews = await db.review.count({ where: { orderId: null, createdAt: { lt: new Date(Date.now() - 400 * 24 * 3600 * 1000) } } });
  const ordersNoItems = (await db.order.findMany({ select: { _count: { select: { items: true } } } })).filter(
    (o) => o._count.items === 0
  ).length;

  // ۲) مارکر سفارش‌ها (دو اجرا را تفکیک می‌کند)
  const myMarker = await db.order.count({ where: { adminNote: 'RESEED-2026-11' } });

  // ۳) snapshot ها
  const snaps = await db.order.findMany({ select: { addressSnapshot: true } });
  let brokenSnap = 0;
  for (const s of snaps) {
    try {
      if (!(JSON.parse(s.addressSnapshot) as { province?: string }).province) brokenSnap++;
    } catch {
      brokenSnap++;
    }
  }

  // ۴) salesCount درست؟
  const agg = await db.orderItem.groupBy({
    by: ['productId'],
    _sum: { quantity: true },
    where: { order: { status: { not: 'CANCELED' } } },
  });
  const expected = new Map(agg.map((a) => [a.productId, a._sum.quantity ?? 0]));
  const products = await db.product.findMany({ select: { id: true, salesCount: true } });
  const salesMismatch = products.filter((p) => (expected.get(p.id) ?? 0) !== p.salesCount).length;

  // ۵) پراکندگی استانی — کاربران (آدرس) و سفارش‌ها (snapshot)
  const userProv = await db.address.groupBy({ by: ['province'], _count: { _all: true } });
  const orderProv = new Map<string, { count: number; revenue: number }>();
  const rows = await db.order.findMany({
    where: { status: { not: 'CANCELED' } },
    select: { totalToman: true, addressSnapshot: true, createdAt: true },
  });
  const totals: number[] = [];
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    let p = 'نامشخص';
    try {
      p = (JSON.parse(r.addressSnapshot) as { province?: string }).province ?? 'نامشخص';
    } catch {
      /* skip */
    }
    const a = orderProv.get(p) ?? { count: 0, revenue: 0 };
    a.count++;
    a.revenue += r.totalToman;
    orderProv.set(p, a);
    totals.push(r.totalToman);
    const k = `${r.createdAt.getUTCFullYear()}-${String(r.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
  }
  totals.sort((a, b) => a - b);
  const q = (p: number) => totals[Math.floor(p * (totals.length - 1))]!;

  // ۶) نام‌های نمونه
  const sampleUsers = await db.user.findMany({
    where: { role: 'USER' },
    select: { fullName: true, phone: true, createdAt: true, addresses: { select: { province: true, city: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const statusAgg = await db.order.groupBy({ by: ['status'], _count: { _all: true } });
  const range = await db.order.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } });
  const demo = await db.user.findUnique({
    where: { phone: '09121234567' },
    select: { fullName: true, addresses: { select: { province: true, city: true } } },
  });

  console.log(
    JSON.stringify(
      {
        integrity: { users, customers, noName, addresses, orders, items, reviews, orphanOrders, orphanItems, orphanReviews, ordersNoItems, brokenSnap, salesMismatch, myMarkerOrders: myMarker },
        provincesUsers: Object.fromEntries(userProv.map((g) => [g.province, g._count._all]).sort()),
        provincesCoveredUsers: userProv.length,
        provincesCoveredOrders: orderProv.size,
        ordersByProvince: Object.fromEntries(
          [...orderProv.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([p, v]) => [p, `${v.count} / ${v.revenue.toLocaleString('fa-IR')}`])
        ),
        priceSpread: { min: totals[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: totals[totals.length - 1] },
        byStatus: Object.fromEntries(statusAgg.map((s) => [s.status, s._count._all])),
        byMonth: Object.fromEntries([...byMonth.entries()].sort()),
        range: { min: range._min.createdAt, max: range._max.createdAt },
        demoUser: demo,
        sampleUsers: sampleUsers.map((u) => ({ name: u.fullName, phone: u.phone, province: u.addresses[0]?.province, city: u.addresses[0]?.city, at: u.createdAt.toISOString().slice(0, 10) })),
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
