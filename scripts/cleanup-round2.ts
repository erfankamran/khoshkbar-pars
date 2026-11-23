import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const since = new Date('2026-11-23T06:29:00.000Z');
  // ۱) سفارش‌های تست این مرحله — فقط کدهای مشخص
  const codes = ['PARS-14050902-37C3', 'PARS-14050902-DEC5'];
  for (const code of codes) {
    const o = await db.order.findUnique({ where: { code }, select: { id: true, items: { select: { variantId: true, productId: true, quantity: true } } } });
    if (!o) { console.log('skip', code); continue; }
    for (const it of o.items) {
      await db.productVariant.update({ where: { id: it.variantId }, data: { stock: { increment: it.quantity } } });
      await db.product.update({ where: { id: it.productId }, data: { salesCount: { decrement: it.quantity } } });
    }
    await db.orderItem.deleteMany({ where: { orderId: o.id } });
    await db.order.delete({ where: { id: o.id } });
    console.log('deleted order', code);
  }
  // ۲) اعلان‌های تست — فقط مقصدهای سفارش‌های حذف‌شده و سبد‌های تست
  const n1 = await db.notification.deleteMany({ where: { OR: [
    { url: { contains: '37C3' } },
    { url: { contains: 'DEC5' } },
    { type: 'CART_NEW', createdAt: { gte: since } },
  ] } });
  console.log('notifications deleted:', n1.count);
  // ۳) سبد تست مهمان (دو دستگاه تست) — توجه: ردیف‌های سبد کاربر واقعی دست نمی‌خورند
  const carts = await db.cart.findMany({ where: { deviceId: { in: ['99999999-8888-7777-6666-555555555555', '77777777-6666-5555-4444-333333333333', '11111111-2222-3333-4444-555555555555'] } }, select: { id: true } });
  for (const c of carts) { await db.cartItem.deleteMany({ where: { cartId: c.id } }); await db.cart.delete({ where: { id: c.id } }); }
  console.log('test guest carts deleted:', carts.length);
  // ۴) لاگ‌ها/نشست‌های تست این مرحله
  const logs = await db.notificationLog.deleteMany({ where: { createdAt: { gte: since } } });
  const sessions = await db.session.deleteMany({ where: { createdAt: { gte: since } } });
  const otps = await db.otpCode.deleteMany({ where: { createdAt: { gte: since } } });
  console.log('push logs:', logs.count, '| sessions:', sessions.count, '| otps:', otps.count);
  // ۵) شمارش نهایی اعلان‌ها (باید فقط داده‌های قدیمی بماند)
  const remain = await db.notification.count();
  console.log('notifications remaining:', remain);
  await db.$disconnect();
}
main();
