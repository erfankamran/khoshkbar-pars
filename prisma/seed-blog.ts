/**
 * seed وبلاگ و صفحهٔ نمونه قالب‌ها (درخواست کاربر)
 *
 * اجرا: bun prisma/seed-blog.ts
 * - idempotent: با upsert روی slug — اجرای تکراری داده تکراری نمی‌سازد
 * - سه نوشتهٔ منتشرشده با محتوای واقعی و تمپلیت‌های ::: (الگوی کاربرد)
 * - یک صفحهٔ اختصاصی در حالت blocks که هر پنج تمپلیت صفحه‌ساز را نشان می‌دهد
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// ————————————————————— نوشته ۱ —————————————————————

const post1Content = `پسته یکی از مغزهای کمیاب و پرطرفدار ایرانی است که علاوه بر طعم بی‌نظیر، ترکیبات مفید فراوانی برای بدن دارد. در این مقاله نگاهی علمی و کاربردی به فواید پسته برای قلب و عروق می‌اندازیم.

## چربی‌های مفید پسته

حدود ۹۰ درصد چربی موجود در پسته از نوع «چربی سیر نشده» است؛ همان چربی‌هایی که در رژیم مدیترانه‌ای نقش محافظتی دارند. مصرف منظم و متعادل این چربی‌ها به تعادل کلسترول خون کمک می‌کند.

## پتاسیم و تنظیم فشار خون

پسته منبع خوبی از پتاسیم است؛ ماده‌ای که در تنظیم فشار خون نقش کلیدی دارد. یک مشت پسته (حدود ۳۰ گرم) بخش قابل توجهی از نیاز روزانه بدن را تأمین می‌کند.

:::feature
icon: ShieldCheck
title: آنتی‌اکسیدان‌های فراوان
text: لوتئین و زیگزانتین موجود در پسته از سلول‌ها در برابر استرس اکسیداتیو محافظت می‌کنند
:::

## چند توصیهٔ کاربردی

- پسته را **خام یا بو داده بدون نمک** انتخاب کنید تا مصرف سدیم بالا نرود
- وعدهٔ روزانه را به ۲۸ تا ۳۰ گرم محدود کنید (حدود یک مشت پر)
- پسته را در ظرف دربسته و دور از نور نگه دارید تا تازگی‌اش حفظ شود

:::note
variant: gold
پسته را با پوست خودش بخورید؛ سرعت خوردن کمتر می‌شود و کنترل میزان مصرف راحت‌تر است.
:::

## خرید پستهٔ باکیفیت

برای تجربهٔ واقعی طعم پستهٔ ایرانی، محصولات تازه و امسال باغ‌ها را انتخاب کنید:

:::card
image: /images/products/pistachio-akbari.webp
alt: پسته اکبری تازه
title: پسته اکبری — درشت و خوش‌طعم
text: پستهٔ اکبری تازهٔ امسال با ارسال سریع سراسری
link: /c/pistachio
linkText: مشاهده پسته‌ها
:::`;

// ————————————————————— نوشته ۲ —————————————————————

const post2Content = `خرید آجیل تازه فقط نیمی از ماجراست؛ نیم دیگر، نگهداری درست است تا طعم و خواص آن تا ماه‌ها حفظ شود. در این راهنما نکات کلیدی نگهداری را مرور می‌کنیم.

## دشمنان تازگی آجیل

سه عامل اصلی باعث کهنگی و تلخ‌شدن مغزها می‌شوند:

1. **گرما** — سرعت تندشدن چربی‌ها را چند برابر می‌کند
2. **نور** — مخصوصاً نور مستقیم آفتاب
3. **رطوبت و هوا** — باعث بی‌برگشتی بافت و کهنگی طعم

## جدول ماندگاری در شرایط مختلف

| نوع مغز | دمای اتاق | یخچال | فریزر |
| --- | --- | --- | --- |
| پسته | ۲ ماه | ۶ ماه | ۱۲ ماه |
| بادام | ۳ ماه | ۹ ماه | ۱۲ ماه |
| گردو | ۱ ماه | ۴ ماه | ۱۲ ماه |
| تخمه ژاپنی | ۲ ماه | ۵ ماه | ۱۰ ماه |

:::note
variant: info
گردو به‌دلیل چربی بالا حساس‌ترین مغز است؛ حتماً در فریزر نگه دارید و قبل از مصرف با حرارت ملایم «بیدار» کنید.
:::

## بسته‌بندی درست

- از ظروف شیشه‌ای دربسته یا کیسه‌های زیپ‌کی استفاده کنید
- هوای داخل ظرف را تا حد ممکن کم کنید
- برچسب تاریخ روی ظرف بزنید تا کهنه‌شدن را فراموش نکنید

## خرید به‌مقدار کم

بهترین راه خوردن همیشه‌تازه، خرید مقادیر کمتر اما تازه‌تر است. در فروشگاه پارس همهٔ مغزها بعد از ثبت سفارش تازه بسته‌بندی می‌شوند.`;

// ————————————————————— نوشته ۳ —————————————————————

const post3Content = `اگر قرار باشد فقط یک مغز را به‌عنوان «غذای کامل» انتخاب کنیم، بادام شانس اول را دارد. در این مقاله دلایل علمی این لقب را بررسی می‌کنیم.

## ویتامین E — رکورددار بین مغزها

یک وعدهٔ ۳۰ گرمی بادام حدود ۷.۳ میلی‌گرم ویتامین E تأمین می‌کند؛ یعنی نزدیک به نیمی از نیاز روزانه بدن. این ویتامین از مهم‌ترین آنتی‌اکسیدان‌های محلول در چربی است.

:::slider
- /images/products/almond-kernel.webp | مغز بادام تازه
- /images/products/almond-mamaei.webp | بادام مامایی ممتاز
- /images/products/walnut-toyserkan.webp | در کنار گردوی تویسرکان
:::

## فیبر و احساس سیری

بادام منبع خوبی از فیبر است؛ ترکیبی که هم برای هضم غذا ضروری است و هم با ایجاد احساس سیری به کنترل وزن کمک می‌کند. به همین دلیل بسیاری از رژیم‌های علمی، بادام را میان‌وعدهٔ استاندارد می‌دانند.

:::feature
icon: Leaf
title: بدون گلوتن و طبیعی
text: بادام گزینه‌ای عالی برای رژیم‌های بدون گلوتن و سبک‌های غذایی گیاهی است
:::

## نکتهٔ مهم دربارهٔ پوست قهوه‌ای بادام

پوست قهوه‌ای نازک بادام سرشار از آنتی‌اکسیدان است؛ پس بهتر است بادام را با پوست میل کنید مگر اینکه دستور پخت خاصی بدون پوست بخواهد.

:::card
image: /images/products/almond-mamaei.webp
alt: بادام مامایی ممتاز
title: بادام مامایی — درشت و معطر
text: محبوب‌ترین بادام ایرانی با پوست کاغذی و مغز پر
link: /c/almond
linkText: مشاهده بادام‌ها
:::

:::note
variant: success
برای جذب بهتر ویتامین‌های محلول در چربی، بادام را در کنار میوه‌های آبکی میل کنید.
:::`;

async function main() {
  console.log('— seed وبلاگ و صفحهٔ نمونه —');

  // ——— نوشته‌های بلاگ ———
  const posts = [
    {
      slug: 'pistachio-heart-health',
      title: 'پسته و سلامت قلب؛ چرا این مغز طلایی را جدی بگیریم؟',
      excerpt:
        'نگاهی علمی و کاربردی به فواید پسته برای قلب و عروق؛ از چربی‌های مفید تا پتاسیم و آنتی‌اکسیدان‌ها + توصیه‌های مصرف روزانه.',
      content: post1Content,
      coverUrl: '/images/products/pistachio-akbari.webp',
      coverAlt: 'پسته اکبری تازه',
      metaTitle: 'خواص پسته برای قلب | مجلهٔ فروشگاه پارس',
      metaDescription:
        'فواید علمی پسته برای سلامت قلب و عروق: چربی‌های سیرنشده، پتاسیم و آنتی‌اکسیدان + توصیهٔ مصرف روزانه و راهنمای خرید پستهٔ تازه.',
      tags: 'پسته,سلامتی,قلب',
      publishedAt: daysAgo(3),
    },
    {
      slug: 'nut-storage-guide',
      title: 'راهنمای کامل نگهداری آجیل و خشکبار در خانه',
      excerpt:
        'دشمنان تازگی آجیل کدام‌اند؟ جدول ماندگاری هر مغز در دمای اتاق، یخچال و فریزر + ترفندهای بسته‌بندی درست.',
      content: post2Content,
      coverUrl: '/images/products/mixed-nuts-luxury.webp',
      coverAlt: 'آجیل مخلوط لوکس',
      metaTitle: 'نگهداری آجیل و خشکبار | مجلهٔ فروشگاه پارس',
      metaDescription:
        'راهنمای کامل نگهداری آجیل: جدول ماندگاری پسته، بادام و گردو در یخچال و فریزر + نکات بسته‌بندی برای حفظ تازگی چندماهه.',
      tags: 'نگهداری,آجیل,راهنما',
      publishedAt: daysAgo(2),
    },
    {
      slug: 'almond-benefits',
      title: 'بادام؛ ملکهٔ مغزها — از ویتامین E تا رژیم سالم',
      excerpt:
        'چرا بادام را غذای کامل می‌نامند؟ ویتامین E، فیبر و نقش آن در کنترل وزن + نکتهٔ مهم دربارهٔ پوست قهوه‌ای بادام.',
      content: post3Content,
      coverUrl: '/images/products/almond-kernel.webp',
      coverAlt: 'مغز بادام تازه',
      metaTitle: 'خواص بادام و ویتامین E | مجلهٔ فروشگاه پارس',
      metaDescription:
        'فواید بادام برای سلامتی: رکورددار ویتامین E، فیبر و احساس سیری + راهنمای خرید بادام مامایی و تازهٔ ایرانی.',
      tags: 'بادام,ویتامین,سلامتی',
      publishedAt: daysAgo(1),
    },
  ];

  for (const p of posts) {
    const saved = await db.post.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        content: p.content,
        coverUrl: p.coverUrl,
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription,
        tags: p.tags,
        isPublished: true,
        publishedAt: p.publishedAt,
      },
      update: {
        title: p.title,
        excerpt: p.excerpt,
        content: p.content,
        coverUrl: p.coverUrl,
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription,
        tags: p.tags,
      },
    });
    console.log(`  ✓ post: ${saved.slug}`);
  }

  // ——— صفحهٔ نمونه قالب‌های صفحه‌ساز (حالت blocks) ———
  const demoBlocks = [
    {
      type: 'text',
      markdown:
        'این صفحه یک **نمونهٔ زنده** از قالب‌های آمادهٔ صفحه‌ساز است؛ پنج تمپلیت کامپوننتی که مدیر فروشگاه بدون یک خط کد در آن‌ها محتوای فروشگاهی، معرفی محصول و ویژگی‌ها را می‌چیند.',
    },
    {
      type: 'icons',
      columns: 4,
      items: [
        { icon: 'Truck', title: 'ارسال سریع', description: 'پست پیشتاز به سراسر کشور' },
        { icon: 'ShieldCheck', title: 'تضمین تازگی', description: 'بسته‌بندی پس از سفارش' },
        { icon: 'Leaf', title: 'طبیعی و سالم', description: 'بدون افزودنی و نگهدارنده' },
        { icon: 'Percent', title: 'تخفیف عمده', description: 'قیمت ویژهٔ سفارش سازمانی' },
      ],
    },
    {
      type: 'cards',
      columns: 3,
      items: [
        {
          title: 'پسته اکبری',
          description: 'درشت‌ترین پستهٔ ایرانی با طعم بی‌نظیر',
          imageUrl: '/images/products/pistachio-akbari.webp',
          href: '/c/pistachio',
          badge: 'پرفروش',
        },
        {
          title: 'بادام مامایی',
          description: 'معروف‌ترین بادام ایران با پوست کاغذی',
          imageUrl: '/images/products/almond-mamaei.webp',
          href: '/c/almond',
          badge: 'پیشنهاد پارس',
        },
        {
          title: 'خرما مضافتی',
          description: 'شیرین، مرطوب و پرانرژی از خرمشهر',
          imageUrl: '/images/products/date-mazafati.webp',
          href: '/c/date',
        },
      ],
    },
    {
      type: 'slider',
      autoplay: true,
      slides: [
        {
          imageUrl: '/images/products/gift-box-premium.webp',
          title: 'جعبهٔ هدیهٔ لوکس',
          subtitle: 'برای هدیه‌های سازمانی و مناسبت‌های ویژه',
          href: '/c/mixed-nuts',
        },
        {
          imageUrl: '/images/products/gift-pack-yalda.webp',
          title: 'بستهٔ ویژهٔ شب یلدا',
          subtitle: 'ترکیب هفت‌سین و آجیل یلدایی',
        },
        {
          imageUrl: '/images/products/mixed-nuts-luxury.webp',
          title: 'آجیل مخلوط ممتاز',
          subtitle: 'پنج مغز انتخابی با نسبت استاندارد',
        },
      ],
    },
    {
      type: 'gallery',
      columns: 3,
      images: [
        { url: '/api/media/banners/2026/11/7ab5c3d9-d5c4-4ac7-9f1b-c6eb58bf37a7.png', alt: 'بنر فروشگاه پارس' },
        { url: '/api/media/banners/2026/11/0cd0cc3e-5e0b-428a-9147-ac29d6624625.png', alt: 'بنر ویژهٔ فروش' },
        { url: '/api/media/banners/2026/11/5e959b42-7beb-4afc-84aa-1bec2bd6d6f7.png', alt: 'بنر معرفی محصولات' },
      ],
    },
    {
      type: 'text',
      markdown:
        'این صفحه در **پنل مدیریت → صفحات** قابل ویرایش است؛ کافی است حالت ویرایشگر را روی «بلوکی» بگذارید و با دکمهٔ افزودن، هر یک از پنج تمپلیت را اضافه یا جابه‌جا کنید. برای دیدن نمونهٔ واقعی، همین صفحه از مسیر `/p/page-builder-demo` در دسترس است.',
    },
  ];

  const page = await db.contentPage.upsert({
    where: { slug: 'page-builder-demo' },
    create: {
      slug: 'page-builder-demo',
      title: 'نمونه قالب‌های صفحه‌ساز',
      body: 'این صفحه در حالت بلوکی ساخته شده است. اگر این متن را می‌بینید یعنی بلوک‌ها بارگذاری نشده‌اند.',
      editorMode: 'blocks',
      blocks: JSON.stringify(demoBlocks),
      isActive: true,
      showInFooter: false,
      sortOrder: 99,
    },
    update: {
      title: 'نمونه قالب‌های صفحه‌ساز',
      editorMode: 'blocks',
      blocks: JSON.stringify(demoBlocks),
      isActive: true,
    },
  });
  console.log(`  ✓ page: ${page.slug}`);

  console.log('— seed کامل شد —');
}

main()
  .catch((e) => {
    console.error('seed failed:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
