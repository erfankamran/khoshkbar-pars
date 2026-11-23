/**
 * پارس — بازنشانی کامل دیتای فروش و کاربران (درخواست کاربر)
 *
 * «کل دیتای فروش و کاربران پاک شود و دیتای جدید با پراکندگی مناسب
 *  و نام مشخص برای هر کاربر ساخته شود»
 *
 * کاری که می‌کند:
 *  ۱) پاک‌سازی کامل سفارش‌ها، اقلام، نظرات، علاقه‌مندی‌ها، سبد خرید و
 *     خودِ کاربران مشتری — فقط حساب مدیر (ADMIN) دست‌نخورده می‌ماند تا
 *     نشست ورود پنل مدیریت قطع نشود.
 *  ۲) ساخت مشتریان با «نام مشخص و یکتا» برای هر کاربر (نام + نام‌خانوادگی
 *     فارسی واقعی)، شماره موبایل واقع‌گرایانه، آواتار و آدرس در یکی از
 *     ۳۱ استان با پراکندگی وزنی مطابق جمعیت استان‌ها.
 *  ۳) ساخت فاکتورهای فروش جدید — پخش‌شده در ~۱۱ ماه اخیر با ملایمت فصلی
 *     (شب یلدا و نوروز)، سبد متنوع (۱ تا ۴ قلم)، مبالغ پراکنده، وضعیت
 *     هماهنگ با سن سفارش و snapshot آدرس (۸۵٪ هم‌استان مشتری، ۱۵٪ استان
 *     دیگر) تا نقشهٔ وکتوری ایران به تفکیک استان کاملاً روشن شود.
 *  ۴) بازسازی نظرات تأییدشده از مشتریان جدید + salesCount محصول‌ها روی
 *     مقدار پایهٔ سید + فروش واقعی همین دیتای جدید.
 *
 * قطعی (deterministic) — هر اجرا خروجی یکسان می‌سازد.
 * اجرا: bun scripts/reseed-sales-users.ts
 */
import { PrismaClient } from '@prisma/client';
import { jalaliOrderDate } from '../src/lib/jalali';

const db = new PrismaClient();

// ——— PRNG قطعی (Mulberry32) ———
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// seed اجرای فعلی — هر بازنشانی جدید با seed تازه، دیتای کاملاً متفاوت می‌سازد
const rnd = mulberry32(20261109);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const digits = (n: number): string => {
  let out = '';
  for (let i = 0; i < n; i++) out += String(Math.floor(rnd() * 10));
  return out;
};

/** پسوند کد سفارش — هماهنگ با order.service */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function codeSuffix(n: number): string {
  let s = '';
  let x = n;
  for (let k = 0; k < 4; k++) {
    s = CODE_ALPHABET[x % CODE_ALPHABET.length]! + s;
    x = Math.floor(x / CODE_ALPHABET.length);
  }
  return s;
}

