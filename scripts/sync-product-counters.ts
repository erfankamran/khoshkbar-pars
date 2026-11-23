/** بازمحاسبهٔ دقیق شمارنده‌های محصولات از دادهٔ واقعی (idempotent — بدون حذف) */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  // salesCount از آیتم سفارش‌های غیرلغوشده
  const sales = await db.orderItem.groupBy({
    by: ['productId'],
    _sum: { quantity: true },
    where: { order: { status: { not: 'CANCELED' } } },
  });
  let fixedSales = 0;
  const salesMap = new Map(sales.map((s) => [s.productId, s._sum.quantity ?? 0]));

  // ratingSum / ratingCount از نظرات تأییدشده
  const ratings = await db.review.groupBy({
    by: ['productId'],
    _sum: { rating: true },
    _count: { _all: true },
    where: { isApproved: true },
  });
  const ratingMap = new Map(ratings.map((r) => [r.productId, r]));

  const products = await db.product.findMany({ select: { id: true, title: true, salesCount: true, ratingSum: true, ratingCount: true } });
  for (const p of products) {
    const salesCount = salesMap.get(p.id) ?? 0;
    const r = ratingMap.get(p.id);
    const ratingSum = r?._sum.rating ?? 0;
    const ratingCount = r?._count._all ?? 0;
    if (p.salesCount !== salesCount || p.ratingSum !== ratingSum || p.ratingCount !== ratingCount) {
      await db.product.update({
        where: { id: p.id },
        data: { salesCount, ratingSum, ratingCount },
      });
      fixedSales++;
      console.log(
        `  ↺ ${p.title}: salesCount ${p.salesCount}→${salesCount}، rating ${p.ratingSum}/${p.ratingCount}→${ratingSum}/${ratingCount}`
      );
    }
  }

  const check = await db.product.aggregate({ _sum: { salesCount: true, ratingCount: true } });
  console.log(
    JSON.stringify({
      productsFixed: fixedSales,
      totalSalesCount: check._sum.salesCount,
      totalRatings: check._sum.ratingCount,
    })
  );
  console.log('— شمارنده‌ها همگام شد —');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
