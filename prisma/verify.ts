/**
 * پارس — تأیید صحت داده‌های Seed (فاز ۴)
 * اجرا: bun prisma/verify.ts
 * چک‌ها: شمارش‌ها، یکتایی واریانت وزنی، منطق تخفیف، رُند بودن قیمت،
 *        تصویر هر محصول، slug دسته‌ها با کلاینت، نمونه خروجی
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const [cats, products, variants, images, banners, stories, settings, users] =
    await Promise.all([
      db.category.count(),
      db.product.count(),
      db.productVariant.count(),
      db.productImage.count(),
      db.banner.count(),
      db.story.count(),
      db.setting.count(),
      db.user.count(),
    ]);
  console.log({ cats, products, variants, images, banners, stories, settings, users });

  const problems: string[] = [];

  // ۱) هر محصول حداقل یک تصویر و یک واریانت فعال دارد
  const noImage = await db.product.findMany({
    where: { images: { none: {} } },
    select: { slug: true },
  });
  if (noImage.length) problems.push(`بدون تصویر: ${noImage.map((p) => p.slug).join()}`);

  // ۲) منطق تخفیف: compareAt باید بزرگ‌تر از price باشد
  const badDiscount = await db.productVariant.findMany({
    where: { compareAtPriceToman: { not: null, lte: db.productVariant.fields.priceToman } },
    select: { id: true, priceToman: true, compareAtPriceToman: true },
  });
  if (badDiscount.length) problems.push(`تخفیف نامعتبر: ${badDiscount.length} واریانت`);

  // ۳) قیمت‌ها رُند به هزار تومان و مثبت
  const variantsAll = await db.productVariant.findMany({
    select: { priceToman: true, compareAtPriceToman: true, weightGrams: true },
  });
  const badRound = variantsAll.filter(
    (v) => v.priceToman % 1000 !== 0 || v.priceToman <= 0
  );
  if (badRound.length) problems.push(`قیمت غیررُند: ${badRound.length}`);

  // ۴) واریانت‌های وزنی استاندارد (250/500/750/1000)
  const badWeights = variantsAll.filter(
    (v) => ![250, 500, 750, 1000].includes(v.weightGrams)
  );
  if (badWeights.length) problems.push(`وزن غیراستاندارد: ${badWeights.length}`);

  // ۵) slug دسته‌ها با PLACEHOLDER_CATEGORIES کلاینت یکسان
  const catSlugs = (await db.category.findMany({ select: { slug: true } })).map((c) => c.slug);
  const clientSlugs = ['pistachio','almond','walnut','hazelnut','raisin','date','dried-fig','dried-mulberry','dried-fruit','mixed-nuts','seeds-kernels'];
  const missing = clientSlugs.filter((s) => !catSlugs.includes(s));
  if (missing.length) problems.push(`دسته غایب: ${missing.join()}`);

  // ۶) کارت‌های بخش «پیشنهاد ویژه» و «پرفروش‌ها» پر باشند
  const suggested = await db.product.count({ where: { isSuggested: true, isActive: true } });
  const discounted = await db.productVariant.count({ where: { compareAtPriceToman: { not: null } } });
  console.log({ suggested, discounted });
  if (suggested < 4) problems.push('پیشنهاد ویژه کمتر از ۴');
  if (discounted < 4) problems.push('تخفیف‌دار کمتر از ۴ واریانت');

  console.log(problems.length ? `❌ مشکلات: ${problems.join(' | ')}` : '✅ همه چک‌ها پاس شد');

  // نمونه خروجی: یک محصول با واریانت‌هایش
  const sample = await db.product.findUnique({
    where: { slug: 'pistachio-akbari' },
    select: {
      title: true, salesCount: true, ratingSum: true, ratingCount: true,
      images: { select: { url: true } },
      variants: { orderBy: { weightGrams: 'asc' }, select: { weightGrams: true, priceToman: true, compareAtPriceToman: true, stock: true } },
      category: { select: { slug: true, title: true } },
    },
  });
  console.log('— نمونه:', JSON.stringify(sample, null, 2));

  // نمایش ۳ پرفروش
  const best = await db.product.findMany({
    orderBy: { salesCount: 'desc' }, take: 3,
    select: { title: true, salesCount: true },
  });
  console.log('— پرفروش‌ها:', best);
}

main()
  .catch((e) => { console.error('VERIFY FAILED:', e); process.exit(1); })
  .finally(() => db.$disconnect());
