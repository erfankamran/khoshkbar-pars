/**
 * پارس — Seed واقعی فروشگاه (فاز ۴)
 *
 * - اجرا: bun prisma/seed.ts  (idempotent — اجرای مکرر امن است)
 * - دسته‌بندی‌ها: slug ها دقیقاً همان PLACEHOLDER_CATEGORIES سمت کلاینت هستند
 *   تا اتصال UI در فاز ۶ بی‌دردسر باشد.
 * - قیمت‌ها: پایه «تومان بر کیلوگرم» منطبق با بازار خرده‌فروشی ایران (۱۴۰۴)
 *   و واریانت‌ها با ضریب بسته‌بندی + رُند به هزار تومان (تخفیف خرید حجمی).
 * - تصاویر: تولیدشده با AI در public/images (در پنل مدیریت قابل تعویض)
 */
import { PrismaClient } from '@prisma/client';
import { normalizePersian } from '../src/lib/fa';
import { jalaliOrderDate } from '../src/lib/jalali';

const db = new PrismaClient();

/** رُند قیمت به هزار تومان */
const roundK = (n: number) => Math.round(n / 1000) * 1000;

// ------------------------------------------------------------
// ابزارهای سفارش‌های نمایشی (بخش ۹)
// ------------------------------------------------------------

/** PRNG قطعی — خروجی seed در اجراهای مختلف پایدار بماند (Mulberry32) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** پسوند کد سفارش قطعی از ایندکس — الفبای بدون ابهام (هماهنگ با order.service) */
const CODE_ALPHABET_SEED = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function codeSuffix(n: number): string {
  let s = '';
  let x = n;
  for (let k = 0; k < 4; k++) {
    s = CODE_ALPHABET_SEED[x % CODE_ALPHABET_SEED.length]! + s;
    x = Math.floor(x / CODE_ALPHABET_SEED.length);
  }
  return s;
}

/** رشتهٔ n رقمی قطعی — برای شناسه باربری ۲۴ رقمی نمایشی */
function randomDigits(rnd: () => number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String(Math.floor(rnd() * 10));
  return s;
}

// ------------------------------------------------------------
// نام‌های رندوم کاربران نمونه (درخواست مدیر) — استخر نام‌های ایرانی
// هر اجرای seed برای حساب‌های نمایشی (کاربر آزمایشی + خریداران) نام‌های
// تازه و متفاوت می‌سازد؛ حساب مدیر همیشه ثابت می‌ماند.
// ------------------------------------------------------------
const FIRST_NAMES = [
  'مریم', 'زهرا', 'فاطمه', 'سارا', 'نرگس', 'شیرین', 'پریسا', 'الهام', 'مینا', 'سمانه',
  'لیلا', 'نازنین', 'شیوا', 'سارینا', 'هدیه', 'آیدا', 'رها', 'ترانه', 'غزاله', 'نیلوفر',
  'علی', 'محمد', 'حسین', 'رضا', 'امیر', 'مهدی', 'سعید', 'کاوه', 'آرش', 'بابک',
  'نیما', 'یاسر', 'فرزاد', 'بهنام', 'کامران', 'سهیل', 'پویا', 'فرهاد', 'سامان', 'اردلان',
];
const LAST_NAMES = [
  'احمدی', 'رضایی', 'کریمی', 'محمدی', 'موسوی', 'حسینی', 'صادقی', 'نجفی', 'قاسمی', 'مهدوی',
  'طاهری', 'شریفی', 'یمینی', 'عباسی', 'زمانی', 'فرهادی', 'بهرامی', 'اسدی', 'کاظمی', 'رستمی',
  'نیک‌نام', 'سلطانی', 'امینی', 'پارسا', 'دهقان', 'افشار', 'اکبری', 'جهانی', 'غفاری', 'وحیدی',
];

/**
 * انتخاب نام رندوم بدون تکرار در یک اجرا — خروجی با ساختار پروفایل هم‌راستاست:
 * firstName/lastName جدا ذخیره و fullName طبق منطق user.service هم‌زمان sync می‌شود.
 */
function randomPersonName(used: Set<string>): {
  firstName: string;
  lastName: string;
  fullName: string;
} {
  let firstName = '';
  let lastName = '';
  let fullName = '';
  do {
    firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]!;
    lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]!;
    fullName = `${firstName} ${lastName}`;
  } while (used.has(fullName));
  used.add(fullName);
  return { firstName, lastName, fullName };
}

/** ساخت متن نرمال‌شده جستجو — منطق یکسان با search.service.ts */
function buildSearchText(
  p: Pick<ProductSeed, 'slug' | 'title' | 'shortDescription' | 'description' | 'attributes'>,
  categoryTitle: string
): string {
  const parts = [
    p.title,
    p.shortDescription,
    p.description,
    p.attributes?.map((a) => `${a.k} ${a.v}`).join(' '),
    categoryTitle,
    p.slug.replace(/-/g, ' '),
  ];
  return normalizePersian(parts.filter(Boolean).join(' '));
}

// ------------------------------------------------------------
// تنظیمات فروشگاه (فاز ۱۳ از پنل مدیریت کنترل می‌شود)
// ------------------------------------------------------------
const SETTINGS: Array<{ key: string; value: string; description: string }> = [
  { key: 'freeShippingThresholdToman', value: '1500000', description: 'سقف خرید ارسال رایگان' },
  { key: 'deliveryFeeToman', value: '49000', description: 'هزینه ارسال عادی' },
  { key: 'minOrderToman', value: '300000', description: 'حداقل مبلغ سفارش' },
  { key: 'storeOpen', value: 'true', description: 'فروشگاه باز است' },
  { key: 'supportPhone', value: '021-91000000', description: 'تلفن پشتیبانی' },
];

