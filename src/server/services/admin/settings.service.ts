import { revalidateStoreCache, CACHE_TAGS } from '@/server/lib/cache-tags';
import { db } from '@/lib/db';
import { BRAND } from '@/lib/config';
import { ApiError } from '@/server/lib/api';
import { GATEWAY_PROVIDERS, SETTING_KEYS, settingsUpdateSchema } from '@/server/validators/admin.schema';
import {
  DEFAULT_SHIPPING_METHODS,
  serializeShippingMethods,
} from '@/server/services/shipping.service';
import type { z } from 'zod';
import { isSmsEnvManaged } from '@/server/services/sms.service';

/**
 * تنظیمات فروشگاه (فاز ۱۴ و ۱۵) — whitelist کلیدها + اعتبارسنجی مقدار
 *
 * کلیدهای عددی (تومان) و بولین/متنی با قواعد جداگانه کنترل می‌شوند؛
 * مقادیر به‌صورت رشته JSON ذخیره می‌شوند (خواننده‌ها Number()/boolean می‌کنند).
 * فاز ۱۵: روش‌های ارسال پستی (JSON)، توضیح وضعیت ارسال، و درگاه پرداخت.
 */

type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

const NUMERIC_KEYS: Record<string, { min: number; max: number; label: string }> = {
  freeShippingThresholdToman: { min: 0, max: 100_000_000, label: 'آستانه ارسال رایگان' },
  deliveryFeeToman: { min: 0, max: 10_000_000, label: 'هزینه ارسال' },
  minOrderToman: { min: 0, max: 100_000_000, label: 'حداقل سفارش' },
  // اسکرین اسپلش — مدت نمایش صفحه آغازین (میلی‌ثانیه)
  'splash.durationMs': { min: 800, max: 5000, label: 'مدت نمایش اسپلش' },
};

const BOOLEAN_KEYS = new Set(['storeOpen', 'onlineGatewayEnabled', 'codEnabled', 'splash.enabled']);
const TEXT_KEYS: Record<string, { max: number; label: string }> = {
  supportPhone: { max: 20, label: 'تلفن پشتیبانی' },
  shippingNote: { max: 200, label: 'توضیح وضعیت ارسال' },
  gatewayMerchantId: { max: 64, label: 'مرچنت کد درگاه' },
};

/** فاز ۲ — اطلاعات برند (namespace برند) — متن فارسی با سقف طول */
const BRAND_TEXT_KEYS: Record<string, { max: number; label: string; allowEmpty?: boolean }> = {
  'brand.name': { max: 40, label: 'نام کوتاه برند' },
  'brand.fullName': { max: 80, label: 'نام کامل برند' },
  'brand.tagline': { max: 60, label: 'زیرنویس برند' },
  'brand.slogan': { max: 80, label: 'شعار برند' },
  'brand.description': { max: 300, label: 'توضیح برند (سئو)' },
  'brand.logoUrl': { max: 500, label: 'نشانی لوگو', allowEmpty: true },
  // اسکرین اسپلش — متن‌های اختیاری (خالی = مقادیر برند به‌کار می‌رود)
  'splash.title': { max: 80, label: 'عنوان اسپلش', allowEmpty: true },
  'splash.slogan': { max: 80, label: 'شعار اسپلش', allowEmpty: true },
  'splash.logoUrl': { max: 500, label: 'نشانی لوگوی اسپلش', allowEmpty: true },
};

/** فاز ۲ — تم رنگی — فقط HEX شش‌رقمی */
const COLOR_KEYS = new Set(['theme.primary', 'theme.accent', 'splash.backgroundColor']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** نقشه موقعیت فروشگاه — خالی مجاز (ثبت‌نشده)؛ در غیر این‌صورت عدد اعشاری معتبر */
const MAP_KEYS = new Set(['store.mapLat', 'store.mapLng']);

/** فیلدهای متنی پیکربندی ملی‌پیامک — خالی مجاز (تا تکمیل پیکربندی) */
const SMS_TEXT_KEYS = new Set([
  'sms.melipayamak.username',
  'sms.melipayamak.password',
  'sms.melipayamak.sender',
]);

/** نشانی پستی فروشگاه — سربرگ فاکتور چاپی A5؛ خالی مجاز تا تکمیل (درخواست کاربر) */
const STORE_TEXT_KEYS: Record<string, { max: number; label: string }> = {
  'store.address': { max: 300, label: 'نشانی پستی فروشگاه' },
  'store.postalCode': { max: 16, label: 'کدپستی فروشگاه' },
};
/** لوگو: فقط مسیر داخلی (فایل آپلودی /api/media/...) یا نشانی http(s) */
const LOGO_URL_RE = /^(https?:\/\/|\/api\/media\/|\/)/i;

/** همه تنظیمات شناخته‌شده با مقدار فعلی — Expected queries: ۱ */
export async function listAdminSettings() {
  const rows = await db.setting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const settings = SETTING_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      value: row?.value ?? defaultValue(key),
      description: row?.description ?? defaultDescription(key),
      updatedAt: row?.updatedAt ?? null,
    };
  });
  // فلگ بی‌خطر (بدون افشای مقادیر env) — پنل با آن هشدار «مدیریت از env» نشان می‌دهد
  return { settings, smsEnvManaged: isSmsEnvManaged() };
}

