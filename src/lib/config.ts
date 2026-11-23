/**
 * ثابت‌های برند پارس
 * توجه: تنظیمات متغیر فروشگاه (آستانه ارسال رایگان، هزینه ارسال و ...) در فاز دیتابیس
 * به جدول settings منتقل می‌شود و از پنل مدیریت کنترل خواهد شد.
 */
export const BRAND = {
  name: 'پارس',
  fullName: 'فروشگاه پارس',
  tagline: 'خشکبار و مغزهای تازه',
  slogan: 'از مزرعه تا سفره شما',
  description:
    'خرید آنلاین خشکبار، آجیل، مغزها و محصولات طبیعی — تازه از مزرعه تا سفره شما',
} as const;

/**
 * دسته‌بندی‌های اصلی فروشگاه — این لیست در فاز ۴ (دیتابیس) از جدول categories
 * خوانده می‌شود و از پنل مدیریت کنترل خواهد شد؛ اینجا فقط برای اسکلت رابط کاربری است.
 */
export const PLACEHOLDER_CATEGORIES = [
  { slug: 'pistachio', title: 'پسته' },
  { slug: 'almond', title: 'بادام' },
  { slug: 'walnut', title: 'گردو' },
  { slug: 'hazelnut', title: 'فندق' },
  { slug: 'raisin', title: 'کشمش' },
  { slug: 'date', title: 'خرما' },
  { slug: 'dried-fig', title: 'انجیر خشک' },
  { slug: 'dried-mulberry', title: 'توت خشک' },
  { slug: 'dried-fruit', title: 'میوه خشک' },
  { slug: 'mixed-nuts', title: 'آجیل مخلوط' },
  { slug: 'seeds-kernels', title: 'تخمه و مغزها' },
] as const;

/** اسلاگ دسته ویژه «هدایای سازمانی» — مشترک بین سرور (home.service) و کلاینت (HomeView) */
export const GIFT_CATEGORY_SLUG = 'corporate-gifts';
