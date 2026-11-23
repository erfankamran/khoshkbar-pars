import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  // پاک‌سازی آرتیفکت‌های تست امروز (ساعت 06:15 به بعد UTC)
  const since = new Date('2026-11-23T06:15:00.000Z');
  const orders = await db.order.findMany({ where: { createdAt: { gte: since } }, select: { id: true, code: true } });
  console.log('test orders:', orders.map(o => o.code));
  for (const o of orders) {
    await db.orderItem.deleteMany({ where: { orderId: o.id } });
    await db.order.delete({ where: { id: o.id } });
  }
  // بازگردانی موجودی واریانت تست (۱ عدد کم شده بود)
  await db.productVariant.update({ where: { id: 'cmw62qf4y000gr38z4j1x8609' }, data: { stock: { increment: 1 } } });
  await db.product.update({ where: { id: 'cmw62qf4u000cr38zazvmzk04' }, data: { salesCount: { decrement: 1 } } });
  // پاک‌سازی اعلان‌های تست
  const n = await db.notification.deleteMany({ where: { createdAt: { gte: since } } });
  console.log('notifications deleted:', n.count);
  // پاک‌سازی سبد تست و لاگ‌های پوش تست
  await db.cartItem.deleteMany({ where: { createdAt: { gte: since } } });
  await db.cart.deleteMany({ where: { createdAt: { gte: since } } });
  const logs = await db.notificationLog.deleteMany({ where: { createdAt: { gte: since } } });
  console.log('push logs deleted:', logs.count);
  const sessions = await db.session.deleteMany({ where: { createdAt: { gte: since } } });
  console.log('test sessions deleted:', sessions.count);
  const otps = await db.otpCode.deleteMany({ where: { createdAt: { gte: since } } });
  console.log('otp codes deleted:', otps.count);
  await db.$disconnect();
}
main();
