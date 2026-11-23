/**
 * Seed بخش «هدایای سازمانی» — دسته + ۳ محصول + ۲ بنر اسلایدر
 * اجرا: bun scripts/seed-gift-category.ts
 * قابل اجرای مجدد (idempotent): با upsert بر اساس slug/عنوان
 *
 * تصاویر قبلاً با scripts/gen-gift-images.mjs تولید و به public کپی شده‌اند.
 * بعد از اجرا حتماً سرور تولیدی ری‌استارت شود تا کش /api/home خالی شود.
 */
import { PrismaClient } from '@prisma/client';
import { normalizePersian } from '../src/lib/fa';

const db = new PrismaClient();

interface Attr {
  k: string;
  v: string;
}

interface GiftProductSeed {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  attributes: Attr[];
  images: Array<{ url: string; alt: string; sortOrder: number }>;
  variants: Array<{
    sku: string;
    weightGrams: number;
    priceToman: number;
    compareAtPriceToman: number;
    stock: number;
  }>;
}

function buildSearchText(p: GiftProductSeed, categoryTitle: string): string {
  const parts = [
    p.title,
    p.shortDescription,
    p.description,
    p.attributes.map((a) => `${a.k} ${a.v}`).join(' '),
    categoryTitle,
    p.slug.replace(/-/g, ' '),
  ];
  return normalizePersian(parts.filter(Boolean).join(' '));
}

const CATEGORY = {
  slug: 'corporate-gifts',
  title: 'هدایای سازمانی',
  description:
    'بسته‌های هدیه اختصاصی برای شرکت‌ها، همکاران و مشتریان — با چیدمان دلخواه، لوگوی سازمان و کارت تبریک',
  imageUrl: '/images/products/gift-box-classic.webp',
  icon: 'Gift',
  sortOrder: 12,
};

const PRODUCTS: GiftProductSeed[] = [
  {
    slug: 'gift-box-classic',
    title: 'جعبه هدیه کلاسیک پارس',
    shortDescription:
      'جعبه کرافت با روبان سبز و ۵ خانه جدا — پسته، بادام، آجیل و میوه خشک منتخب',
    description:
      'جعبه هدیه کلاسیک پارس با پنج خانه جداگانه، ترکیبی متعادل از پسته اکبری، بادام ممتاز، آجیل مخلوط بو داده، کشمش طلایی و میوه‌های خشک درجه یک را در خود جای داده است. جعبه کرافت مقاوم با روبان ساتن سبز و امکان درج لوگوی سازمان شما، انتخابی شایسته برای هدایای اداری، یادبود روابط عمومی و اهدای هدیه به مشتریان وفادار است. هر جعبه به‌صورت دستی چیده و در بسته‌بندی محافظ ارسال می‌شود.',
    attributes: [
      { k: 'بسته‌بندی', v: 'جعبه کرافت ۵ خانه با روبان ساتن' },
      { k: 'محتویات', v: 'پسته، بادام، آجیل مخلوط، کشمش، میوه خشک' },
      { k: 'امکانات', v: 'درج لوگوی سازمان و کارت تبریک اختصاصی' },
      { k: 'مناسبت', v: 'هدایای اداری، روز کارمند، یلدا' },
    ],
    images: [
      { url: '/images/products/gift-box-classic.webp', alt: 'جعبه هدیه کلاسیک پارس با روبان سبز', sortOrder: 0 },
    ],
    variants: [
      { sku: 'PARS-GIFTBOXCLASSIC-750', weightGrams: 750, priceToman: 980000, compareAtPriceToman: 1078000, stock: 18 },
      { sku: 'PARS-GIFTBOXCLASSIC-1500', weightGrams: 1500, priceToman: 1850000, compareAtPriceToman: 2035000, stock: 24 },
    ],
  },
  {
    slug: 'gift-basket-luxury',
    title: 'سبد هدیه لوکس سازمانی',
    shortDescription:
      'سبد چوبی دست‌باف با آجیل ممتاز، خرما و انجیر خشک — پوشش ارگانزا و روبان ابریشمی',
    description:
      'سبد هدیه لوکس سازمانی با سبد چوبی دست‌باف و چیدمان باشکوه آجیل ممتاز، خرما، انجیر خشک استهبان و توت درجه یک ارائه می‌شود. پوشش ارگانزا شفاف و روبان ابریشمی ظاهر سبد را برای مراسم‌های رسمی، هدیه مدیران و تقدیر از همکاران حرفه‌ای می‌کند. اندازه بزرگ سبد برای هدیه‌های گروهی و جلسات مهم نیز مناسب است.',
    attributes: [
      { k: 'بسته‌بندی', v: 'سبد چوبی دست‌باف با پوشش ارگانزا' },
      { k: 'محتویات', v: 'آجیل ممتاز، خرما، انجیر خشک، توت' },
      { k: 'امکانات', v: 'چیدمان سفارشی و کارت تبریک سازمانی' },
      { k: 'مناسبت', v: 'تقدیر از همکاران، هدیه مدیران، مراسم رسمی' },
    ],
    images: [
      { url: '/images/products/gift-basket-luxury.webp', alt: 'سبد هدیه لوکس سازمانی با آجیل و خرما', sortOrder: 0 },
    ],
    variants: [
      { sku: 'PARS-GIFTBASKETLUX-1500', weightGrams: 1500, priceToman: 2150000, compareAtPriceToman: 2365000, stock: 12 },
      { sku: 'PARS-GIFTBASKETLUX-3000', weightGrams: 3000, priceToman: 4100000, compareAtPriceToman: 4510000, stock: 8 },
    ],
  },
  {
    slug: 'gift-box-premium',
    title: 'جعبه هدیه چوبی پرمیوم',
    shortDescription:
      'جعبه چوبی سرمه‌ای با جداکننده طلایی — منتخب مغزها و خشکبار ممتاز با روبان طلایی',
    description:
      'جعبه هدیه چوبی پرمیوم با شش خانه جداکننده طلایی، مغز پسته، مغز بادام، گردوی تویسرکان، کشمش طلایی، فندق و تخمه ژاپنی ممتاز را در قالبی ماندگار عرضه می‌کند. جعبه چوبی پس از اتمام محتویات به‌عنوان جعبه نگهداری قابل استفاده است و پیام هدیه شما را ماندگارتر می‌کند. گزینه اول برای هدایای سالگرد همکاری، هدایایویژه و مشتریان کلیدی سازمان‌ها.',
    attributes: [
      { k: 'بسته‌بندی', v: 'جعبه چوبی با جداکننده طلایی و روبان' },
      { k: 'محتویات', v: 'مغز پسته، مغز بادام، گردو، کشمش، فندق، تخمه' },
      { k: 'امکانات', v: 'حکاکی لوگو روی درب جعبه (سفارشی)' },
      { k: 'مناسبت', v: 'سالگرد همکاری، مشتریان کلیدی، هدیه ویژه' },
    ],
    images: [
      { url: '/images/products/gift-box-premium.webp', alt: 'جعبه هدیه چوبی پرمیوم با جداکننده طلایی', sortOrder: 0 },
    ],
    variants: [
      { sku: 'PARS-GIFTBOXPREMIUM-1000', weightGrams: 1000, priceToman: 2680000, compareAtPriceToman: 2948000, stock: 10 },
      { sku: 'PARS-GIFTBOXPREMIUM-2000', weightGrams: 2000, priceToman: 5150000, compareAtPriceToman: 5665000, stock: 6 },
    ],
  },
];