// ------------------------------------------------------------
// دسته‌بندی‌ها — slug مطابق PLACEHOLDER_CATEGORIES سمت کلاینت
// ------------------------------------------------------------
const CATEGORIES = [
  { slug: 'pistachio', title: 'پسته', imageUrl: '/images/products/pistachio-akbari.webp', description: 'انواع پسته ایرانی: اکبری، احمدآقایی و خنده‌ای' },
  { slug: 'almond', title: 'بادام', imageUrl: '/images/products/almond-mamaei.webp', description: 'بادام درخشانی و مغز بادام تازه' },
  { slug: 'walnut', title: 'گردو', imageUrl: '/images/products/walnut-toyserkan.webp', description: 'گردو کاغذی تویسرکان و مغز گردو' },
  { slug: 'hazelnut', title: 'فندق', imageUrl: '/images/products/hazelnut-ardabil.webp', description: 'فندق اردبیل و مغز فندق بو داده' },
  { slug: 'raisin', title: 'کشمش', imageUrl: '/images/products/raisin-green.webp', description: 'کشمش پلویی، طلایی و تیزابی' },
  { slug: 'date', title: 'خرما', imageUrl: '/images/products/date-mazafati.webp', description: 'خرمای مضافتی بم و پیارم حاجی‌آباد' },
  { slug: 'dried-fig', title: 'انجیر خشک', imageUrl: '/images/products/dried-fig.webp', description: 'انجیر خشک استهبان ممتاز' },
  { slug: 'dried-mulberry', title: 'توت خشک', imageUrl: '/images/products/dried-mulberry.webp', description: 'توت خشک درشت و شیرین' },
  { slug: 'dried-fruit', title: 'میوه خشک', imageUrl: '/images/products/dried-apricot.webp', description: 'برگه زردآلو و میوه‌های خشک شده' },
  { slug: 'mixed-nuts', title: 'آجیل مخلوط', imageUrl: '/images/products/mixed-nuts-luxury.webp', description: 'ترکیب ممتاز آجیل شب یلدا و میهمانی' },
  { slug: 'seeds-kernels', title: 'تخمه و مغزها', imageUrl: '/images/products/pumpkin-seed-kernel.webp', description: 'مغز تخمه کدو، ژاپنی و آفتابگردان' },
] as const;

// ------------------------------------------------------------
// محصولات — base: تومان بر کیلوگرم
// weights: واریانت‌های وزنی (گرم) — بخش ۵.۳ مشخصات
// discountPercent: اگر > 0 → compareAtPriceToman محاسبه می‌شود
// ------------------------------------------------------------
interface ProductSeed {
  slug: string;
  title: string;
  category: (typeof CATEGORIES)[number]['slug'];
  basePriceKg: number;
  shortDescription: string;
  description: string;
  attributes?: Array<{ k: string; v: string }>;
  weights?: number[];
  discountPercent?: number;
  salesCount: number;
  ratingAvg: number; // 0..5
  ratingCount: number;
  isSuggested?: boolean;
  lowStock?: number[]; // وزن‌هایی که موجودی کم دارند (برای UI)
  /** اسلایدهای اضافه گالری — علاوه بر تصویر پیش‌فرض slug.webp */
  extraImages?: Array<{ url: string; alt: string }>;
}