function defaultValue(key: string): string {
  switch (key) {
    case 'freeShippingThresholdToman':
      return '1500000';
    case 'deliveryFeeToman':
      return '49000';
    case 'minOrderToman':
      return '200000';
    case 'storeOpen':
      return 'true';
    case 'supportPhone':
      return '02191008080';
    case 'shippingMethods':
      return JSON.stringify(DEFAULT_SHIPPING_METHODS);
    case 'shippingNote':
      return 'سفارش‌های ثبت‌شده تا ساعت ۱۴ همان روز کاری به پست تحویل می‌شود';
    case 'onlineGatewayEnabled':
      return 'true';
    case 'codEnabled':
      return 'true';
    case 'gatewayProvider':
      return 'SANDBOX';
    case 'gatewayMerchantId':
      return '';
    // فاز ۲ — برند و تم: پیش‌فرض‌ها هم‌راستا با ثابت‌های BRAND و پالت پارس
    case 'brand.name':
      return BRAND.name;
    case 'brand.fullName':
      return BRAND.fullName;
    case 'brand.tagline':
      return BRAND.tagline;
    case 'brand.slogan':
      return BRAND.slogan;
    case 'brand.description':
      return BRAND.description;
    case 'brand.logoUrl':
      return '';
    case 'theme.primary':
      return '#1f8f5a';
    case 'theme.accent':
      return '#d9b352';
    // اسکرین اسپلش — پیش‌فرض‌ها هم‌راستا با پالت پارس و رفتار فعلی
    case 'splash.enabled':
      return 'true';
    case 'splash.logoUrl':
      return '';
    case 'splash.backgroundColor':
      return '#06241a';
    case 'splash.title':
      return '';
    case 'splash.slogan':
      return '';
    case 'splash.durationMs':
      return '1900';
    default:
      return '';
  }
}

