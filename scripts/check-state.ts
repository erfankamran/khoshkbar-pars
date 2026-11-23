// بازبینی سریع وضعیت دیتابیس — فقط خواندنی
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [users, orders, customers, admin] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.user.count({ where: { role: 'ADMIN' } }),
  ]);

  const priceAgg = await prisma.order.aggregate({
    _min: { totalToman: true },
    _max: { totalToman: true },
    _avg: { totalToman: true },
  });

  const reseeded = await prisma.order.count({ where: { adminNote: { contains: 'RESEED' } } });

  const provinces = await prisma.address.groupBy({
    by: ['province'],
    _count: { province: true },
  });

  console.log(JSON.stringify({
    totalUsers: users,
    customers,
    admins: admin,
    totalOrders: orders,
    ordersWithReseedNote: reseeded,
    priceMin: priceAgg._min.totalToman,
    priceMax: priceAgg._max.totalToman,
    priceAvg: Math.round(priceAgg._avg.totalToman ?? 0),
    distinctProvincesInAddresses: provinces.length,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