const PRODUCTS: ProductSeed[] = [
  {
    slug: 'pistachio-akbari', title: 'پسته اکبری خوش‌رنگ', category: 'pistachio',
    basePriceKg: 2_250_000, discountPercent: 10, salesCount: 1240, ratingAvg: 4.8, ratingCount: 214, isSuggested: true,
    shortDescription: 'درشت، خوش‌رنگ و با مغز سبز پر — پسته درجه یک اکبری رفسنجان',
    description: 'پسته اکبری از مزارع رفسنجان با شیار کشیده و مغز سبز پررنگ. تازه بو داده با نمک دریایی کم و در بسته‌بندی پنج‌لایه محافظ طعم و تازگی ارسال می‌شود.',
    attributes: [{ k: 'درجه', v: 'یک (فندقی اکبری)' }, { k: 'طعم', v: 'بو داده با نمک کم' }, { k: 'منشأ', v: 'رفسنجان، کرمان' }],
    lowStock: [1000],
    extraImages: [
      { url: '/images/products/pistachio-kalehghouchi.webp', alt: 'نمای نزدیک دانه‌های پسته اکبری' },
    ],
  },
  {
    slug: 'pistachio-ahmadaghaei', title: 'پسته احمدآقایی', category: 'pistachio',
    basePriceKg: 1_950_000, salesCount: 870, ratingAvg: 4.6, ratingCount: 156,
    shortDescription: 'کشیده و بادامی با پوست روشن — محبوب‌ترین پسته برای پذیرایی',
    description: 'پسته احمدآقایی به دلیل شکل کشیده و پوست بژ روشن، زیباترین گزینه برای آجیل پذیرایی است. برداشت سال جاری با نرخ رطوبت استاندارد بسته‌بندی شده است.',
    attributes: [{ k: 'درجه', v: 'یک' }, { k: 'طعم', v: 'بو داده با نمک کم' }, { k: 'منشأ', v: 'سیرجان، کرمان' }],
  },
  {
    slug: 'pistachio-kalehghouchi', title: 'پسته خنده‌ای (کله‌قوچی)', category: 'pistachio',
    basePriceKg: 1_780_000, salesCount: 720, ratingAvg: 4.5, ratingCount: 98,
    shortDescription: 'درشت و گرد با دهانه خندان باز — اقتصادی و پر مغز',
    description: 'کله‌قوچی به دلیل اندازه گرد و دهانه باز، پر مغزترین انتخاب برای مصرف روزانه است. مغز آن سبز و آبدار است و برای شکلات‌پوشانی هم عالی است.',
    attributes: [{ k: 'درجه', v: 'یک' }, { k: 'طعم', v: 'بو داده' }, { k: 'منشأ', v: 'کرمان' }],
  },
  {
    slug: 'almond-mamaei', title: 'بادام درخشانی مامایی', category: 'almond',
    basePriceKg: 1_280_000, salesCount: 540, ratingAvg: 4.6, ratingCount: 112,
    shortDescription: 'بادام درخشانی ایرانی با پوست نازک و مغز شیرین',
    description: 'بادام مامایی از باغ‌های دامنه‌های چالدران با پوست نازک (درخشانی) که مغز آن به‌راحتی جدا می‌شود. مناسب مصرف خام و بوداده.',
    attributes: [{ k: 'نوع', v: 'درخشانی مامایی' }, { k: 'پوسته', v: 'نازک' }, { k: 'منشأ', v: 'آذربایجان غربی' }],
  },
  {
    slug: 'almond-kernel', title: 'مغز بادام درخشانی', category: 'almond',
    basePriceKg: 1_950_000, salesCount: 430, ratingAvg: 4.7, ratingCount: 88, isSuggested: true,
    shortDescription: 'مغز بادام تمیز و یکدست — آماده مصرف در شیرینی و آجیل',
    description: 'مغز بادام سفید و یکدست، پوست‌گرفته‌شده با ماشین‌های ملایم برای حفظ سلامت مغز. انتخاب اول شیرینی‌پزهای خانگی و حرفه‌ای.',
    attributes: [{ k: 'پرداخت', v: 'پوست‌گرفته' }, { k: 'یکدستی', v: 'بالا' }],
  },
  {
    slug: 'walnut-toyserkan', title: 'گردو کاغذی تویسرکان', category: 'walnut',
    basePriceKg: 1_420_000, salesCount: 640, ratingAvg: 4.7, ratingCount: 143,
    shortDescription: 'پوست کاغذی، مغز روشن و بدون تلخی — گردوی ممتاز همدان',
    description: 'گردوی کاغذی تویسرکان با پوسته بسیار نازک که با دست باز می‌شود. مغز روشن با طعم شیرین و بدون تلخی؛ برداشت پاییز امسال.',
    attributes: [{ k: 'نوع پوسته', v: 'کاغذی' }, { k: 'رنگ مغز', v: 'روشن (Grade A)' }, { k: 'منشأ', v: 'تویسرکان، همدان' }],
  },
  {
    slug: 'walnut-kernel', title: 'مغز گردو سرخ', category: 'walnut',
    basePriceKg: 1_680_000, discountPercent: 12, salesCount: 510, ratingAvg: 4.6, ratingCount: 76,
    shortDescription: 'مغز گردوی نیمه و چهارک — رنگ سرخ مرغوب',
    description: 'مغز گردوی سرخ جدا‌شده دستی، مناسب آجیل، شیرینی‌پزی و روغن‌گیری. در سردخانه با دمای کنترل‌شده نگهداری شده تا تلخی ایجاد نشود.',
    attributes: [{ k: 'درجه رنگ', v: 'سرخ' }, { k: 'نوع', v: 'نیمه و چهارک' }],
  },
  {
    slug: 'hazelnut-ardabil', title: 'فندق درشت اردبیل', category: 'hazelnut',
    basePriceKg: 990_000, salesCount: 390, ratingAvg: 4.5, ratingCount: 64,
    shortDescription: 'فندق درشت و تازه باغ‌های ارسباران',
    description: 'فندق گرد و درشت اردبیل با پوسته صاف و مغز پر. مناسب بوداده کردن خانگی یا مصرف خام در آجیل مخلوط.',
    attributes: [{ k: 'اندازه', v: 'درشت (بزرگ‌تر از ۱۸ میلی‌متر)' }, { k: 'منشأ', v: 'اردبیل' }],
  },
  {
    slug: 'hazelnut-kernel', title: 'مغز فندق بو داده', category: 'hazelnut',
    basePriceKg: 1_560_000, salesCount: 350, ratingAvg: 4.6, ratingCount: 59,
    shortDescription: 'مغز فندق بو داده با نمک دریایی — عالی برای اسنک',
    description: 'مغز فندق یکدست که در کارگاه خودمان با هوای داغ ملایم بو داده شده؛ بدون روغن افزوده و با نمک دریایی کم.',
    attributes: [{ k: 'پرداخت', v: 'بو داده بدون روغن' }, { k: 'نمک', v: 'کم' }],
  },
  {
    slug: 'raisin-green', title: 'کشمش پلویی سبز ملایر', category: 'raisin',
    basePriceKg: 340_000, salesCount: 610, ratingAvg: 4.4, ratingCount: 102,
    shortDescription: 'کشمش پلویی سبز، بدون هسته و شیرین — مناسب پلو و آجیل',
    description: 'کشمش پلویی سبز از انگور بی‌دانه عسکری ملایر، خشک‌شده در سایه برای حفظ رنگ روشن. بدون هیچ افزودنی شیرین‌کننده.',
    attributes: [{ k: 'نوع', v: 'پلویی سبز' }, { k: 'هسته', v: 'بدون هسته' }],
  },
  {
    slug: 'raisin-golden', title: 'کشمش طلایی (سولطانا)', category: 'raisin',
    basePriceKg: 390_000, discountPercent: 15, salesCount: 480, ratingAvg: 4.5, ratingCount: 87,
    shortDescription: 'کشمش طلایی روشن با طعم کارامل ملایم',
    description: 'کشمش طلایی سولطانا با رنگ کهربایی روشن؛ پرداخت حرفه‌ای و شسته‌شده، آماده مصرف مستقیم روی دسر و صبحانه.',
    attributes: [{ k: 'نوع', v: 'سولطانا طلایی' }, { k: 'پرداخت', v: 'شسته و آماده مصرف' }],
  },
  {
    slug: 'date-mazafati', title: 'خرمای مضافتی بم', category: 'date',
    basePriceKg: 460_000, salesCount: 760, ratingAvg: 4.7, ratingCount: 188,
    shortDescription: 'خرمای مضافتی نرم و تیره با رطوبت مطلوب',
    description: 'مضافتی درجه یک بم با بافت نرم، رنگ قهوه‌ای تیره براق و شیرینی متعادل. در یخچال حمل و نگهداری می‌شود تا تازگی خود را حفظ کند.',
    attributes: [{ k: 'رطوبت', v: '۱۵ تا ۲۰ درصد' }, { k: 'درجه', v: 'یک' }, { k: 'منشأ', v: 'بم، کرمان' }],
  },
  {
    slug: 'date-piarom', title: 'خرمای پیارم حاجی‌آباد', category: 'date',
    basePriceKg: 720_000, discountPercent: 10, salesCount: 460, ratingAvg: 4.8, ratingCount: 132, isSuggested: true,
    shortDescription: '«خرمای شکلاتی» نیمه‌خشک با پوست شکلاتی و شیرینی کم',
    description: 'پیارم به خاطر بافت نیمه‌خشک و شیرینی ملایم، محبوب‌ترین خرمای صادراتی ایران است. انتخابی عالی برای دیabetics-friendly پذیرایی (بدون قند افزوده).',
    attributes: [{ k: 'نوع', v: 'نیمه‌خشک' }, { k: 'منشأ', v: 'حاجی‌آباد، هرمزگان' }],
    lowStock: [500],
  },
  {
    slug: 'dried-fig', title: 'انجیر خشک استهبان ممتاز', category: 'dried-fig',
    basePriceKg: 1_180_000, salesCount: 340, ratingAvg: 4.6, ratingCount: 71,
    shortDescription: 'انجیر پرک درشت با دهانه باز — درجه ممتاز صادراتی',
    description: 'انجیر خشک ممتاز استهبان با گل‌های سفید روی پوست و دهانه طبیعی باز. بدون مواد نگهدارنده؛ خشک‌شده زیر آفتاب فارس.',
    attributes: [{ k: 'درجه', v: 'ممتاز (پرک ۱۰۱)' }, { k: 'منشأ', v: 'استهبان، فارس' }],
  },
  {
    slug: 'dried-mulberry', title: 'توت خشک درشت', category: 'dried-mulberry',
    basePriceKg: 920_000, salesCount: 280, ratingAvg: 4.5, ratingCount: 45,
    shortDescription: 'توت خشک کامل و پفکی با شیرینی طبیعی',
    description: 'توت خشک درشت از باغ‌های خراسان با شیرینی طبیعی بالا؛ جایگزین سالم شکر در چای و دمنوش.',
    attributes: [{ k: 'اندازه', v: 'درشت' }, { k: 'شیرینی', v: 'طبیعی بدون قند افزوده' }],
  },
  {
    slug: 'dried-apricot', title: 'برگه زردآلو آفتابی', category: 'dried-fruit',
    basePriceKg: 820_000, discountPercent: 18, salesCount: 420, ratingAvg: 4.6, ratingCount: 92, isSuggested: true,
    shortDescription: 'برگه زردآلو بدون گوگرد، خشک‌شده زیر آفتاب',
    description: 'برگه زردآلوی نارنجی کهربایی بدون تیمار گوگرد؛ ترش و شیرین متعادل، عالی برای آجیل تابستانی و کمپوت.',
    attributes: [{ k: 'گوگرد', v: 'بدون گوگرد (بدون سولفیت)' }, { k: 'رنگ', v: 'طبیعی آفتابی' }],
  },
  {
    slug: 'mixed-nuts-luxury', title: 'آجیل مخلوط ممتاز پارس', category: 'mixed-nuts',
    basePriceKg: 1_890_000, discountPercent: 8, salesCount: 980, ratingAvg: 4.9, ratingCount: 241, isSuggested: true,
    shortDescription: 'ترکیب متوازن پسته، بادام، فندق، گردو و بادام هندی',
    description: 'فرمول اختصاصی پارس: پسته اکبری، بادام درخشانی، فندق، مغز گردو و بادام هندی — بوداده تازه در روز ارسال با نسبت متوازن برای پذیرایی مجلل.',
    attributes: [{ k: 'اجزا', v: '۵ قلم ممتاز' }, { k: 'بوداده', v: 'تازه در روز ارسال' }],
  },
  {
    slug: 'pumpkin-seed-kernel', title: 'مغز تخمه کدو سبز', category: 'seeds-kernels',
    basePriceKg: 980_000, salesCount: 310, ratingAvg: 4.4, ratingCount: 53,
    shortDescription: 'مغز تخمه کدوی سبز تیره — سرشار از منیزیم',
    description: 'مغز تخمه کدو سبز بدون پوسته، خام و آماده بوداده یا مصرف در سالاد و گرانولا. محصول برداشت پاییز امسال.',
    attributes: [{ k: 'پرداخت', v: 'خام بدون پوسته' }, { k: 'کاربرد', v: 'اسنک، سالاد، گرانولا' }],
  },
];

