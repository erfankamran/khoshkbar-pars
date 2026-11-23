import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const byStatus = await db.order.groupBy({ by: ['status'], _count: { _all: true } });
const tracked = await db.order.count({ where: { trackingCode: { not: null } } });
const range = await db.order.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } });
const demo = await db.user.findUnique({ where: { phone: '09121234567' }, select: { id: true } });
const demoOrders = await db.order.findMany({
  where: { userId: demo!.id },
  select: { code: true, status: true, trackingCode: true },
  orderBy: { createdAt: 'desc' },
  take: 8,
});
const total = await db.order.count();
console.log(JSON.stringify({ total, tracked, byStatus, range, demoOrders }, null, 1));
await db.$disconnect();
