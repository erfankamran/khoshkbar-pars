/**
 * پاک‌سازی کامل دیتای فروش و کاربران + درج دیتای جدید (درخواست مدیر — ۱۴۰۴/۰۸/۱۸)
 *
 * حذف: همهٔ سفارش‌ها، همهٔ کاربران غیرمدیر، آدرس‌ها، نظرات، علاقه‌مندی‌ها،
 *       سبد خریدها، نشست‌های کاربران، OTP، لاگ‌های امنیتی تستی
 * حفظ:  حساب‌های ADMIN (ورود پنل نمی‌شکند) و کل کاتالوگ محصولات
 *
 * درج جدید:
 * - ۵۳ مشتری + کاربر آزمایشی، هر کدام با «نام مشخص و ثابت» ایرانی
 * - پراکندگی جغرافیایی: پوشش هر ۳۱ استان نقشه ایران (آدرس کاربر + snapshot سفارش)
 * - پراکندگی زمانی: سفارش‌ها روی ~۱۷۸ روز اخیر + چند سفارش امروز/دیروز
 * - پراکندگی مبلغ: سبدهای کوچک تا سبد سهماهه (تقریباً ۴۵۰ هزار تا ~۵.۵ میلیون تومان)
 * - کاملاً قطعی (PRNG با seed ثابت) → اجرای مجدد نتیجهٔ یکسان
 *
 * اجرا: bun scripts/reseed-customers-sales.ts
 */
import { PrismaClient } from '@prisma/client';
import { jalaliOrderDate } from '../src/lib/jalali';

const db = new PrismaClient();

// ——— PRNG قطعی ———
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
const rnd = mulberry32(20261109);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
function digits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String(Math.floor(rnd() * 10));
  return s;
}

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

// ————————————————————————————————————————————————————————————
// ۱) مشتریان با نام مشخص — [نام، نام‌خانوادگی، استان، شهر]
//    استان‌ها دقیقاً با fa های iran-provinces.ts یکسان‌اند.
//    وزن‌دهی دستی مطابق بازار واقعی آجیل‌فروشی آنلاین.
// ————————————————————————————————————————————————————————————
const CUSTOMERS: Array<[string, string, string, string]> = [
  // تهران — قطب اول فروش (۷)
  ['علی', 'رضایی', 'تهران', 'تهران'],
  ['مریم', 'احمدی', 'تهران', 'تهران'],
  ['حسین', 'کریمی', 'تهران', 'تهران'],
  ['زهرا', 'موسوی', 'تهران', 'شهریار'],
  ['رضا', 'حسینی', 'تهران', 'تهران'],
  ['فاطمه', 'صادقی', 'تهران', 'ورامین'],
  ['محمد', 'نجفی', 'تهران', 'تهران'],
  // اصفهان (۴)
  ['سارا', 'قاسمی', 'اصفهان', 'اصفهان'],
  ['امیر', 'مهدوی', 'اصفهان', 'کاشان'],
  ['نرگس', 'طاهری', 'اصفهان', 'نجف‌آباد'],
  ['مهدی', 'شریفی', 'اصفهان', 'اصفهان'],
  // خراسان رضوی (۳)
  ['شیرین', 'یمینی', 'خراسان رضوی', 'مشهد'],
  ['پویا', 'عباسی', 'خراسان رضوی', 'مشهد'],
  ['الهام', 'زمانی', 'خراسان رضوی', 'نیشابور'],
  // فارس (۳)
  ['سعید', 'فرهادی', 'فارس', 'شیراز'],
  ['لیلا', 'بهرامی', 'فارس', 'شیراز'],
  ['کاوه', 'اسدی', 'فارس', 'مرودشت'],
  // آذربایجان شرقی (۳)
  ['پریسا', 'کاظمی', 'آذربایجان شرقی', 'تبریز'],
  ['بابک', 'رستمی', 'آذربایجان شرقی', 'تبریز'],
  ['مینا', 'سلطانی', 'آذربایجان شرقی', 'مراغه'],
  // البرز (۳)
  ['فرزاد', 'امینی', 'البرز', 'کرج'],
  ['نیلوفر', 'پارسا', 'البرز', 'کرج'],
  ['سامان', 'دهقان', 'البرز', 'هشتگرد'],
  // استان‌های دوم (۲)
  ['غزاله', 'افشار', 'خوزستان', 'اهواز'],
  ['نیما', 'اکبری', 'خوزستان', 'آبادان'],
  ['ترانه', 'جهانی', 'کرمان', 'کرمان'],
  ['آرش', 'غفاری', 'کرمان', 'رفسنجان'],
  ['سمانه', 'وحیدی', 'گیلان', 'رشت'],
  ['یاسر', 'نادری', 'گیلان', 'لاهیجان'],
  ['آیدا', 'شفیعی', 'مازندران', 'ساری'],
  ['فرهاد', 'ملکی', 'مازندران', 'بابل'],
  ['بهنام', 'سعیدی', 'یزد', 'یزد'],
  ['هدیه', 'رحیمی', 'یزد', 'میبد'],
  // پوشش کامل بقیهٔ استان‌ها (۱)
  ['شیوا', 'حیدری', 'قم', 'قم'],
  ['کامران', 'فاضلی', 'کرمانشاه', 'کرمانشاه'],
  ['نازنین', 'مرادی', 'هرمزگان', 'بندرعباس'],
  ['سهیل', 'جعفری', 'گلستان', 'گرگان'],
  ['رها', 'عزیزی', 'اردبیل', 'اردبیل'],
  ['اردلان', 'بختیاری', 'مرکزی', 'اراک'],
  ['سارینا', 'کیانی', 'قزوین', 'قزوین'],
  ['مهرداد', 'خسروی', 'زنجان', 'زنجان'],
  ['الهه', 'نوری', 'همدان', 'همدان'],
  ['مسعود', 'درویشی', 'لرستان', 'خرم‌آباد'],
  ['سحر', 'آذری', 'بوشهر', 'بوشهر'],
  ['پارسا', 'فرزام', 'سمنان', 'سمنان'],
  ['سیامک', 'انصاری', 'آذربایجان غربی', 'ارومیه'],
  ['شبنم', 'فتاحی', 'کردستان', 'سنندج'],
  ['مجید', 'کرامتی', 'خراسان شمالی', 'بجنورد'],
  ['زینب', 'هاشمی', 'خراسان جنوبی', 'بیرجند'],
  ['بهاره', 'لسانی', 'چهارمحال و بختیاری', 'شهرکرد'],
  ['داریوش', 'زارع', 'کهگیلویه و بویراحمد', 'یاسوج'],
  ['فرشید', 'کاویانی', 'ایلام', 'ایلام'],
  ['جواد', 'شهبخش', 'سیستان و بلوچستان', 'زاهدان'],
];