// واریانت‌های وزنی استاندارد — ضریب بسته‌بندی (تخفیف حجمی خودکار)
const WEIGHTS = [
  { g: 250, f: 0.28 },
  { g: 500, f: 0.52 },
  { g: 750, f: 0.77 },
  { g: 1000, f: 1.0 },
];

// ------------------------------------------------------------
// بنرها و استوری‌ها
// ------------------------------------------------------------
const BANNERS = [
  {
    title: 'جشنواره پسته ایرانی',
    subtitle: 'تا ۱۵٪ تخفیف انواع پسته درجه یک',
    imageUrl: '/images/banners/banner-pistachio.webp',
    linkView: 'category', linkParams: '{"slug":"pistachio"}', sortOrder: 1,
  },
  {
    title: 'آجیل ممتاز پارس',
    subtitle: 'ترکیب ویژه میهمانی با وزن دلخواه',
    imageUrl: '/images/banners/banner-mixed-nuts.webp',
    linkView: 'category', linkParams: '{"slug":"mixed-nuts"}', sortOrder: 2,
  },
];

const STORIES: Array<{
  groupKey: string; groupTitle: string; thumbUrl: string;
  mediaType: string; mediaUrl: string; caption: string;
  linkView?: string; linkParams?: string; sortOrder: number;
}> = [
  // گروه «از باغ تا بسته» — دو فریم
  { groupKey: 'farm', groupTitle: 'از باغ تا بسته', thumbUrl: '/images/products/pistachio-akbari.webp', mediaType: 'image', mediaUrl: '/images/products/pistachio-akbari.webp', caption: 'برداشت تازه از باغ‌های رفسنجان', sortOrder: 1 },
  { groupKey: 'farm', groupTitle: 'از باغ تا بسته', thumbUrl: '/images/products/pistachio-akbari.webp', mediaType: 'image', mediaUrl: '/images/products/almond-mamaei.webp', caption: 'دانه‌بندی و کنترل کیفیت هر محموله', sortOrder: 2 },
  // تخفیف ویژه
  { groupKey: 'offer', groupTitle: 'تخفیف ویژه', thumbUrl: '/images/products/mixed-nuts-luxury.webp', mediaType: 'image', mediaUrl: '/images/products/mixed-nuts-luxury.webp', caption: 'آجیل ممتاز پارس — پیشنهاد ویژه این هفته', linkView: 'category', linkParams: '{"slug":"mixed-nuts"}', sortOrder: 1 },
  // معرفی محصول
  { groupKey: 'pistachio', groupTitle: 'پسته اکبری', thumbUrl: '/images/products/pistachio-akbari.webp', mediaType: 'image', mediaUrl: '/images/products/pistachio-akbari.webp', caption: 'پسته اکبری درجه یک با وزن دلخواه', linkView: 'product', linkParams: '{"slug":"pistachio-akbari"}', sortOrder: 1 },
  // نکته آموزشی
  { groupKey: 'storage', groupTitle: 'نگهداری آجیل', thumbUrl: '/images/products/walnut-kernel.webp', mediaType: 'image', mediaUrl: '/images/products/walnut-kernel.webp', caption: 'آجیل را در ظرف دربسته، خشک و خنک نگه دارید', sortOrder: 1 },
  // محصول فصلی
  { groupKey: 'piarom', groupTitle: 'خرمای پیارم', thumbUrl: '/images/products/date-piarom.webp', mediaType: 'image', mediaUrl: '/images/products/date-piarom.webp', caption: 'پیارم حاجی‌آباد رسید — تا ۱۰٪ تخفیف', linkView: 'category', linkParams: '{"slug":"date"}', sortOrder: 1 },
];