function defaultDescription(key: string): string {
  switch (key) {
    case 'freeShippingThresholdToman':
      return 'سفارش بالاتر از این مبلغ، ارسال رایگان دارد (تومان)';
    case 'deliveryFeeToman':
      return 'هزینه ثابت ارسال برای سفارش‌های بدون روش انتخابی (تومان)';
    case 'minOrderToman':
      return 'کمترین مبلغ مجاز برای ثبت سفارش (تومان)';
    case 'storeOpen':
      return 'true = فروشگاه باز است؛ false = ثبت سفارش جدید مسدود می‌شود';
    case 'supportPhone':
      return 'شماره تماس پشتیبانی نمایش‌داده‌شده در فروشگاه';
    case 'shippingMethods':
      return 'روش‌های ارسال پستی با هزینه و زمان تحویل — در تسویه حساب به مشتری نمایش داده می‌شود';
    case 'shippingNote':
      return 'توضیح وضعیت ارسال برای مشتری (زمان تحویل‌گیری به پست و...)';
    case 'onlineGatewayEnabled':
      return 'true = گزینه پرداخت آنلاین در تسویه حساب فعال است';
    case 'codEnabled':
      return 'true = گزینه پرداخت در محل هنگام دریافت فعال است';
    case 'gatewayProvider':
      return 'SANDBOX = درگاه تستی؛ ZARINPAL / IDPAY / ZIBAL = درگاه واقعی (نیازمند اتصال)';
    case 'gatewayMerchantId':
      return 'مرچنت کد درگاه — محرمانه می‌ماند و هرگز به کاربران نمایش داده نمی‌شود';
    case 'brand.name':
      return 'نام کوتاه برند — در هدر و عنوان صفحات نمایش داده می‌شود';
    case 'brand.fullName':
      return 'نام کامل برند — در سئو، فیدها و داده ساختاریافته استفاده می‌شود';
    case 'brand.tagline':
      return 'زیرنویس کوتاه زیر نام برند در هدر';
    case 'brand.slogan':
      return 'شعار برند — در فوتر و پیام‌های برند';
    case 'brand.description':
      return 'توضیح برند برای موتورهای جست‌وجو (meta description)';
    case 'brand.logoUrl':
      return 'نشانی لوگوی آپلودی (خالی = نشان پیش‌فرض پارس) — از طریق آپلود تصویر پر می‌شود';
    case 'theme.primary':
      return 'رنگ اصلی برند به‌صورت HEX — پالت سبز فروشگاه از همین رنگ ساخته می‌شود';
    case 'theme.accent':
      return 'رنگ تأکیدی به‌صورت HEX — برچسب‌ها، تخفیف‌ها و امضای طلایی';
    case 'store.mapLat':
      return 'عرض جغرافیایی فروشگاه (مثل ۳۵٫۷) — با «موقعیت فعلی من» یا ورود دستی';
    case 'store.mapLng':
      return 'طول جغرافیایی فروشگاه (مثل ۵۱٫۴) — در صفحه درباره فروشگاه نقشه می‌سازد';
    case 'store.address':
      return 'نشانی پستی فروشگاه — بالای فاکتور چاپی A5 و بخش فرستنده مرسوله چاپ می‌شود';
    case 'store.postalCode':
      return 'کدپستی فروشگاه — در سربرگ و بخش فرستنده فاکتور چاپی درج می‌شود';
    case 'sms.provider':
      return 'خالی = کد تایید فقط در حالت آزمایشی؛ melipayamak = ارسال واقعی با ملی‌پیامک — اگر از env پیکربندی شده باشد، env مقدم است';
    case 'sms.melipayamak.username':
      return 'نام کاربری پنل ملی‌پیامک (همان شماره ورود به سامانه)';
    case 'sms.melipayamak.password':
      return 'رمز وب‌سروس ملی‌پیامک — از پنل ملی‌پیامک بخش وب‌سروس؛ محرمانه می‌ماند';
    case 'sms.melipayamak.sender':
      return 'شماره خط ارسال‌کننده از پنل ملی‌پیامک (مثل 50004000xxxxx)';
    // اسکرین اسپلش — صفحه آغازین اپلیکیشن
    case 'splash.enabled':
      return 'true = صفحه آغازین در شروع هر نشست نمایش داده می‌شود؛ false = ورود مستقیم به فروشگاه';
    case 'splash.logoUrl':
      return 'لوگوی اختصاصی صفحه آغازین (خالی = نشان پیش‌فرض پارس) — از طریق آپلود تصویر پر می‌شود';
    case 'splash.backgroundColor':
      return 'رنگ پس‌زمینه صفحه آغازین به‌صورت HEX — هم‌رنگ پیش‌فرض پالت سبز تیره پارس';
    case 'splash.title':
      return 'عنوان روی صفحه آغازین (خالی = نام برند از بخش «برند و هویت» به‌کار می‌رود)';
    case 'splash.slogan':
      return 'شعار روی صفحه آغازین (خالی = شعار برند از بخش «برند و هویت» به‌کار می‌رود)';
    case 'splash.durationMs':
      return 'مدت نمایش صفحه آغازین به میلی‌ثانیه — بین ۸۰۰ (سریع) تا ۵۰۰۰ (آرام)';
    default:
      return '';
  }
}