// ------------------------------------------------------------
// نام‌های مشخص — هر کاربر یک نام کامل یکتا (درخواست کاربر)
// ------------------------------------------------------------
const FIRST = [
  // زنانه
  'مریم', 'زهرا', 'فاطمه', 'سارا', 'نرگس', 'شیرین', 'پریسا', 'الهام', 'مینا', 'سمانه',
  'لیلا', 'نازنین', 'شیوا', 'سارینا', 'آیدا', 'رها', 'ترانه', 'غزاله', 'نیلوفر', 'نگار',
  'الهه', 'درسا', 'پارمیس', 'رویا', 'مهسا', 'سپیده', 'پرستو', 'ژاله', 'ویدا', 'ماهور',
  // مردانه
  'علی', 'محمد', 'حسین', 'رضا', 'امیر', 'مهدی', 'سعید', 'کاوه', 'آرش', 'بابک',
  'نیما', 'یاسر', 'فرزاد', 'بهنام', 'کامران', 'سهیل', 'پویا', 'فرهاد', 'سامان', 'اردلان',
  'بهروز', 'شهاب', 'مانی', 'آرمان', 'سینا', 'مسعود', 'وحید', 'حامد', 'میلاد', 'احسان',
];
const LATIN_FIRST = [
  'maryam', 'zahra', 'fatemeh', 'sara', 'narges', 'shirin', 'parisa', 'elham', 'mina', 'samaneh',
  'leila', 'nazanin', 'shiva', 'sarina', 'aida', 'raha', 'taraneh', 'ghazaleh', 'niloofar', 'negar',
  'elaheh', 'dorsa', 'parmis', 'roya', 'mahsa', 'sepideh', 'parastoo', 'zhaleh', 'vida', 'mahour',
  'ali', 'mohammad', 'hossein', 'reza', 'amir', 'mehdi', 'saeed', 'kaveh', 'arash', 'babak',
  'nima', 'yaser', 'farzad', 'behnam', 'kamran', 'soheil', 'pouya', 'farhad', 'saman', 'ardelan',
  'behrouz', 'shahab', 'mani', 'arman', 'sina', 'masoud', 'vahid', 'hamed', 'milad', 'ehsan',
];
const LAST = [
  'احمدی', 'رضایی', 'کریمی', 'محمدی', 'موسوی', 'حسینی', 'صادقی', 'نجفی', 'قاسمی', 'مهدوی',
  'طاهری', 'شریفی', 'یمینی', 'عباسی', 'زمانی', 'فرهادی', 'بهرامی', 'اسدی', 'کاظمی', 'رستمی',
  'نیک‌نام', 'سلطانی', 'امینی', 'پارسا', 'دهقان', 'افشار', 'اکبری', 'جهانی', 'غفاری', 'وحیدی',
  'خسروی', 'نوری', 'ملکی', 'قنبری', 'بیات', 'طهماسبی', 'پناهی', 'رحیمی', 'صالحی', 'فتاحی',
  'صفری', 'تهرانی', 'اصفهانی', 'شیرازی', 'تبریزی', 'مشهدی', 'یزدی', 'اراکی', 'همدانی', 'گیلانی',
  'مازندرانی', 'دلاور', 'ایمانی', 'برزگر', 'ستوده', 'معینی', 'حیدری', 'رئیسی', 'مفیدی', 'روستا',
];
const usedNames = new Set<string>(['مدیر فروشگاه پارس', 'سارا محمدی']);
function nextName(i: number): { firstName: string; lastName: string; fullName: string } {
  const firstName = FIRST[i % FIRST.length]!;
  let lastName = LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]!;
  while (usedNames.has(`${firstName} ${lastName}`)) {
    lastName = LAST[(LAST.indexOf(lastName) + 1) % LAST.length]!;
  }
  usedNames.add(`${firstName} ${lastName}`);
  return { firstName, lastName, fullName: `${firstName} ${lastName}` };
}

// ------------------------------------------------------------
// پراکندگی جغرافیایی — هر ۳۱ استان نقشهٔ وکتوری، وزن مطابق جمعیت
// (نام استان دقیقاً مطابق fa در components/admin/iran-provinces.ts)
// ------------------------------------------------------------
const PROVINCES: Array<{ fa: string; w: number; cities: string[] }> = [
  { fa: 'تهران', w: 24, cities: ['تهران', 'شهریار', 'ورامین', 'اسلامشهر', 'قدس'] },
  { fa: 'اصفهان', w: 10, cities: ['اصفهان', 'کاشان', 'نجف‌آباد', 'خمینی‌شهر', 'مبارکه'] },
  { fa: 'خراسان رضوی', w: 9, cities: ['مشهد', 'نیشابور', 'سبزوار', 'تربت حیدریه', 'قوچان'] },
  { fa: 'فارس', w: 8, cities: ['شیراز', 'مرودشت', 'جهرم', 'کازرون', 'لار'] },
  { fa: 'آذربایجان شرقی', w: 7, cities: ['تبریز', 'مراغه', 'مرند', 'اهر', 'میانه'] },
  { fa: 'البرز', w: 7, cities: ['کرج', 'هشتگرد', 'نظرآباد', 'ماهدشت'] },
  { fa: 'خوزستان', w: 6, cities: ['اهواز', 'آبادان', 'دزفول', 'ماهشهر', 'بهبهان'] },
  { fa: 'مازندران', w: 6, cities: ['ساری', 'بابل', 'آمل', 'قائم‌شهر', 'نور'] },
  { fa: 'گیلان', w: 6, cities: ['رشت', 'بندر انزلی', 'لاهیجان', 'لنگرود', 'فومن'] },
  { fa: 'کرمان', w: 5, cities: ['کرمان', 'رفسنجان', 'سیرجان', 'جیرفت', 'بم'] },
  { fa: 'قم', w: 4, cities: ['قم'] },
  { fa: 'کرمانشاه', w: 4, cities: ['کرمانشاه', 'اسلام‌آباد غرب', 'سنقر', 'هرسین'] },
  { fa: 'آذربایجان غربی', w: 4, cities: ['ارومیه', 'خوی', 'مهاباد', 'بوکان'] },
  { fa: 'یزد', w: 4, cities: ['یزد', 'میبد', 'اردکان', 'مهریز'] },
  { fa: 'هرمزگان', w: 3, cities: ['بندرعباس', 'میناب', 'حاجی‌آباد', 'قشم'] },
  { fa: 'گلستان', w: 3, cities: ['گرگان', 'گنبد کاووس', 'علی‌آباد کتول', 'آق‌قلا'] },
  { fa: 'لرستان', w: 3, cities: ['خرم‌آباد', 'بروجرد', 'دورود', 'الیگودرز'] },
  { fa: 'همدان', w: 3, cities: ['همدان', 'ملایر', 'تویسرکان', 'نهاوند'] },
  { fa: 'سیستان و بلوچستان', w: 3, cities: ['زاهدان', 'زابل', 'چابهار', 'ایرانشهر'] },
  { fa: 'قزوین', w: 3, cities: ['قزوین', 'تاکستان', 'آبیک'] },
  { fa: 'مرکزی', w: 3, cities: ['اراک', 'ساوه', 'خمین', 'محلات'] },
  { fa: 'اردبیل', w: 3, cities: ['اردبیل', 'پارس‌آباد', 'مشگین‌شهر'] },
  { fa: 'سمنان', w: 2, cities: ['سمنان', 'شاهرود', 'دامغان', 'گرمسار'] },
  { fa: 'زنجان', w: 2, cities: ['زنجان', 'آبهر', 'خرمدره'] },
  { fa: 'بوشهر', w: 2, cities: ['بوشهر', 'برازجان', 'گناوه', 'دیلم'] },
  { fa: 'کردستان', w: 2, cities: ['سنندج', 'سقز', 'مریوان', 'کامیاران'] },
  { fa: 'خراسان جنوبی', w: 2, cities: ['بیرجند', 'قائن', 'فردوس'] },
  { fa: 'خراسان شمالی', w: 2, cities: ['بجنورد', 'شیروان', 'اسفراین'] },
  { fa: 'چهارمحال و بختیاری', w: 2, cities: ['شهرکرد', 'بروجن', 'فارسان'] },
  { fa: 'کهگیلویه و بویراحمد', w: 2, cities: ['یاسوج', 'دهدشت', 'گچساران'] },
  { fa: 'ایلام', w: 1, cities: ['ایلام', 'دهلران', 'آبدانان'] },
];
/** فهرست تکرارشده بر اساس وزن — تخصیص استان به کاربر با پراکندگی قطعی */
const PROVINCE_POOL: string[] = PROVINCES.flatMap((p) => Array<string>(p.w).fill(p.fa));
const PROV_BY_FA = new Map(PROVINCES.map((p) => [p.fa, p]));

