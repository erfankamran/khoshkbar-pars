/**
 * پارسرا — درج پک‌های ۱ کیلوگرمی آجیل ترکیبی طرح یلدا و نوروز
 * در دسته «هدایای سازمانی» (corporate-gifts)
 *
 * اجرا: bun scripts/add-festive-gift-packs.ts
 * Idempotent — اجرای مکرر امن است (upsert بر اساس slug)
 */
import { PrismaClient } from '@prisma/client';
import { normalizePersian } from '../src/lib/fa';

const db = new PrismaClient();

interface PackSeed {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  attributes: Array<{ k: string; v: string }>;
  imageFile: string;
  variant: {
    weightGrams: number;
    priceToman: number;
    compareAtPriceToman: number;
    sku: string;
    stock: number;
  };
}

const GIFT_CATEGORY_SLUG = 'corporate-gifts';

const PACKS: PackSeed[] = [
  {
    slug: 'gift-pack-yalda',
    title: 'پک یک‌کیلویی آجیل ترکیبی طرح یلدا',
    shortDescription:
      'جعبه ۱ کیلوگرمی با طرح اختصاصی شب یلدا — پسته، بادام، مغز گردو، فندق و کشمش',
    description:
      'پک یک‌کیلویی آجیل ترکیبی طرح یلدا، انتخابی خاص برای شب‌های بلند زمستان است. ' +
      'ترکیب متعادلی از پسته اکبری، بادام ممتاز، مغز گردو، فندق بو داده، کشمش طلایی و توت خشک ' +
      'درجه یک، در جعبه‌ای با طرح اختصاصی شب یلدا — هلال ماه، شمع‌های روشن و انارهای سرخ — ' +
      'چیده می‌شود تا زیبایی سفره یلدای شما دوچندان شود. این پک برای هدایای سازمانی شب یلدا، ' +
      'مهمانی‌های شرکتی و توزیع بین همکاران طراحی شده و امکان درج لوگوی سازمان شما روی جعبه ' +
      'فراهم است. هر پک به‌صورت دستی چیده، وزن‌شده و در بسته‌بندی محافظ ارسال می‌شود.',
    attributes: [
      { k: 'وزن', v: '۱ کیلوگرم (۱۰۰۰ گرم)' },
      { k: 'محتویات', v: 'پسته، بادام، مغز گردو، فندق، کشمش، توت خشک' },
      { k: 'طرح بسته‌بندی', v: 'اختصاصی شب یلدا — انار، شمع و ماه' },
      { k: 'امکانات', v: 'درج لوگوی سازمان و کارت تبریک اختصاصی' },
      { k: 'مناسبت', v: 'شب یلدا، هدایای سازمانی، مهمانی‌های شرکتی' },
    ],
    imageFile: 'gift-pack-yalda.webp',
    variant: {
      weightGrams: 1000,
      priceToman: 2_180_000,
      compareAtPriceToman: 2_398_000,
      sku: 'PARS-GIFTYALDA-1000',
      stock: 25,
    },
  },
  {
    slug: 'gift-pack-nowruz',
    title: 'پک یک‌کیلویی آجیل ترکیبی طرح نوروز',
    shortDescription:
      'جعبه ۱ کیلوگرمی با طرح اختصاصی نوروز — پسته، بادام، مغز گردو، فندق و انجیر خشک',
    description:
      'پک یک‌کیلویی آجیل ترکیبی طرح نوروز، پیام‌آور بهار برای سفره‌های عید شماست. ' +
      'ترکیب متعادلی از پسته اکبری، بادام ممتاز، مغز گردو، فندق بو داده، کشمش طلایی و انجیر ' +
      'خشک درجه یک، در جعبه‌ای با طرح اختصاصی کاشی‌کاری بهاری و گل‌های لاله چیده می‌شود تا ' +
      'حال‌وهوای هفت‌سین را به هدیه شما بیاورد. این پک برای عیدی سازمانی، هدیه به مشتریان ' +
      'وفادار و مهمانان نوروزی طراحی شده و امکان درج لوگوی سازمان و کارت تبریک اختصاصی دارد. ' +
      'هر پک به‌صورت دستی چیده، وزن‌شده و در بسته‌بندی محافظ ارسال می‌شود.',
    attributes: [
      { k: 'وزن', v: '۱ کیلوگرم (۱۰۰۰ گرم)' },
      { k: 'محتویات', v: 'پسته، بادام، مغز گردو، فندق، کشمش، انجیر خشک' },
      { k: 'طرح بسته‌بندی', v: 'اختصاصی نوروز — لاله و کاشی‌کاری بهاری' },
      { k: 'امکانات', v: 'درج لوگوی سازمان و کارت تبریک عید' },
      { k: 'مناسبت', v: 'نوروز، عیدی سازمانی، هدیه به مشتریان' },
    ],
    imageFile: 'gift-pack-nowruz.webp',
    variant: {
      weightGrams: 1000,
      priceToman: 2_180_000,
      compareAtPriceToman: 2_398_000,
      sku: 'PARS-GIFTNOWRUZ-1000',
      stock: 25,
    },
  },
];

