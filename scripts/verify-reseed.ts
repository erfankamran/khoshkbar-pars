/* صحت‌سنجی نهایی دیتای بازنشانی‌شده — bun scripts/verify-reseed.ts */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  const now = Date.now();
  console.log('users total:', await db.user.count(), '| USER:', await db.user.count({ where: { role: 'USER' } }));
  console.log('users w/o name:', await db.user.count({ where: { role: 'USER', OR: [{ fullName: null }, { fullName: '' }] } }));
  console.log('users w/o address:', await db.user.count({ where: { role: 'USER', addresses: { none: {} } } }));
  console.log('addresses:', await db.address.count());
  const provs = await db.address.findMany({ select: { province: true }, distinct: ['province'] });
  console.log('address provinces:', provs.length, '→', provs.map((p) => p.province).sort().join('، '));
  const phones = (await db.user.findMany({ where: { role: 'USER' }, select: { phone: true } })).map((u) => u.phone);
  console.log('bad phones:', phones.filter((p) => !/^09\d{9}$/.test(p)).length, '| duplicate phones:', phones.length - new Set(phones).size);
  console.log('orders:', await db.order.count(), '| items:', await db.orderItem.count());
  console.log('orders last24h:', await db.order.count({ where: { createdAt: { gte: new Date(now - 24 * 3600 * 1000) } } }));
  console.log('orders w/o items:', await db.order.count({ where: { items: { none: {} } } }));
  const userIds = new Set((await db.user.findMany({ select: { id: true } })).map((u) => u.id));
  const orderUserIds = await db.order.findMany({ select: { userId: true } });
  console.log('orders w/o user:', orderUserIds.filter((o) => !userIds.has(o.userId)).length);
  const sc = await db.product.findMany({ select: { slug: true, salesCount: true }, orderBy: { salesCount: 'desc' }, take: 6 });
  console.log('top salesCount:', JSON.stringify(sc));
  const totals = await db.order.aggregate({ _min: { totalToman: true }, _max: { totalToman: true }, _avg: { totalToman: true } });
  console.log('order totals min/max/avg:', totals._min.totalToman, '/', totals._max.totalToman, '/', Math.round(totals._avg.totalToman ?? 0));
  const nameless = await db.user.findMany({ where: { role: 'USER' }, select: { fullName: true, phone: true }, take: 6 });
  console.log('sample customers:', nameless.map((u) => u.fullName).join(' | '));
}
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
