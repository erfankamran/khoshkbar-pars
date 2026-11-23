/** وضعیت فعلی دیتابیس — شمارش کلیدها */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const [users, admins, orders, addresses, reviews, favorites, carts, sessions, passkeys] =
    await Promise.all([
      db.user.count(),
      db.user.count({ where: { role: 'ADMIN' } }),
      db.order.count(),
      db.address.count(),
      db.review.count(),
      db.favorite.count(),
      db.cart.count(),
      db.session.count(),
      db.passkeyCredential.count(),
    ]);
  const byStatus = await db.order.groupBy({ by: ['status'], _count: { _all: true } });
  const sample = await db.user.findMany({
    where: { role: 'USER' },
    select: { phone: true, fullName: true, firstName: true, lastName: true },
    take: 8,
  });
  const provinces = await db.address.findMany({
    distinct: ['province'],
    select: { province: true },
  });
  console.log(
    JSON.stringify(
      {
        users,
        admins,
        orders,
        addresses,
        reviews,
        favorites,
        carts,
        sessions,
        passkeys,
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
        provincesFromAddresses: provinces.map((p) => p.province),
        sampleUsers: sample,
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