/** ساخت متن نرمال‌شده جستجو — منطق یکسان با seed.ts */
function buildSearchText(p: PackSeed, categoryTitle: string): string {
  const parts = [
    p.title,
    p.shortDescription,
    p.description,
    p.attributes.map((a) => `${a.k} ${a.v}`).join(' '),
    categoryTitle,
    p.slug.replace(/-/g, ' '),
  ].join(' ');
  return normalizePersian(parts).replace(/\s+/g, ' ').trim();
}

async function main() {
  const category = await db.category.findUnique({
    where: { slug: GIFT_CATEGORY_SLUG },
    select: { id: true, title: true },
  });
  if (!category) throw new Error(`دسته ${GIFT_CATEGORY_SLUG} یافت نشد`);

  console.log(`📂 دسته: ${category.title} (${category.id})`);

  for (const p of PACKS) {
    const product = await db.product.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        categoryId: category.id,
        shortDescription: p.shortDescription,
        description: p.description,
        attributes: JSON.stringify(p.attributes),
        searchText: buildSearchText(p, category.title),
        isActive: true,
        isSuggested: false,
      },
      update: {
        title: p.title,
        categoryId: category.id,
        shortDescription: p.shortDescription,
        description: p.description,
        attributes: JSON.stringify(p.attributes),
        searchText: buildSearchText(p, category.title),
        isActive: true,
      },
    });
    console.log(`✅ محصول: ${p.title} (${product.id})`);

    // تصویر محصول (اگر ندارد)
    const imgCount = await db.productImage.count({ where: { productId: product.id } });
    if (imgCount === 0) {
      await db.productImage.create({
        data: {
          productId: product.id,
          url: `/images/products/${p.imageFile}`,
          alt: p.title,
          sortOrder: 0,
        },
      });
      console.log(`   🖼  تصویر ایجاد شد: /images/products/${p.imageFile}`);
    } else {
      console.log(`   🖼  تصویر از قبل موجود (${imgCount})`);
    }

    // واریانت ۱۰۰۰ گرمی
    await db.productVariant.upsert({
      where: {
        productId_weightGrams_isWholesale: {
          productId: product.id,
          weightGrams: p.variant.weightGrams,
          isWholesale: false,
        },
      },
      create: {
        productId: product.id,
        weightGrams: p.variant.weightGrams,
        priceToman: p.variant.priceToman,
        compareAtPriceToman: p.variant.compareAtPriceToman,
        sku: p.variant.sku,
        stock: p.variant.stock,
        isActive: true,
      },
      update: {
        priceToman: p.variant.priceToman,
        compareAtPriceToman: p.variant.compareAtPriceToman,
        sku: p.variant.sku,
        isActive: true,
      },
    });
    console.log(
      `   💰 واریانت ${p.variant.weightGrams}g — ${p.variant.priceToman.toLocaleString('fa-IR')} تومان (stock=${p.variant.stock})`
    );
  }

  console.log('\n🎉 درج کامل شد');
}

main()
  .catch((e) => {
    console.error('❌ خطا:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
