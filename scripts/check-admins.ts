/** بررسی حساب‌های مدیر و نمونه واریانت‌ها */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const admins = await db.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, phone: true, fullName: true, isActive: true },
  });
  const variants = await db.productVariant.findMany({
    where: { isActive: true },
    select: { id: true, weightGrams: true, priceToman: true, product: { select: { title: true } } },
    take: 12,
  });
  const variantCount = await db.productVariant.count({ where: { isActive: true } });
  const products = await db.product.count();
  console.log(JSON.stringify({ admins, variantCount, products, variants }, null, 1));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
