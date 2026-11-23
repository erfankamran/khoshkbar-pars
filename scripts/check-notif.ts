import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const o = await db.order.findUnique({ where: { id: 'cmwsvqip80035r9lj9z3jvw78' }, select: { code: true, status: true, trackingCode: true, paymentStatus: true } });
  console.log('ORDER:', JSON.stringify(o));
  const cust = await db.user.findFirst({ where: { phone: '09121234567' }, select: { id: true } });
  const notifs = await db.notification.findMany({ where: { userId: cust!.id }, orderBy: { createdAt: 'desc' }, take: 6, select: { type: true, title: true, body: true, url: true, readAt: true, createdAt: true } });
  console.log('CUSTOMER NOTIFS:', JSON.stringify(notifs, null, 1));
  await db.$disconnect();
}
main();