/** ذخیره دسته‌ای مقادیر — فقط کلیدهای whitelist؛ مقدار نامعتبر → 400 */
export async function updateAdminSettings(input: SettingsUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.BRAND);

  const entries = Object.entries(input.values);
  if (entries.length === 0) {
    throw new ApiError(400, 'VALIDATION', 'مقداری برای ذخیره ارسال نشده است');
  }

  const upserts: Array<{ key: string; value: string }> = [];
  for (const [key, raw] of entries) {
    if (!(SETTING_KEYS as readonly string[]).includes(key)) {
      throw new ApiError(400, 'VALIDATION', `کلید «${key}» قابل ویرایش نیست`);
    }
    if (key === 'shippingMethods') {
      // رشته JSON از پنل می‌آید — ساختار و سقف‌ها در shipping.service کنترل می‌شود
      let parsed: unknown;
      try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        throw new ApiError(400, 'VALIDATION', 'روش‌های ارسال باید JSON معتبر باشد');
      }
      upserts.push({ key, value: serializeShippingMethods(parsed) });
    } else if (key === 'gatewayProvider') {
      const provider = String(raw).trim().toUpperCase();
      if (!(GATEWAY_PROVIDERS as readonly string[]).includes(provider)) {
        throw new ApiError(400, 'VALIDATION', 'درگاه پرداخت انتخاب‌شده پشتیبانی نمی‌شود');
      }
      upserts.push({ key, value: provider });
    } else if (key in NUMERIC_KEYS) {
      const rule = NUMERIC_KEYS[key];
      const num = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isInteger(num) || num < rule.min || num > rule.max) {
        throw new ApiError(
          400,
          'VALIDATION',
          `${rule.label} باید عدد صحیح بین ${rule.min.toLocaleString('en-US')} تا ${rule.max.toLocaleString('en-US')} باشد`
        );
      }
      upserts.push({ key, value: String(num) });
    } else if (BOOLEAN_KEYS.has(key)) {
      const bool = typeof raw === 'boolean' ? raw : String(raw).trim() === 'true';
      upserts.push({ key, value: bool ? 'true' : 'false' });
    } else if (key in TEXT_KEYS) {
      const rule = TEXT_KEYS[key];
      const text = String(raw).trim();
      // مرچنت کد می‌تواند خالی باشد (تا وقتی درگاه واقعی وصل نشده)
      const allowEmpty = key === 'gatewayMerchantId';
      if ((!allowEmpty && text.length === 0) || text.length > rule.max) {
        throw new ApiError(400, 'VALIDATION', `${rule.label} معتبر نیست`);
      }
      upserts.push({ key, value: text });
    } else if (key === 'brand.logoUrl' || key === 'splash.logoUrl') {
      // لوگو می‌تواند خالی باشد (نشان پیش‌فرض)؛ مقدار باید مسیر داخلی یا http(s) باشد
      const text = String(raw).trim();
      if (text.length > BRAND_TEXT_KEYS[key].max) {
        throw new ApiError(400, 'VALIDATION', 'نشانی لوگو بیش از حد طول مجاز است');
      }
      if (text !== '' && !LOGO_URL_RE.test(text)) {
        throw new ApiError(400, 'VALIDATION', 'نشانی لوگو باید مسیر داخلی یا http(s) باشد');
      }
      upserts.push({ key, value: text });
    } else if (key in BRAND_TEXT_KEYS) {
      const rule = BRAND_TEXT_KEYS[key];
      const text = String(raw).trim();
      if ((!rule.allowEmpty && text.length === 0) || text.length > rule.max) {
        throw new ApiError(400, 'VALIDATION', `${rule.label} معتبر نیست`);
      }
      upserts.push({ key, value: text });
    } else if (COLOR_KEYS.has(key)) {
      // رنگ تم: فقط HEX شش‌رقمی — هر چیز دیگر رد می‌شود (مقادیر مستقیم در CSS می‌نشینند)
      const text = String(raw).trim();
      if (!HEX_COLOR_RE.test(text)) {
        throw new ApiError(400, 'VALIDATION', 'رنگ باید به‌صورت HEX شش‌رقمی مثل #1f8f5a باشد');
      }
      upserts.push({ key, value: text.toLowerCase() });
    } else if (MAP_KEYS.has(key)) {
      // مختصات نقشه: خالی = نقشه ثبت‌نشده؛ در غیر این‌صورت عدد اعشاری در بازه معتبر
      const text = String(raw).trim();
      if (text === '') {
        upserts.push({ key, value: '' });
      } else {
        const num = Number(text);
        const [min, max] = key === 'store.mapLat' ? [-90, 90] : [-180, 180];
        if (!Number.isFinite(num) || num < min || num > max) {
          throw new ApiError(
            400,
            'VALIDATION',
            `مختصات باید عدد اعشاری بین ${min} تا ${max} باشد`
          );
        }
        upserts.push({ key, value: String(num) });
      }
    } else if (key === 'sms.provider') {
      // ارائه‌دهنده پیامک: خالی = خاموش (sandbox)؛ melipayamak = ارسال واقعی
      const text = String(raw).trim().toLowerCase();
      if (text !== '' && text !== 'melipayamak') {
        throw new ApiError(400, 'VALIDATION', 'سرویس پیامک پشتیبانی‌شده: melipayamak یا خالی');
      }
      upserts.push({ key, value: text });
    } else if (SMS_TEXT_KEYS.has(key)) {
      // مشخصات ملی‌پیامک — خالی مجاز تا وقتی کامل نشده؛ رمز محرمانه می‌ماند
      const text = String(raw).trim();
      if (text.length > 120) {
        throw new ApiError(400, 'VALIDATION', 'مقدار فیلد پیامک بیش از حد طول مجاز است');
      }
      upserts.push({ key, value: text });
    } else if (key in STORE_TEXT_KEYS) {
      // نشانی/کدپستی فروشگاه — خالی مجاز (فاکتور بدون نشانی هم چاپ می‌شود)
      const rule = STORE_TEXT_KEYS[key];
      const text = String(raw).trim();
      if (text.length > rule.max) {
        throw new ApiError(400, 'VALIDATION', `${rule.label} حداکثر ${rule.max} نویسه است`);
      }
      upserts.push({ key, value: text });
    }
  }

  await db.$transaction(
    upserts.map((u) =>
      db.setting.upsert({
        where: { key: u.key },
        update: { value: u.value },
        create: { key: u.key, value: u.value, description: defaultDescription(u.key) },
      })
    )
  );

  return { updated: upserts.map((u) => u.key) };
}
