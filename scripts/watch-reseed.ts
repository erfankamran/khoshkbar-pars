// پایش پایداری دیتای reseed — هر ۴۵ ثانیه شمارش‌ها و مارکر را لاگ می‌کند
// اجرا: npx tsx scripts/watch-reseed.ts  (یا با bun)
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'fs';

const db = new PrismaClient();
const ITER = 12;
const GAP_MS = 45_000;
// baseline اجرای فعلی (seed 20261109): ۱۴۶ مشتری + ۲ ادمین، ۳۴۱ فاکتور
const EXPECT = { orders: 341, users: 148 };

async function main() {
  for (let i = 0; i < ITER; i++) {
    const [orders, users, marker] = [
      await db.order.count(),
      await db.user.count(),
      existsSync('/home/z/my-project/db/.reseed-marker'),
    ];
    const ok = orders === EXPECT.orders && users === EXPECT.users && marker;
    console.log(
      `${new Date().toISOString()} iter=${i + 1}/${ITER} orders=${orders} users=${users} marker=${marker} ${ok ? 'STABLE' : '*** CHANGED ***'}`
    );
    if (i < ITER - 1) await new Promise((r) => setTimeout(r, GAP_MS));
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
