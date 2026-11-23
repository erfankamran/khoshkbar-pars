import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const v = await db.productVariant.findFirst({ where: { isActive: true, stock: { gt: 5 } }, select: { id: true, productId: true, priceToman: true, stock: true, product: { select: { title: true, isActive: true } } } });
  console.log('VARIANT:', JSON.stringify(v));
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, phone: true, isActive: true } });
  console.log('ADMINS:', JSON.stringify(admins));
  const users = await db.user.findMany({ where: { role: 'USER' }, take: 3, select: { id: true, phone: true, isActive: true } });
  console.log('USERS:', JSON.stringify(users));
  const minOrder = await db.setting.findFirst({ where: { key: 'minOrderToman' } });
  console.log('MIN_ORDER:', minOrder?.value ?? '(default 300000)');
  await db.$disconnect();
}
main();