const BANNERS = [
  {
    title: 'هدایای سازمانی پارس',
    subtitle: 'بسته‌های اختصاصی با لوگوی سازمان شما',
    imageUrl: '/images/banners/banner-gifts-1.webp',
    linkView: 'category',
    linkParams: JSON.stringify({ slug: 'corporate-gifts' }),
    sortOrder: 3,
  },
  {
    title: 'سبد هدیه برای هر مناسبت',
    subtitle: 'از یلدا تا روز کارمند — چیدمان دلخواه شما',
    imageUrl: '/images/banners/banner-gifts-2.webp',
    linkView: 'category',
    linkParams: JSON.stringify({ slug: 'corporate-gifts' }),
    sortOrder: 4,
  },
];

async function main() {
  // ——— دسته ———
  const category = await db.category.upsert({
    where: { slug: CATEGORY.slug },
    create: { ...CATEGORY },
    update: {
      title: CATEGORY.title,
      description: CATEGORY.description,
      imageUrl: CATEGORY.imageUrl,
      icon: CATEGORY.icon,
      sortOrder: CATEGORY.sortOrder,
      isActive: true,
    },
  });
  console.log(`✓ دسته: ${category.title} (${category.slug})`);

  // ——— محصولات ———
  for (const p of PRODUCTS) {
    const data = {
      slug: p.slug,
      title: p.title,
      categoryId: category.id,
      shortDescription: p.shortDescription,
      description: p.description,
      attributes: JSON.stringify(p.attributes),
      searchText: buildSearchText(p, CATEGORY.title),
      isActive: true,
    };
    const product = await db.product.upsert({
      where: { slug: p.slug },
      create: data,
      update: {
        title: data.title,
        categoryId: data.categoryId,
        shortDescription: data.shortDescription,
        description: data.description,
        attributes: data.attributes,
        searchText: data.searchText,
        isActive: true,
      },
    });
    for (const img of p.images) {
      const exists = await db.productImage.findFirst({
        where: { productId: product.id, url: img.url },
      });
      if (!exists) await db.productImage.create({ data: { productId: product.id, ...img } });
    }
    for (const v of p.variants) {
      const existing = await db.productVariant.findFirst({
        where: { productId: product.id, weightGrams: v.weightGrams },
      });
      if (existing) {
        await db.productVariant.update({
          where: { id: existing.id },
          data: {
            sku: v.sku,
            priceToman: v.priceToman,
            compareAtPriceToman: v.compareAtPriceToman,
            isActive: true,
          },
        });
      } else {
        await db.productVariant.create({
          data: {
            productId: product.id,
            sku: v.sku,
            weightGrams: v.weightGrams,
            priceToman: v.priceToman,
            compareAtPriceToman: v.compareAtPriceToman,
            stock: v.stock,
            isActive: true,
          },
        });
      }
    }
    console.log(`✓ محصول: ${p.title} (${p.variants.length} واریانت)`);
  }

  // ——— بنرها ———
  for (const b of BANNERS) {
    const existing = await db.banner.findFirst({ where: { imageUrl: b.imageUrl } });
    if (existing) {
      await db.banner.update({
        where: { id: existing.id },
        data: { ...b, isActive: true },
      });
      console.log(`↷ بنر بروزرسانی شد: ${b.title}`);
    } else {
      await db.banner.create({ data: { ...b, isActive: true } });
      console.log(`✓ بنر: ${b.title}`);
    }
  }

  const [catCount, giftCount, bannerCount] = await Promise.all([
    db.category.count({ where: { isActive: true } }),
    db.product.count({ where: { categoryId: category.id, isActive: true } }),
    db.banner.count({ where: { isActive: true } }),
  ]);
  console.log(`— جمع: ${catCount} دسته فعال | ${giftCount} محصول هدیه | ${bannerCount} بنر فعال`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