// ------------------------------------------------------------
// محتوای مستقل فروشگاه (فاز ۳) — FAQ / تماس / نمادها / لینک‌های فوتر
// فقط وقتی جدول خالی است seed می‌شود (چرخه مدیریت مستقل — محتوای
// ویرایش‌شدهٔ مدیر با اجرای مجدد seed از بین نمی‌رود)
// ------------------------------------------------------------
const FAQ_ITEMS = [
  {
    question: 'هزینه و زمان ارسال چقدر است؟',
    answer:
      'سفارش‌های بالای سقف ارسال رایگان، پست پیشتاز رایگان دارند. سایر سفارش‌ها بر اساس روش ارسال انتخابی در تسویه حساب محاسبه می‌شود؛ سفارش‌های ثبت‌شده تا ساعت ۱۴ همان روز کاری به پست تحویل می‌شوند.',
    sortOrder: 1,
  },
  {
    question: 'محصولات چقدر تازه هستند؟',
    answer:
      'همه مغزها و خشکبارها تازه بو داده و در همان روز با بسته‌بندی پنج‌لایه محافظ ارسال می‌شوند؛ هر محموله پیش از ارسال کنترل کیفی می‌شود.',
    sortOrder: 2,
  },
  {
    question: 'اگر محصول راضی‌کننده نبود چه؟',
    answer:
      'تا ۷ روز پس از تحویل، در صورت مغایرت یا مشکل کیفی، مبلغ سفارش به‌طور کامل بازگردانده می‌شود. کافی است از طریق شماره‌های تماس با پشتیبانی در ارتباط باشید.',
    sortOrder: 3,
  },
  {
    question: 'پرداخت در محل دارید؟',
    answer:
      'بله، پرداخت در محل برای سراسر ایران فعال است. همچنین می‌توانید با کارت بانکی از درگاه امن پرداخت آنلاین استفاده کنید.',
    sortOrder: 4,
  },
];

const CONTACT_NUMBERS = [
  { label: 'پشتیبانی', phone: '021-91000000', sortOrder: 1 },
  { label: 'سفارش تلفنی', phone: '021-91008080', sortOrder: 2 },
];

const TRUST_BADGES = [
  // نمادها بدون تصویر آپلودی نمایش داده نمی‌شوند — مدیر لوگوی واقعی را از پنل آپلود می‌کند
  {
    title: 'اینماد اعتماد الکترونیکی',
    imageUrl: '',
    linkUrl: 'https://trustseal.enamad.ir/',
    sortOrder: 1,
    isActive: false,
  },
  {
    title: 'نشان ساماندهی رسانه‌های دیجیتال',
    imageUrl: '',
    linkUrl: 'https://samandehi.ir/',
    sortOrder: 2,
    isActive: false,
  },
];

const FOOTER_LINKS = [
  { title: 'پرسش‌های متداول', url: '/faq', sortOrder: 1 },
  { title: 'دربارهٔ پارس', url: '/about', sortOrder: 2 },
  { title: 'رهگیری سفارش', url: 'https://tracking.post.ir/', sortOrder: 3 },
];

async function seedContent() {
  // پرسش‌های متداول
  if ((await db.faqItem.count()) === 0) {
    for (const f of FAQ_ITEMS) await db.faqItem.create({ data: f });
    console.log(`✓ پرسش‌های متداول: ${FAQ_ITEMS.length}`);
  } else {
    console.log('• پرسش‌های متداول از قبل دارد — دست نمی‌خورد');
  }

  // شماره‌های تماس
  if ((await db.contactNumber.count()) === 0) {
    for (const c of CONTACT_NUMBERS)
      await db.contactNumber.create({ data: { ...c, isActive: true } });
    console.log(`✓ شماره‌های تماس: ${CONTACT_NUMBERS.length}`);
  } else {
    console.log('• شماره‌های تماس از قبل دارد — دست نمی‌خورد');
  }

  // نمادهای اعتماد (غیرفعال تا لوگوی واقعی آپلود شود)
  if ((await db.trustBadge.count()) === 0) {
    for (const b of TRUST_BADGES) await db.trustBadge.create({ data: b });
    console.log(`✓ نمادهای اعتماد: ${TRUST_BADGES.length} (غیرفعال تا آپلود لوگو)`);
  } else {
    console.log('• نمادهای اعتماد از قبل دارد — دست نمی‌خورد');
  }

  // لینک‌های فوتر
  if ((await db.footerLink.count()) === 0) {
    for (const l of FOOTER_LINKS)
      await db.footerLink.create({ data: { ...l, isActive: true } });
    console.log(`✓ لینک‌های فوتر: ${FOOTER_LINKS.length}`);
  } else {
    console.log('• لینک‌های فوتر از قبل دارد — دست نمی‌خورد');
  }
}