const PHONE_PREFIXES = [
  '0912', '0913', '0919', '0935', '0902', '0917', '0936', '0914',
  '0930', '0921', '0938', '0939', '0991', '0994',
] as const;

const STREETS = [
  'خیابان ولیعصر', 'خیابان انقلاب', 'بلوار فردوسی', 'خیابان شریعتی',
  'بلوار کشاورز', 'خیابان سعدی', 'بلوار مدرس', 'خیابان پاسداران',
] as const;
const LANES = ['کوچه یاس', 'کوچه گلستان', 'بن‌بست بهار', 'خیابان ناصر خسرو', 'کوچه مهر'] as const;

const SHIPPING_DEMO = [
  { name: 'پست پیشتاز', eta: '۲ تا ۴ روز کاری', fee: 49_000 },
  { name: 'پست سفارشی', eta: '۳ تا ۷ روز کاری', fee: 39_000 },
  { name: 'تیپاکس', eta: '۱ تا ۳ روز کاری', fee: 79_000 },
] as const;

const REVIEW_COMMENTS: Record<number, string[]> = {
  5: [
    'کیفیت فوق‌العاده، تازه و خوش‌عطر بود. بسته‌بندی هم خیلی مرتب و اصولی بود.',
    'دومین باره خرید می‌کنم و باز هم راضی بودم. وزن دقیق و قیمت منصفانه.',
    'ارسال سریع و محصول دقیقاً همون چیزی بود که در توضیحات نوشته شده. پیشنهاد می‌کنم.',
    'عطر و طعم واقعی و تازه. برای مهمانی گرفتم و همه تعریف کردن.',
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

/** وضعیت بر اساس سن سفارش — قدیمی‌ترها عمدتاً تحویل‌شده */
function statusForAge(ageDays: number): string {
  const r = rnd();
  if (ageDays > 60) {
    if (r < 0.74) return 'DELIVERED';
    if (r < 0.84) return 'SHIPPED';
    if (r < 0.92) return 'PROCESSING';
    if (r < 0.96) return 'PAID';
    return 'CANCELED';
  }
  if (ageDays > 15) {
    if (r < 0.44) return 'DELIVERED';
    if (r < 0.68) return 'SHIPPED';
    if (r < 0.83) return 'PROCESSING';
    if (r < 0.95) return 'PAID';
    return 'CANCELED';
  }
  if (ageDays > 1) {
    if (r < 0.3) return 'SHIPPED';
    if (r < 0.52) return 'PROCESSING';
    if (r < 0.88) return 'PAID';
    return 'PENDING_PAYMENT';
  }
  if (r < 0.4) return 'PAID';
  if (r < 0.75) return 'PENDING_PAYMENT';
  return 'PROCESSING';
}

async function main() {
  console.log('— شروع بازسازی دیتای فروش و کاربران —');

  // ——— گام ۱: پاک‌سازی ———
  const adminUsers = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  const adminIds = adminUsers.map((a) => a.id);

  const delOrders = await db.order.deleteMany({});
  const delReviews = await db.review.deleteMany({});
  const delFavs = await db.favorite.deleteMany({});
  const delCarts = await db.cart.deleteMany({}); // آیتم‌های سبد Cascade
  const delSessions = await db.session.deleteMany({ where: { userId: { notIn: adminIds } } });
  const delPush = await db.pushSubscription.deleteMany({});
  const delNLog = await db.notificationLog.deleteMany({});
  const delNPref = await db.notificationPreference.deleteMany({});
  const delOtp = await db.otpCode.deleteMany({});
  const delChallenge = await db.webAuthnChallenge.deleteMany({});
  const delSecLog = await db.securityLog.deleteMany({});
  const delUsers = await db.user.deleteMany({ where: { role: { not: 'ADMIN' } } });
  const resetProducts = await db.product.updateMany({
    data: { salesCount: 0, ratingSum: 0, ratingCount: 0 },
  });
  console.log(
    `✓ پاک‌سازی: ${delOrders.count} سفارش، ${delUsers.count} کاربر، ${delReviews.count} نظر، ` +
      `${delCarts.count} سبد، ${delSessions.count} نشست، ${delFavs.count} علاقه‌مندی — ` +
      `${resetProducts.count} محصول ریست شد`
  );

  // ——— گام ۲: مشتریان با نام مشخص ———
  interface NewUser {
    id: string;
    fullName: string;
    phone: string;
    province: string;
    city: string;
    weight: number;
  }
  const createdUsers: NewUser[] = [];

  // کاربر آزمایشی با نام ثابت (تهران)
  const demo = await db.user.create({
    data: {
      phone: '09121234567',
      firstName: 'نیما',
      lastName: 'تهرانی',
      fullName: 'نیما تهرانی',
      role: 'USER',
      isActive: true,
      phoneVerifiedAt: new Date(Date.now() - 240 * 24 * 3600 * 1000),
      createdAt: new Date(Date.now() - 240 * 24 * 3600 * 1000),
    },
  });
  createdUsers.push({
    id: demo.id,
    fullName: 'نیما تهرانی',
    phone: demo.phone,
    province: 'تهران',
    city: 'تهران',
    weight: 5,
  });

  for (let i = 0; i < CUSTOMERS.length; i++) {
    const [firstName, lastName, province, city] = CUSTOMERS[i]!;
    const fullName = `${firstName} ${lastName}`;
    const phone = `${PHONE_PREFIXES[i % PHONE_PREFIXES.length]}${String(2110000 + i * 13711)}`;
    const daysAgo = 12 + Math.floor((i * 195) / CUSTOMERS.length);
    const createdAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
    const user = await db.user.create({
      data: {
        phone,
        firstName,
        lastName,
        fullName,
        role: 'USER',
        isActive: true,
        phoneVerifiedAt: createdAt,
        createdAt,
      },
    });
    createdUsers.push({ id: user.id, fullName, phone, province, city, weight: i < 10 ? 5 : i < 30 ? 3 : i < 45 ? 2 : 1 });

    // آدرس اصلی — منبع نقشهٔ مشتریان
    const postalCode = `${1 + Math.floor(rnd() * 9)}${digits(9)}`;
    await db.address.create({
      data: {
        userId: user.id,
        title: 'خانه',
        receiverName: fullName,
        receiverPhone: phone,
        province,
        city,
        postalCode,
        fullAddress: `${pick(STREETS)}، ${pick(LANES)}، پلاک ${Math.floor(rnd() * 90) + 5}، واحد ${Math.floor(rnd() * 9) + 1}`,
        isDefault: true,
      },
    });
    await db.notificationPreference.create({ data: { userId: user.id } });
  }

  // نام خوانا برای حساب مدیر فنی فاقد نام
  await db.user.updateMany({
    where: { role: 'ADMIN', fullName: null },
    data: { fullName: 'مدیر فنی پارس', firstName: 'مدیر فنی', lastName: 'پارس' },
  });

  console.log(`✓ کاربران: ${createdUsers.length} مشتری با نام مشخص روی ${new Set(createdUsers.map((u) => u.province)).size} استان`);

  // ——— گام ۳: فاکتورهای فروش با پراکندگی ———
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
  if (variantRows.length === 0) throw new Error('هیچ واریانتی یافت نشد');

  // استخر وزنی: مشتریان قدیمی‌تر/سنگین‌تر بیشتر سفارش می‌دهند
  const pool: NewUser[] = [];
  for (const u of createdUsers) for (let w = 0; w < u.weight; w++) pool.push(u);

  const ORDER_COUNT = 150;
  const salesCount = new Map<string, number>();
  let createdOrders = 0;
  let trackedOrders = 0;
  const totals: number[] = [];

  for (let i = 0; i < ORDER_COUNT; i++) {
    // پراکندگی زمانی: ۶ سفارش اول در ۴۸ ساعت اخیر؛ بقیه با چگالی بیشتر در روزهای نزدیک
    const ageDays = i < 6 ? rnd() * 1.7 : 2 + 176 * Math.pow(rnd(), 1.4);
    const createdAt = new Date(Date.now() - ageDays * 24 * 3600 * 1000 - Math.floor(rnd() * 12) * 3600 * 1000);
    const status = statusForAge(ageDays);

    const user = pick(pool);
    const shipping = pick(SHIPPING_DEMO);
    // ~۸۵٪ سفارش به شهر خود مشتری، بقیه به شهر دیگرِ همان استان (هدیه/محل کار اقوام)
    let province = user.province;
    let city = user.city;
    if (rnd() < 0.15) {
      const peers = CUSTOMERS.filter((c) => c[2] === province).map((c) => c[3]);
      city = pick(peers);
    }

    // اقلام — پراکندگی مبلغ: ۵۵٪ سبد کوچک، ۲۸٪ متوسط، ۱۷٪ سبد سنگین
    const bucket = rnd();
    const itemCount = bucket < 0.55 ? 1 : bucket < 0.83 ? 2 : 3;
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
      const heavy = bucket >= 0.83;
      const qty = heavy ? (rnd() < 0.5 ? 2 : 3) : rnd() < 0.65 ? 1 : 2;
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
    const deliveryToman = subtotalToman >= 1_500_000 ? 0 : shipping.fee;
    const totalToman = subtotalToman + deliveryToman;
    totals.push(totalToman);

    // پرداخت — همسو با ماشین وضعیت واقعی
    const isOnline = rnd() < 0.75;
    let paymentStatus = 'UNPAID';
    let paidAt: Date | null = null;
    let paymentRef: string | null = null;
    if (status !== 'PENDING_PAYMENT' && status !== 'CANCELED') {
      paymentStatus = 'PAID';
      paidAt = new Date(createdAt.getTime() + 7 * 60 * 1000);
      if (isOnline) paymentRef = `SANDBOX-${codeSuffix(i)}${codeSuffix(i + 53)}`;
    } else if (status === 'CANCELED' && isOnline) {
      paymentStatus = 'REFUNDED';
      paidAt = createdAt;
      paymentRef = `SANDBOX-${codeSuffix(i)}${codeSuffix(i + 53)}`;
    }
    const paymentMethod = isOnline && status !== 'PENDING_PAYMENT' ? 'ONLINE_GATEWAY' : 'COD';

    const needsTracking = status === 'SHIPPED' || (status === 'DELIVERED' && rnd() < 0.9);
    const trackingCode = needsTracking ? `24${digits(22)}` : null;
    if (trackingCode) trackedOrders++;

    const address = {
      receiverName: user.fullName,
      receiverPhone: user.phone,
      province,
      city,
      postalCode: `${1 + Math.floor(rnd() * 9)}${digits(9)}`,
      fullAddress: `${pick(STREETS)}، ${pick(LANES)}، پلاک ${Math.floor(rnd() * 90) + 5}، واحد ${Math.floor(rnd() * 9) + 1}`,
    };

    const code = `PARS-${jalaliOrderDate(createdAt)}-${codeSuffix(i)}`;
    const order = await db.order.create({
      data: {
        code,
        userId: user.id,
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
        adminNote: 'RESEED-2026-11',
        createdAt,
        items: { create: items },
      },
    });
    createdOrders++;
    if (status !== 'CANCELED') {
      for (const it of items) {
        salesCount.set(it.productId, (salesCount.get(it.productId) ?? 0) + it.quantity);
      }
    }
    void order;
  }
  console.log(`✓ فاکتورهای فروش: ${createdOrders} سفارش (${trackedOrders} با کد رهگیری)`);

  // salesCount از سفارش‌های واقعیِ غیرلغوشده
  for (const [productId, count] of salesCount) {
    await db.product.update({ where: { id: productId }, data: { salesCount: count } });
  }

  // ——— گام ۴: نظرات تأییدشده ———
  const products = await db.product.findMany({
    select: { id: true, title: true },
    orderBy: { createdAt: 'asc' },
  });
  const reviewers = createdUsers.filter((u) => u.phone !== '09121234567');
  let reviewCount = 0;
  for (let pi = 0; pi < products.length; pi++) {
    const product = products[pi]!;
    const perProduct = 3;
    const ratingPlan = [5, 4, 4, 5, 3, 5][pi % 6]!;
    for (let k = 0; k < perProduct; k++) {
      const rating = Math.min(5, Math.max(3, ratingPlan - (k === 2 ? 1 : 0)));
      const comments = REVIEW_COMMENTS[rating] ?? REVIEW_COMMENTS[4]!;
      const reviewer = reviewers[(pi * 3 + k * 7) % reviewers.length]!;
      await db.review.create({
        data: {
          productId: product.id,
          userId: reviewer.id,
          rating,
          comment: comments[(pi + k) % comments.length]!,
          isApproved: true,
          // پاسخ فروشگاه به چند نظر مشخص
          adminReply: k === 1 && pi % 5 === 0 ? 'سپاس از اعتماد شما؛ مشتریِ ثابت پارس باشید 🌰' : null,
          adminReplyAt: k === 1 && pi % 5 === 0 ? new Date(Date.now() - 2 * 24 * 3600 * 1000) : null,
          createdAt: new Date(Date.now() - (3 + ((pi * 3 + k) % 85)) * 24 * 3600 * 1000),
        },
      });
      reviewCount++;
    }
  }
  // بازمحاسبهٔ دقیق امتیاز هر محصول از نظرات واقعی
  const ratingAgg = await db.review.groupBy({ by: ['productId'], _sum: { rating: true }, _count: { _all: true } });
  for (const g of ratingAgg) {
    await db.product.update({
      where: { id: g.productId },
      data: { ratingSum: g._sum.rating ?? 0, ratingCount: g._count._all },
    });
  }
  console.log(`✓ نظرات: ${reviewCount} + بازمحاسبهٔ امتیاز ${ratingAgg.length} محصول`);

  // ——— گام ۵: گزارش راستی‌آزمایی ———
  const usersByProv = await db.address.groupBy({ by: ['province'], _count: { _all: true } });
  const orderRows = await db.order.findMany({
    where: { status: { not: 'CANCELED' } },
    select: { totalToman: true, addressSnapshot: true, createdAt: true },
  });
  const revMap = new Map<string, { count: number; revenue: number }>();
  for (const o of orderRows) {
    let province = 'نامشخص';
    try {
      province = (JSON.parse(o.addressSnapshot) as { province?: string }).province ?? 'نامشخص';
    } catch {
      /* skip */
    }
    const agg = revMap.get(province) ?? { count: 0, revenue: 0 };
    agg.count++;
    agg.revenue += o.totalToman;
    revMap.set(province, agg);
  }
  const sortedTotals = [...totals].sort((a, b) => a - b);
  const q = (p: number) => sortedTotals[Math.floor(p * (sortedTotals.length - 1))]!;
  const byMonth = new Map<string, number>();
  for (const o of orderRows) {
    const key = `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  const range = await db.order.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } });
  const statusAgg = await db.order.groupBy({ by: ['status'], _count: { _all: true } });

  console.log(
    JSON.stringify(
      {
        users: createdUsers.length,
        usersByProvince: Object.fromEntries(usersByProv.map((g) => [g.province, g._count._all]).sort()),
        provincesCovered: usersByProv.length,
        orders: createdOrders,
        ordersByProvince: Object.fromEntries(
          [...revMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([p, v]) => [p, `${v.count} فاکتور / ${v.revenue.toLocaleString('fa-IR')} ت`])
        ),
        revenueToman: orderRows.reduce((s, o) => s + o.totalToman, 0),
        priceSpread: {
          min: sortedTotals[0],
          p25: q(0.25),
          median: q(0.5),
          p75: q(0.75),
          max: sortedTotals[sortedTotals.length - 1],
        },
        byStatus: Object.fromEntries(statusAgg.map((s) => [s.status, s._count._all])),
        byMonth: Object.fromEntries([...byMonth.entries()].sort()),
        range: { min: range._min.createdAt, max: range._max.createdAt },
        reviews: reviewCount,
      },
      null,
      1
    )
  );
  console.log('— بازسازی کامل شد —');
}

main()
  .catch((e) => {
    console.error('RESEED FAILED:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