const STREETS = [
  'خیابان ولیعصر', 'خیابان انقلاب', 'بلوار فردوسی', 'خیابان شریعتی', 'بلوار امام خمینی',
  'خیابان سعدی', 'خیابان پاسداران', 'بلوار آزادی', 'خیابان مطهری', 'خیابان ۱۷ شهریور',
  'بلوار معلم', 'خیابان دانش',
] as const;
const LANES = ['کوچه یاس', 'کوچه گلستان', 'کوچه مهر', 'بن‌بست بهار', 'کوچه لاله', 'کوچه نیلوفر'] as const;

const AVATARS = [
  '/avatars/almond.webp', '/avatars/pistachio.webp', '/avatars/mulberry.webp', '/avatars/raisin.webp',
  '/avatars/walnut.webp', '/avatars/hazelnut.webp', '/avatars/cashew.webp', '/avatars/peanut.webp',
] as const;

const PHONE_PREFIX = [
  '0912', '0913', '0914', '0915', '0916', '0917', '0918', '0919',
  '0930', '0933', '0935', '0936', '0937', '0938', '0939', '0990', '0991', '0992', '0994', '0921',
] as const;

// ——— salesCount پایهٔ محصول‌ها (مطابق prisma/seed.ts) + فروش واقعی جدید ———
const BASE_SALES: Record<string, number> = {
  'pistachio-akbari': 1240, 'pistachio-ahmadaghaei': 870, 'pistachio-kalehghouchi': 720,
  'almond-mamaei': 540, 'almond-kernel': 430, 'walnut-toyserkan': 640, 'walnut-kernel': 510,
  'hazelnut-ardabil': 390, 'hazelnut-kernel': 350, 'raisin-green': 610, 'raisin-golden': 480,
  'date-mazafati': 760, 'date-piarom': 460, 'dried-fig': 340, 'dried-mulberry': 280,
  'dried-apricot': 420, 'mixed-nuts-luxury': 980, 'pumpkin-seed-kernel': 310,
};

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
const ADMIN_REPLIES = [
  'ممنون از اعتماد شما؛ خرید بعدی با کد تخفیف اختصاصی پارس منتظرتان است.',
  'سلام و احترام؛ رضایت شما انرژی تیم پارس است. پذیرای شما هستیم.',
  'از بازخورد شما سپاسگزاریم؛ کیفیت را همیشه بهتر می‌کنیم.',
] as const;
const CUSTOMER_NOTES = [
  'لطفاً بسته‌بندی هدیه انجام شود.',
  'قبل از ارسال تماس بگیرید.',
  'در ساعات اداری تحویل گرفته شود.',
  'اگر ممکن است دانه‌های درشت باشد.',
] as const;