async function main() {
  console.log('— Seed پارس شروع شد —');

  // ۱) تنظیمات
  for (const s of SETTINGS) {
    await db.setting.upsert({ where: { key: s.key }, create: s, update: { value: s.value } });
  }
  console.log(`✓ تنظیمات: ${SETTINGS.length}`);

  // ۲) دسته‌بندی‌ها
  const catMap = new Map<string, string>(); // slug → id
  for (const [i, c] of CATEGORIES.entries()) {
    const cat = await db.category.upsert({
      where: { slug: c.slug },
      create: { ...c, sortOrder: i, isActive: true },
      update: { title: c.title, imageUrl: c.imageUrl, description: c.description, sortOrder: i },
    });
    catMap.set(c.slug, cat.id);
  }
  console.log(`✓ دسته‌بندی‌ها: ${CATEGORIES.length}`);

  // ۳) محصولات + واریانت + تصویر
  let variantCount = 0;
  for (const p of PRODUCTS) {
    const categoryId = catMap.get(p.category);
    if (!categoryId) throw new Error(`category not found: ${p.category}`);

    const ratingCount = p.ratingCount;
    const ratingSum = Math.round(p.ratingAvg * ratingCount);

    const product = await db.product.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        categoryId,
        shortDescription: p.shortDescription,
        description: p.description,
        attributes: p.attributes ? JSON.stringify(p.attributes) : null,
        searchText: buildSearchText(p, CATEGORIES.find((c) => c.slug === p.category)!.title),
        salesCount: p.salesCount,
        ratingCount,
        ratingSum,
        isSuggested: p.isSuggested ?? false,
        isActive: true,
      },
      update: {
        title: p.title,
        shortDescription: p.shortDescription,
        description: p.description,
        searchText: buildSearchText(p, CATEGORIES.find((c) => c.slug === p.category)!.title),
        salesCount: p.salesCount,
        ratingCount,
        ratingSum,
        isSuggested: p.isSuggested ?? false,
      },
    });

    // تصویر محصول (اگر ندارد)
    const imgCount = await db.productImage.count({ where: { productId: product.id } });
    if (imgCount === 0) {
      await db.productImage.create({
        data: {
          productId: product.id,
          url: `/images/products/${p.slug}.webp`,
          alt: p.title,
          sortOrder: 0,
        },
      });
      // اسلایدهای اضافه گالری (در صورت تعریف در Seed)
      for (let i = 0; i < (p.extraImages?.length ?? 0); i++) {
        const extra = p.extraImages![i];
        await db.productImage.create({
          data: { productId: product.id, url: extra.url, alt: extra.alt, sortOrder: i + 1 },
        });
      }
    }

    // واریانت‌های وزنی
    for (const w of WEIGHTS) {
      const price = roundK(p.basePriceKg * w.f);
      const compareAt =
        p.discountPercent && p.discountPercent > 0
          ? roundK(price * (1 + p.discountPercent / 100))
          : null;

      const stock =
        p.lowStock?.includes(w.g) ? 3 : 12 + ((p.salesCount + w.g) % 40);

      await db.productVariant.upsert({
        where: { productId_weightGrams_isWholesale: { productId: product.id, weightGrams: w.g, isWholesale: false } },
        create: {
          productId: product.id,
          weightGrams: w.g,
          priceToman: price,
          compareAtPriceToman: compareAt,
          sku: `PARS-${p.slug.toUpperCase().replace(/-/g, '')}-${w.g}`,
          stock,
          isActive: true,
        },
        update: { priceToman: price, compareAtPriceToman: compareAt, isActive: true },
      });
      variantCount++;
    }
  }
  console.log(`✓ محصولات: ${PRODUCTS.length} | واریانت‌ها: ${variantCount}`);

  // ۴) بنرها (Reset امن محتوا — خروجی seed همیشه یکسان)
  await db.banner.deleteMany();
  for (const b of BANNERS) await db.banner.create({ data: b });
  console.log(`✓ بنرها: ${BANNERS.length}`);

  // ۵) استوری‌ها
  await db.story.deleteMany();
  for (const s of STORIES) await db.story.create({ data: s });
  console.log(`✓ استوری‌ها: ${STORIES.length} (در ${new Set(STORIES.map((s) => s.groupKey)).size} گروه)`);

  // ۶) کاربر مدیر + کاربر آزمایشی
  // توجه: ورود در فاز ۹ با OTP است؛ در sandbox کد OTP در لاگ سرور چاپ می‌شود.
  // نام کاربر آزمایشی هر اجرا رندوم انتخاب می‌شود (درخواست مدیر)؛ مدیر ثابت می‌ماند.
  const usedNames = new Set<string>();
  const admin = await db.user.upsert({
    where: { phone: '09120000000' },
    create: { phone: '09120000000', fullName: 'مدیر فروشگاه پارس', role: 'ADMIN', isActive: true },
    update: { role: 'ADMIN' },
  });
  const demoName = randomPersonName(usedNames);
  const demo = await db.user.upsert({
    where: { phone: '09121234567' },
    create: { phone: '09121234567', ...demoName, role: 'USER', isActive: true },
    update: { ...demoName },
  });
  for (const u of [admin, demo]) {
    await db.notificationPreference.upsert({
      where: { userId: u.id },
      create: { userId: u.id },
      update: {},
    });
  }
  console.log(`✓ کاربران: مدیر (09120000000) + آزمایشی (09121234567) با نام «${demoName.fullName}»`);

  // ۷) نظرات تأییدشده محصولات (فاز ۷ — صفحه جزئیات)
  // Idempotent: اگر محصول نظر دارد، دست نمی‌خورد.
  // خریداران نمونه — نام رندوم ایرانی (درخواست مدیر)؛ شماره هرگز نمایش داده نمی‌شود
  const buyers: Array<{ id: string }> = [];
  for (let i = 0; i < 5; i++) {
    const phone = `0913100000${i}`;
    const name = randomPersonName(usedNames);
    const u = await db.user.upsert({
      where: { phone },
      create: { phone, ...name, role: 'USER', isActive: true },
      update: { ...name },
    });
    buyers.push({ id: u.id });
  }
  console.log(`✓ خریداران نمونه: ۵ حساب با نام‌های رندوم (${[...usedNames].slice(1).join('، ')})`);
  buyers.push({ id: demo.id });

  const REVIEW_COMMENTS: Record<number, string[]> = {
    5: [
      'کیفیت فوق‌العاده، تازه و خوش‌عطر بود. بسته‌بندی هم خیلی مرتب و اصولی بود.',
      'دومین باره خرید می‌کنم و باز هم راضی بودم. وزن دقیق و قیمت منصفانه.',
      'ارسال سریع و محصول دقیقاً همون چیزی بود که در توضیحات نوشته شده. پیشنهاد می‌کنم.',
    ],
    4: [
      'کیفیت خوب بود ولی کاش بسته‌بندی کمی مقاوم‌تر می‌بود. در کل راضی هستم.',
      'طعم و تازگی خوب، فقط ارسال یک روز دیرتر از موعد شد.',
      'نسبت به قیمتش عالیه. برای مصرف روزانه خیلی مناسب بود.',
    ],
    3: [
      'متوسط بود؛ انتظار بیشتری داشتم ولی قابل قبول است.',
      'محصول خوبی بود اما چند دانه ناخالصی داشت.',
    ],
  };

  let reviewCount = 0;
  for (const p of PRODUCTS) {
    const product = await db.product.findUnique({ where: { slug: p.slug }, select: { id: true } });
    if (!product) continue;
    const existing = await db.review.count({ where: { productId: product.id } });
    if (existing > 0) continue;

    // ۳ نظر واقع‌گرایانه حول میانگین امتیاز محصول
    const perProduct = 3;
    for (let i = 0; i < perProduct; i++) {
      // امتیاز نظر حول ratingAvg نوسان می‌کند ولی در بازه ۳ تا ۵ می‌ماند
      const noise = [0, -1, 1][i % 3];
      const rating = Math.min(5, Math.max(3, Math.round(p.ratingAvg + noise)));
      const comments = REVIEW_COMMENTS[rating] ?? REVIEW_COMMENTS[4];
      const buyer = buyers[(i + p.salesCount) % buyers.length]!;
      await db.review.create({
        data: {
          productId: product.id,
          userId: buyer.id,
          rating,
          comment: comments[i % comments.length]!,
          isApproved: true,
          createdAt: new Date(Date.now() - (i + 1) * 6 * 24 * 3600 * 1000), // فاصله چند روزه
        },
      });
      reviewCount++;
    }
  }
  console.log(`✓ نظرات: ${reviewCount}`);

  // ۸) محتوای مستقل فروشگاه (فاز ۳)
  await seedContent();

  // ۹) سفارش‌های نمایشی — پخش‌شده در ~۱۲۰ روز اخیر (درخواست کاربر)
  // داشبورد (گزارش فروش روزانه/ماهانه) و دکمه «بررسی وضعیت بسته پست» به
  // سفارش‌هایی با وضعیت SHIPPED/DELIVERED و کد رهگیری نیاز دارند.
  // Idempotent: upsert روی کد یکتا — اجرای مجدد همان سفارش‌ها را تازه می‌کند.
  // موجودی واریانت‌ها دست نمی‌خورد؛ salesCount فقط در ساخت اول افزایش می‌یابد.
  const rnd = mulberry32(20261109);
  const variantRows = await db.productVariant.findMany({
    where: { isActive: true },
    select: {
      id: true,
      weightGrams: true,
      priceToman: true,
      compareAtPriceToman: true,
      product: { select: { id: true, title: true } },
    },
  });
  const orderUsers = await db.user.findMany({
    where: { id: { in: buyers.map((b) => b.id) }, isActive: true },
    select: { id: true, fullName: true, phone: true },
  });
  // مشتریان بیشتر از حساب‌های شناخته‌شده — تا آمار «خریدار / خرید تکراری» معنادار شود
  const extraUsers = await db.user.findMany({
    where: { role: 'USER', isActive: true, id: { notIn: buyers.map((b) => b.id) } },
    select: { id: true, fullName: true, phone: true },
    take: 40,
  });
  const customerPool = [...orderUsers, ...extraUsers];

  const SHIPPING_DEMO = [
    { name: 'پست پیشتاز', eta: '۲ تا ۴ روز کاری', fee: 49_000 },
    { name: 'پست سفارشی', eta: '۳ تا ۷ روز کاری', fee: 39_000 },
  ] as const;
  const DEMO_CITIES = [
    ['تهران', 'تهران'],
    ['اصفهان', 'اصفهان'],
    ['خراسان رضوی', 'مشهد'],
    ['فارس', 'شیراز'],
    ['آذربایجان شرقی', 'تبریز'],
    ['کرمان', 'کرمان'],
    ['گیلان', 'رشت'],
    ['البرز', 'کرج'],
  ] as const;
  const STREETS = [
    'خیابان ولیعصر', 'خیابان انقلاب', 'بلوار فردوسی', 'خیابان شریعتی', 'بلوار کشاورز',
  ] as const;
  const LANES = ['کوچه یاس', 'کوچه گلستان', 'بن‌بست بهار', 'خیابان ناصر خسرو'] as const;

  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;

  /** وضعیت بر اساس سن سفارش — سفارش‌های قدیمی‌تر عمدتاً تحویل‌شده */
  const statusForAge = (ageDays: number): string => {
    const r = rnd();
    if (ageDays > 60) {
      if (r < 0.72) return 'DELIVERED';
      if (r < 0.82) return 'SHIPPED';
      if (r < 0.9) return 'PROCESSING';
      if (r < 0.95) return 'PAID';
      return 'CANCELED';
    }
    if (ageDays > 15) {
      if (r < 0.42) return 'DELIVERED';
      if (r < 0.67) return 'SHIPPED';
      if (r < 0.82) return 'PROCESSING';
      if (r < 0.95) return 'PAID';
      return 'CANCELED';
    }
    if (r < 0.3) return 'SHIPPED';
    if (r < 0.5) return 'PROCESSING';
    if (r < 0.85) return 'PAID';
    return 'PENDING_PAYMENT';
  };

  const ORDER_DEMO_COUNT = 72;
  let createdOrders = 0;
  let skippedOrders = 0;
  let trackedOrders = 0;

  for (let i = 0; i < ORDER_DEMO_COUNT; i++) {
    // ۴ سفارش اول در ۴۸ ساعت اخیر — «فروش امروز/هفته» همیشه داده داشته باشد
    const ageDays = i < 4 ? rnd() * 1.8 : Math.floor(rnd() * 118) + rnd();
    const createdAt = new Date(
      Date.now() - ageDays * 24 * 3600 * 1000 - Math.floor(rnd() * 20) * 3600 * 1000
    );
    const status = statusForAge(ageDays);

    const user = pick(customerPool);
    const shipping = pick(SHIPPING_DEMO);
    const [province, city] = pick(DEMO_CITIES);

    // اقلام — ۱ تا ۳ واریانت متمایز با Snapshot قیمت
    const itemCount = rnd() < 0.55 ? 1 : rnd() < 0.75 ? 2 : 3;
    const chosenVariants = new Set<string>();
    const items: Array<{
      productId: string;
      variantId: string;
      productTitle: string;
      weightGrams: number;
      unitPriceToman: number;
      compareAtPriceToman: number | null;
      quantity: number;
      lineTotalToman: number;
    }> = [];
    while (items.length < itemCount) {
      const v = pick(variantRows);
      if (chosenVariants.has(v.id)) continue;
      chosenVariants.add(v.id);
      const qty = rnd() < 0.6 ? 1 : rnd() < 0.85 ? 2 : 3;
      items.push({
        productId: v.product.id,
        variantId: v.id,
        productTitle: v.product.title,
        weightGrams: v.weightGrams,
        unitPriceToman: v.priceToman,
        compareAtPriceToman: v.compareAtPriceToman,
        quantity: qty,
        lineTotalToman: v.priceToman * qty,
      });
    }
    const subtotalToman = items.reduce((s, it) => s + it.lineTotalToman, 0);
    // سقف ارسال رایگان همان تنظیمات فروشگاه: ۱٬۵۰۰٬۰۰۰ تومان
    const deliveryToman = subtotalToman >= 1_500_000 ? 0 : shipping.fee;
    const totalToman = subtotalToman + deliveryToman;

    // پرداخت — همسو با ماشین وضعیت واقعی (SANDBOX / پرداخت در محل)
    const isOnline = rnd() < 0.75;
    let paymentStatus = 'UNPAID';
    let paidAt: Date | null = null;
    let paymentRef: string | null = null;
    if (status !== 'PENDING_PAYMENT' && status !== 'CANCELED') {
      paymentStatus = 'PAID';
      paidAt = new Date(createdAt.getTime() + 7 * 60 * 1000);
      if (isOnline) paymentRef = `SANDBOX-${codeSuffix(i)}${codeSuffix(i + 37)}`;
    } else if (status === 'CANCELED' && isOnline) {
      paymentStatus = 'REFUNDED';
      paidAt = createdAt;
      paymentRef = `SANDBOX-${codeSuffix(i)}${codeSuffix(i + 37)}`;
    }
    const paymentMethod = isOnline && status !== 'PENDING_PAYMENT' ? 'ONLINE_GATEWAY' : 'COD';

    // کد رهگیری پست — SHIPPED همیشه؛ DELIVERED اغلب (دکمه رهگیری سایت پست)
    const needsTracking = status === 'SHIPPED' || (status === 'DELIVERED' && rnd() < 0.9);
    const trackingCode = needsTracking ? `24${randomDigits(rnd, 22)}` : null;
    if (trackingCode) trackedOrders++;

    const address = {
      receiverName: user.fullName ?? 'مشتری پارس',
      receiverPhone: user.phone,
      province,
      city,
      postalCode: `${Math.floor(rnd() * 9) + 1}${randomDigits(rnd, 9)}`,
      fullAddress: `${pick(STREETS)}، ${pick(LANES)}، پلاک ${Math.floor(rnd() * 90) + 5}، واحد ${Math.floor(rnd() * 9) + 1}`,
    };

    const code = `PARS-${jalaliOrderDate(createdAt)}-${codeSuffix(i)}`;
    const itemData = items.map((it) => ({ ...it }));
    const baseData = {
      status,
      subtotalToman,
      deliveryToman,
      totalToman,
      addressSnapshot: JSON.stringify(address),
      shippingMethodName: shipping.name,
      shippingMethodEta: shipping.eta,
      paymentMethod,
      paymentStatus,
      paidAt,
      paymentRef,
      trackingCode,
      createdAt,
    };

    const existing = await db.order.findUnique({ where: { code }, select: { id: true } });
    if (existing) {
      // سفارش موجود دست نمی‌خورد — پخش‌کنندهٔ زمان (scripts/seed-demo-orders.ts)
      // ممکن است تاریخ/وضعیت آن را به‌صورت قطعی بازچینی کرده باشد؛ بازنویسی ما آن را خراب می‌کرد.
      skippedOrders++;
    } else {
      await db.order.create({
        data: {
          code,
          userId: user.id,
          discountToman: 0,
          ...baseData,
          items: { create: itemData },
        },
      });
      createdOrders++;
      // salesCount — فقط در ساخت اول (اجراهای بعدی دوباره جمع نمی‌شود)
      for (const it of items) {
        await db.product.update({
          where: { id: it.productId },
          data: { salesCount: { increment: it.quantity } },
        });
      }
    }
  }
  console.log(
    `✓ سفارش‌های نمایشی: ${createdOrders} جدید + ${skippedOrders} موجود (دست‌نخورده) ` +
      `(${trackedOrders} با کد رهگیری پست — پخش در ~۱۲۰ روز)`
  );

  console.log('— Seed کامل شد —');
}

main()
  .catch((e) => {
    console.error('SEED FAILED:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