const SHIPPING = [
  { name: 'پست پیشتاز', eta: '۲ تا ۴ روز کاری', fee: 49_000 },
  { name: 'پست سفارشی', eta: '۳ تا ۷ روز کاری', fee: 39_000 },
  { name: 'تیپاکس', eta: '۱ تا ۲ روز کاری', fee: 89_000 },
] as const;

/** وزن فصلی فروش — شب یلدا (آذر/دسامبر) و نوروز (اسفند/مارس) شلوغ‌تر */
function seasonWeight(d: Date): number {
  const m = d.getMonth(); // 0=Jan
  if (m === 11 || m === 2) return 1.5;
  if (m === 10 || m === 0 || m === 3) return 1.25;
  if (m === 6 || m === 7) return 0.85;
  return 1.0;
}

/** وضعیت بر اساس سن سفارش — قدیمی‌ها تحویل‌شده، جدیدها در جریان کار */
function statusForAge(ageDays: number): string {
  const r = rnd();
  if (ageDays > 60) {
    if (r < 0.76) return 'DELIVERED';
    if (r < 0.84) return 'SHIPPED';
    if (r < 0.9) return 'PROCESSING';
    if (r < 0.94) return 'PAID';
    return 'CANCELED';
  }
  if (ageDays > 15) {
    if (r < 0.52) return 'DELIVERED';
    if (r < 0.74) return 'SHIPPED';
    if (r < 0.84) return 'PROCESSING';
    if (r < 0.92) return 'PAID';
    return 'CANCELED';
  }
  if (ageDays > 3) {
    if (r < 0.3) return 'SHIPPED';
    if (r < 0.55) return 'PROCESSING';
    if (r < 0.77) return 'PAID';
    if (r < 0.9) return 'DELIVERED';
    return 'CANCELED';
  }
  if (r < 0.38) return 'PAID';
  if (r < 0.68) return 'PENDING_PAYMENT';
  if (r < 0.9) return 'PROCESSING';
  return 'SHIPPED';
}

async function main() {
  console.log('— بازنشانی دیتای فروش و کاربران پارس شروع شد —');

  // ============================================================
  // ۱) پاک‌سازی کامل — همهٔ دیتای فروش و کاربران (مدیر دست‌نخورده)
  // ============================================================
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, phone: true } });
  if (!admin) throw new Error('حساب مدیر یافت نشد — برای حفظ نشست پنل، حذف انجام نمی‌شود.');

  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.review.deleteMany();
  await db.favorite.deleteMany();
  await db.notificationLog.deleteMany();
  await db.pushSubscription.deleteMany({ where: { OR: [{ userId: null }, { userId: { not: admin.id } }] } });
  await db.otpCode.deleteMany();
  await db.webAuthnChallenge.deleteMany();
  await db.address.deleteMany();
  const deletedUsers = await db.user.deleteMany({ where: { role: { not: 'ADMIN' } } });
  console.log(`✓ پاک‌سازی: سفارش‌ها، اقلام، نظرات، سبد، آدرس‌ها و ${deletedUsers.count} کاربر مشتری حذف شد (مدیر ${admin.phone} حفظ شد)`);

  // ============================================================
  // ۲) مشتریان — نام مشخص و یکتا برای هر کاربر + پراکندگی استانی
  // ============================================================
  const usedPhones = new Set<string>([admin.phone, '09121234567']);
  function nextPhone(): string {
    let phone = '';
    do {
      phone = `${pick(PHONE_PREFIX)}${1 + Math.floor(rnd() * 9)}${digits(6)}`;
    } while (usedPhones.has(phone));
    usedPhones.add(phone);
    return phone;
  }
  function makeAddress(user: { fullName: string; phone: string }, provinceFa: string, title: string, isDefault: boolean, cityOverride?: string) {
    const prov = PROV_BY_FA.get(provinceFa)!;
    const city = cityOverride ?? pick(prov.cities);
    return {
      title,
      receiverName: user.fullName,
      receiverPhone: user.phone,
      province: provinceFa,
      city,
      postalCode: `${1 + Math.floor(rnd() * 9)}${digits(9)}`,
      fullAddress: `${pick(STREETS)}، ${pick(LANES)}، پلاک ${Math.floor(rnd() * 92) + 3}، واحد ${Math.floor(rnd() * 11) + 1}`,
      isDefault,
    };
  }

  interface Customer {
    id: string;
    fullName: string;
    phone: string;
    province: string;
    city: string;
    createdAt: Date;
  }
  const customers: Customer[] = [];

  // حساب نمایشی ورود — نام مشخص ثابت
  const demoCreatedAt = new Date(Date.now() - 340 * 24 * 3600 * 1000);
  const demoUser = await db.user.create({
    data: {
      phone: '09121234567',
      firstName: 'سارا',
      lastName: 'محمدی',
      fullName: 'سارا محمدی',
      email: 'sara.mohammadi92@gmail.com',
      avatarUrl: AVATARS[0]!,
      role: 'USER',
      isActive: true,
      phoneVerifiedAt: new Date(demoCreatedAt.getTime() + 4 * 60_000),
      createdAt: demoCreatedAt,
      addresses: { create: makeAddress({ fullName: 'سارا محمدی', phone: '09121234567' }, 'تهران', 'خانه', true) },
      notificationPref: { create: { pushEnabled: true, promotions: true } },
    },
  });
  customers.push({ id: demoUser.id, fullName: 'سارا محمدی', phone: '09121234567', province: 'تهران', city: 'تهران', createdAt: demoCreatedAt });

  // ۱۴۵ مشتری با پراکندگی وزنی استان‌ها
  const CUSTOMER_COUNT = 145;
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const name = nextName(i);
    const phone = nextPhone();
    const province = PROVINCE_POOL[i % PROVINCE_POOL.length]!;
    // تاریخ عضویت — پخش‌شده در ~۱۱ ماه اخیر
    const daysAgo = 12 + Math.floor(320 * Math.pow(rnd(), 1.15));
    const createdAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000 - Math.floor(rnd() * 12) * 3600 * 1000);
    const hasEmail = rnd() < 0.45;
    const email = hasEmail
      ? `${LATIN_FIRST[i % LATIN_FIRST.length]!}${10 + Math.floor(rnd() * 89)}@gmail.com`
      : null;
    const avatarUrl = rnd() < 0.75 ? AVATARS[i % AVATARS.length]! : null;

    const user = await db.user.create({
      data: {
        phone,
        firstName: name.firstName,
        lastName: name.lastName,
        fullName: name.fullName,
        email,
        avatarUrl,
        role: 'USER',
        isActive: true,
        phoneVerifiedAt: rnd() < 0.93 ? new Date(createdAt.getTime() + (1 + Math.floor(rnd() * 7)) * 60_000) : null,
        createdAt,
        addresses: { create: makeAddress({ fullName: name.fullName, phone }, province, 'خانه', true) },
        notificationPref: {
          create: { pushEnabled: rnd() < 0.3, promotions: rnd() < 0.45, newProducts: rnd() < 0.25 },
        },
      },
    });
    const addr2 = user && rnd() < 0.18;
    if (addr2) {
      await db.address.create({
        data: { ...makeAddress({ fullName: name.fullName, phone }, province, 'محل کار', false), userId: user.id },
      });
    }
    const city = PROV_BY_FA.get(province)!.cities[0]!;
    customers.push({ id: user.id, fullName: name.fullName, phone, province, city, createdAt });
  }
  console.log(`✓ مشتریان: ${customers.length} حساب با نام مشخص و یکتا — پراکندگی در ${new Set(customers.map((c) => c.province)).size} استان`);

  // ============================================================
  // ۳) فاکتورهای فروش — پخش در ~۱۱ ماه + پراکندگی مبلغ و استان
  // ============================================================
  const variantRows = await db.productVariant.findMany({
    where: { isActive: true },
    select: {
      id: true, weightGrams: true, priceToman: true, compareAtPriceToman: true,
      product: { select: { id: true, slug: true, title: true } },
    },
  });
  const salesDelta = new Map<string, number>(); // slug → تعداد فروش واقعی

  // تعداد سفارش هر مشتری — توزیع واقع‌گرایانه (خریداران وفادار + تک‌خرید)
  let orderIdx = 0;
  let createdOrders = 0;
  let trackedOrders = 0;
  for (const c of customers) {
    const r = rnd();
    const orderCount = r < 0.34 ? 1 : r < 0.58 ? 2 : r < 0.76 ? 3 : r < 0.88 ? 4 : r < 0.95 ? 5 : r < 0.985 ? 6 : 7;

    for (let k = 0; k < orderCount; k++) {
      // تاریخ با ملایمت فصلی — یلدا و نوروز پر فروش‌تر
      let daysAgo = 0;
      for (let t = 0; t < 24; t++) {
        daysAgo = 0.5 + 334 * rnd();
        const d = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
        if (rnd() < seasonWeight(d) / 1.5) break;
      }
      const createdAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
      createdAt.setHours(8 + Math.floor(rnd() * 15), Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
      if (createdAt <= c.createdAt) createdAt.setDate(createdAt.getDate() + 3); // سفارش بعد از عضویت
      const status = statusForAge(daysAgo);

      // استان فاکتور — ۸۵٪ هم‌استان مشتری، ۱۵٪ استان دیگر (ارسال به اقوام/هدیه)
      let province = c.province;
      if (rnd() < 0.15) {
        const others = PROVINCES.filter((p) => p.fa !== c.province);
        province = pick(others).fa;
      }
      const prov = PROV_BY_FA.get(province)!;
      const city = pick(prov.cities);

      // اقلام — ۱ تا ۴ قلم متمایز با snapshot قیمت
      const itemRoll = rnd();
      const itemCount = itemRoll < 0.45 ? 1 : itemRoll < 0.75 ? 2 : itemRoll < 0.92 ? 3 : 4;
      const chosen = new Set<string>();
      const items: Array<{
        productId: string; variantId: string; productTitle: string; weightGrams: number;
        unitPriceToman: number; compareAtPriceToman: number | null; quantity: number; lineTotalToman: number;
      }> = [];
      while (items.length < itemCount) {
        const v = pick(variantRows);
        if (chosen.has(v.id)) continue;
        chosen.add(v.id);
        const qRoll = rnd();
        const qty = qRoll < 0.6 ? 1 : qRoll < 0.85 ? 2 : 3;
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
        salesDelta.set(v.product.slug, (salesDelta.get(v.product.slug) ?? 0) + qty);
      }
      const subtotalToman = items.reduce((s, it) => s + it.lineTotalToman, 0);
      const shipping = pick(SHIPPING);
      const deliveryToman = subtotalToman >= 1_500_000 ? 0 : shipping.fee;
      const totalToman = subtotalToman + deliveryToman;

      // پرداخت — هماهنگ با ماشین وضعیت واقعی (COD / درگاه آنلاین تستی)
      const isCod = rnd() < 0.22;
      let paymentMethod: string = isCod ? 'COD' : 'ONLINE_GATEWAY';
      let paymentStatus = 'UNPAID';
      let paidAt: Date | null = null;
      let paymentRef: string | null = null;
      if (['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(status)) {
        if (isCod) {
          if (status === 'DELIVERED') {
            paymentStatus = 'PAID';
            paidAt = new Date(createdAt.getTime() + (1 + rnd() * 2) * 24 * 3600 * 1000);
          }
        } else {
          paymentStatus = 'PAID';
          paidAt = new Date(createdAt.getTime() + (2 + Math.floor(rnd() * 38)) * 60_000);
          paymentRef = `SANDBOX-${codeSuffix(orderIdx)}${codeSuffix(orderIdx + 37)}`;
        }
      } else if (status === 'CANCELED' && !isCod) {
        paymentStatus = 'REFUNDED';
        paidAt = createdAt;
        paymentRef = `SANDBOX-${codeSuffix(orderIdx)}${codeSuffix(orderIdx + 37)}`;
      } else if (status === 'CANCELED') {
        paymentMethod = 'COD';
      }

      // کد رهگیری پست — SHIPPED همیشه، DELIVERED اغلب
      const needsTracking = status === 'SHIPPED' || (status === 'DELIVERED' && rnd() < 0.9);
      const trackingCode = needsTracking ? `24${digits(22)}` : null;
      if (trackingCode) trackedOrders++;

      const address = {
        receiverName: c.fullName,
        receiverPhone: c.phone,
        province,
        city,
        postalCode: `${1 + Math.floor(rnd() * 9)}${digits(9)}`,
        fullAddress: `${pick(STREETS)}، ${pick(LANES)}، پلاک ${Math.floor(rnd() * 92) + 3}، واحد ${Math.floor(rnd() * 11) + 1}`,
      };

      const code = `PARS-${jalaliOrderDate(createdAt)}-${codeSuffix(orderIdx)}`;
      orderIdx++;
      await db.order.create({
        data: {
          code,
          userId: c.id,
          status,
          subtotalToman,
          discountToman: 0,
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
          customerNote: rnd() < 0.12 ? pick(CUSTOMER_NOTES) : null,
          adminNote: 'DEMO-RESEED',
          createdAt,
          updatedAt: createdAt,
          items: { create: items },
        },
      });
      createdOrders++;
    }
  }
  console.log(`✓ فاکتورهای فروش: ${createdOrders} سفارش (${trackedOrders} با کد رهگیری) در ~۱۱ ماه اخیر`);

  // ——— تضمین فعالیت اخیر: ۶ سفارش در ۴۴ ساعت گذشته برای «فروش امروز/هفته» ———
  // (بدون این تضمین ممکن است داشبوردِ امروز و هفتهٔ جاری خالی بماند)
  const RECENT: Array<{ status: string; hoursAgo: number }> = [
    { status: 'PENDING_PAYMENT', hoursAgo: 2 },
    { status: 'PAID', hoursAgo: 6 },
    { status: 'PROCESSING', hoursAgo: 12 },
    { status: 'PAID', hoursAgo: 20 },
    { status: 'SHIPPED', hoursAgo: 30 },
    { status: 'PAID', hoursAgo: 42 },
  ];
  for (const [ri, rc] of RECENT.entries()) {
    const c = pick(customers);
    const createdAt = new Date(Date.now() - rc.hoursAgo * 3600 * 1000 - Math.floor(rnd() * 50) * 60_000);
    const prov = PROV_BY_FA.get(c.province)!;
    const itemCount = rnd() < 0.6 ? 1 : 2;
    const chosen = new Set<string>();
    const items: Array<{
      productId: string; variantId: string; productTitle: string; weightGrams: number;
      unitPriceToman: number; compareAtPriceToman: number | null; quantity: number; lineTotalToman: number;
    }> = [];
    while (items.length < itemCount) {
      const v = pick(variantRows);
      if (chosen.has(v.id)) continue;
      chosen.add(v.id);
      const qty = rnd() < 0.7 ? 1 : 2;
      items.push({
        productId: v.product.id, variantId: v.id, productTitle: v.product.title,
        weightGrams: v.weightGrams, unitPriceToman: v.priceToman,
        compareAtPriceToman: v.compareAtPriceToman, quantity: qty, lineTotalToman: v.priceToman * qty,
      });
      salesDelta.set(v.product.slug, (salesDelta.get(v.product.slug) ?? 0) + qty);
    }
    const subtotalToman = items.reduce((s, it) => s + it.lineTotalToman, 0);
    const shipping = pick(SHIPPING);
    const deliveryToman = subtotalToman >= 1_500_000 ? 0 : shipping.fee;
    const paid = rc.status !== 'PENDING_PAYMENT';
    const code = `PARS-${jalaliOrderDate(createdAt)}-${codeSuffix(1000 + ri)}`;
    await db.order.create({
      data: {
        code,
        userId: c.id,
        status: rc.status,
        subtotalToman,
        discountToman: 0,
        deliveryToman,
        totalToman: subtotalToman + deliveryToman,
        addressSnapshot: JSON.stringify({
          receiverName: c.fullName,
          receiverPhone: c.phone,
          province: c.province,
          city: pick(prov.cities),
          postalCode: `${1 + Math.floor(rnd() * 9)}${digits(9)}`,
          fullAddress: `${pick(STREETS)}، ${pick(LANES)}، پلاک ${Math.floor(rnd() * 92) + 3}، واحد ${Math.floor(rnd() * 11) + 1}`,
        }),
        shippingMethodName: shipping.name,
        shippingMethodEta: shipping.eta,
        paymentMethod: 'ONLINE_GATEWAY',
        paymentStatus: paid ? 'PAID' : 'UNPAID',
        paidAt: paid ? new Date(createdAt.getTime() + (2 + Math.floor(rnd() * 30)) * 60_000) : null,
        paymentRef: paid ? `SANDBOX-${codeSuffix(1000 + ri)}${codeSuffix(1037 + ri)}` : null,
        trackingCode: rc.status === 'SHIPPED' ? `24${digits(22)}` : null,
        adminNote: 'DEMO-RESEED',
        createdAt,
        updatedAt: createdAt,
        items: { create: items },
      },
    });
    createdOrders++;
  }
  console.log(`✓ فعالیت اخیر: ۶ سفارش در ۴۴ ساعت گذشته (فروش امروز/هفته داشبورد داده دارد)`);


  // ——— شمارنده‌های محصول = دقیقاً از دیتای واقعی همین دیتاست ———
  // salesCount از اقلام سفارش‌های غیرلغوشده؛ ratingSum/ratingCount از نظرات تأییدشده
  // (سازگار با scripts/sync-product-counters.ts — دیتاست همیشه با خودش سازگار می‌ماند)
  const salesRows = await db.orderItem.groupBy({
    by: ['productId'],
    _sum: { quantity: true },
    where: { order: { status: { not: 'CANCELED' } } },
  });
  const salesMap = new Map(salesRows.map((s) => [s.productId, s._sum.quantity ?? 0]));
  for (const [pid, qty] of salesMap) {
    await db.product.update({ where: { id: pid }, data: { salesCount: qty } });
  }
  const noSales = await db.product.findMany({
    where: { id: { notIn: [...salesMap.keys()] } },
    select: { id: true },
  });
  for (const p of noSales) {
    await db.product.update({ where: { id: p.id }, data: { salesCount: 0 } });
  }
  console.log(`✓ salesCount محصول‌ها: ${salesMap.size} محصول از فروش واقعی (${[...salesMap.values()].reduce((a, b) => a + b, 0)} عدد) | ${noSales.length} محصول بدون فروش صفر شد`);

  // ============================================================
  // ۴) نظرات تأییدشده از مشتریان جدید
  // ============================================================
  const productMeta = await db.product.findMany({
    select: { id: true, slug: true, title: true, ratingCount: true, ratingSum: true },
  });
  let reviewCount = 0;
  for (const p of productMeta) {
    const avg = p.ratingCount > 0 ? p.ratingSum / p.ratingCount : 4.5;
    for (let i = 0; i < 3; i++) {
      const noise = [0, -1, 1][i % 3]!;
      const rating = Math.min(5, Math.max(3, Math.round(avg + noise)));
      const comments = REVIEW_COMMENTS[rating] ?? REVIEW_COMMENTS[4]!;
      const buyer = pick(customers);
      const withReply = rnd() < 0.3;
      await db.review.create({
        data: {
          productId: p.id,
          userId: buyer.id,
          rating,
          comment: comments[i % comments.length]!,
          isApproved: true,
          adminReply: withReply ? pick(ADMIN_REPLIES) : null,
          adminReplyAt: withReply ? new Date(Date.now() - Math.floor(rnd() * 30) * 24 * 3600 * 1000) : null,
          createdAt: new Date(Date.now() - (5 + rnd() * 210) * 24 * 3600 * 1000),
        },
      });
      reviewCount++;
    }
  }
  console.log(`✓ نظرات: ${reviewCount} نظر تأییدشده از مشتریان جدید`);

  // ——— ratingSum/ratingCount از نظرات واقعی (سازگاری کامل دیتاست) ———
  const ratingRows = await db.review.groupBy({
    by: ['productId'],
    _sum: { rating: true },
    _count: { _all: true },
    where: { isApproved: true },
  });
  const ratingMap = new Map(ratingRows.map((r) => [r.productId, r]));
  const allProducts = await db.product.findMany({ select: { id: true } });
  for (const p of allProducts) {
    const r = ratingMap.get(p.id);
    await db.product.update({
      where: { id: p.id },
      data: { ratingSum: r?._sum.rating ?? 0, ratingCount: r?._count._all ?? 0 },
    });
  }
  console.log(`✓ امتیاز محصول‌ها: بازمحاسبه از ${reviewCount} نظر واقعی`);

  // ============================================================
  // ۵) گزارش نهایی — پراکندگی استان، ماه، وضعیت و مبلغ
  // ============================================================
  const orders = await db.order.findMany({
    select: { status: true, totalToman: true, createdAt: true, addressSnapshot: true },
  });
  const provCount = new Map<string, number>();
  const monthCount = new Map<string, number>();
  const statusCount = new Map<string, number>();
  let revenue = 0;
  for (const o of orders) {
    const snap = JSON.parse(o.addressSnapshot ?? '{}') as { province?: string };
    if (snap.province) provCount.set(snap.province, (provCount.get(snap.province) ?? 0) + 1);
    const mk = `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
    monthCount.set(mk, (monthCount.get(mk) ?? 0) + 1);
    statusCount.set(o.status, (statusCount.get(o.status) ?? 0) + 1);
    if (o.status !== 'CANCELED') revenue += o.totalToman;
  }
  const topProvinces = [...provCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const totals = orders.filter((o) => o.status !== 'CANCELED').map((o) => o.totalToman);
  const avgTotal = Math.round(totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length));
  console.log(
    JSON.stringify(
      {
        مشتریان: customers.length,
        سفارش‌ها: createdOrders,
        استان‌های_روشن_روی_نقشه: provCount.size + ' از ۳۱',
        برترین_استان‌ها: topProvinces,
        توزیع_ماهی: Object.fromEntries([...monthCount.entries()].sort()),
        وضعیت‌ها: Object.fromEntries(statusCount.entries()),
        درآمد_کل_تومان: revenue,
        میانگین_سبد_تومان: avgTotal,
      },
      null,
      1
    )
  );
  console.log('— بازنشانی کامل شد —');
}

main()
  .catch((e) => {
    console.error('RESEED FAILED:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
