import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { getSessionUser, isHttpsRequest } from '@/server/lib/auth';
import { notifyAdmins } from '@/server/services/notification-center.service';

/**
 * سرویس سبد خرید سمت سرور (فاز ۸ — جریان خرید · فاز ۹ — سبد کاربر و ادغام)
 *
 * اصول:
 * - «منبع حقیقت قیمت» فقط ردیف ProductVariant در دیتابیس است؛ قیمت ارسالی
 *   کلاینت (expectedUnitPriceToman) فقط برای تشخیص تغییر قیمت استفاده می‌شود
 *   و هرگز در محاسبه مبالغ دخالتی ندارد (بند ۱۳: قیمت لحظه ثبت).
 * - همه مبالغ عدد صحیح تومان — بدون اعشار و بدون شناوری.
 * - مالک سبد: کاربر واردشده (کوکی نشست) یا مهمان (کوکی pars_device).
 *   پس از ورود OTP سبد مهمان با سبد کاربر ادغام و حذف می‌شود (mergeGuestCart).
 * - ضد N+1: خواندن ردیف‌ها یک findMany با واکشی دسته‌ای relation است؛
 *   تعداد دستورات با تعداد اقلام رشد نمی‌کند (اندازه‌گیری در measure-queries.sh).
 *
 * Expected SQL statements (اندازه‌گیری‌شده در dev.log با measure-queries.sh — ثابت
 * و مستقل از تعداد ردیف‌ها؛ مهمان):
 *   GET  /api/cart             → ۱۰ (تراکنش upsert سبد ۵ + خواندن ۵؛ سبد خالی ۷)
 *   POST /api/cart/items       → ۱۴ (واریانت+محصول ۲ + upsert ۵ + ردیف موجود ۱ +
 *                                    نوشتن ۱ + خواندن ۵)
 *   PATCH /api/cart/items/[id] → ۱۴ (upsert ۵ + findFirst با واکشی ۳ + نوشتن ۱ +
 *                                    خواندن ۵)
 *   DELETE /api/cart/items/[id] → ۱۱ (upsert ۵ + deleteMany ۱ + خواندن ۵؛ اگر
 *                                    آخرین ردیف حذف شود خواندن batch سبد خالی
 *                                    انجام نمی‌شود → ۸)
 * خواندن ردیف‌ها ضده N+1: واریانت‌ها/محصولات/تصاویر با batch-IN واکشی می‌شوند
 * (WHERE id IN (?,?…) — یک دستور برای همه ردیف‌ها؛ اثبات: ۱ و ۲ کالا هر دو ۱۰).
 */

export const DEVICE_COOKIE = 'pars_device';
/** هدر جایگزین هویت دستگاه — وقتی مرورگر کوکی را در iframe بین‌سایتی ارسال نمی‌کند */
export const DEVICE_HEADER = 'x-pars-device';
/** هدر پاسخ برای Adoption هویت جدید توسط کلاینت (localStorage) */
export const DEVICE_ECHO_HEADER = 'x-pars-device';
const DEVICE_MAX_AGE = 60 * 60 * 24 * 180; // ۱۸۰ روز
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** آیا درخواست از مبدأ HTTPS آمده؟ (پشت Caddy — X-Forwarded-Proto) */
const isHttps = isHttpsRequest;

/**
 * گزینه‌های کوکی هویت — تابع است نه ثابت (رفع خالی‌شدن سبد در iframe):
 * روی HTTPS باید SameSite=None+Secure باشد تا مرورگر کوکی را در iframe
 * بین‌سایتی (پیش‌نمایش/PWA embedded) هم بفرستد؛ SameSite=Lax در آن حالت
 * هرگز همراه fetch نمی‌آید → هر درخواست دستگاه «جدید» با سبد خالی می‌سازد.
 * روی HTTP محلی Lax می‌ماند (None بدون Secure از مرورگر رد می‌شود).
 */
export function deviceCookieOptions(req?: NextRequest) {
  const https = isHttps(req);
  return {
    httpOnly: true,
    sameSite: (https ? 'none' : 'lax') as 'none' | 'lax',
    secure: https || process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEVICE_MAX_AGE,
  };
}

/**
 * تعیین هویت دستگاه مهمان — ترتیب اعتماد:
 * ۱) هدر x-pars-device (کلاینت از localStorage می‌فرستد — تنها هویتی که
 *    حتی با بلاک شدن کامل کوکی ثالث در iframe/Safari باقی می‌ماند)
 * ۲) کوکی pars_device (سازگار با کاربران فعلی)
 * ۳) مقدار جدید — کلاینت از هدر پاسخ آن را می‌گیرد و ذخیره می‌کند
 * UUID v4 نامصرّف ۱۲۲-بیتی است؛ حدس‌زدنی نیست (همان سطح اعتماد کوکی).
 */
export function resolveDeviceId(req: NextRequest): { deviceId: string; isNew: boolean } {
  const header = req.headers.get(DEVICE_HEADER);
  if (header && UUID_RE.test(header)) {
    return { deviceId: header, isNew: false };
  }
  const cookie = req.cookies.get(DEVICE_COOKIE)?.value;
  if (cookie && UUID_RE.test(cookie)) {
    return { deviceId: cookie, isNew: false };
  }
  return { deviceId: crypto.randomUUID(), isNew: true };
}

/**
 * ست کردن هویت روی پاسخ — هم کوکی (مسیر عادی) هم هدر قابل‌خواندن برای
 * کلاینت (وقتی کوکی بلاک است، Adoption از هدر تنها راه حفظ هویت است).
 */
export function applyDeviceIdentity(
  res: import('next/server').NextResponse,
  deviceId: string,
  req?: NextRequest
): void {
  res.cookies.set(DEVICE_COOKIE, deviceId, deviceCookieOptions(req));
  res.headers.set(DEVICE_ECHO_HEADER, deviceId);
}

// ------------------------------------------------------------
// DTOها — شکل قراردادی مشترک با کلاینت
// ------------------------------------------------------------

export interface CartLineDTO {
  /** شناسه ردیف CartItem — کلید PATCH/DELETE */
  id: string;
  productId: string;
  variantId: string;
  slug: string;
  title: string;
  image: string | null;
  weightGrams: number;
  /** قیمت معتبر فعلی از دیتابیس — تنها مبنای محاسبه */
  unitPriceToman: number;
  compareAtPriceToman: number | null;
  quantity: number;
  stock: number;
  /** خط = unitPriceToman × quantity — محاسبه سمت سرور */
  lineTotalToman: number;
  /** false → این ردیف در مبالغ تسویه حساب نمی‌آید (غیرفعال/حذف‌شده از فروشگاه) */
  isPurchasable: boolean;
  isWholesale: boolean;
  minWeightGrams?: number;
  pricePerKgToman?: number | null;
}

export type CartWarningType = 'PRICE_CHANGED' | 'STOCK_SHORTAGE' | 'UNAVAILABLE';

export interface CartWarning {
  type: CartWarningType;
  message: string;
  slug?: string;
  title?: string;
}

export interface CartTotals {
  /** تعداد ردیف‌های قابل خرید */
  itemCount: number;
  totalQuantity: number;
  subtotalToman: number;
  deliveryToman: number;
  freeShipping: boolean;
  /** مبلغ باقی‌مانده تا ارسال رایگان — صفر اگر واجد شرط یا سبد خالی */
  remainingForFreeShippingToman: number;
  minOrderToman: number;
  meetsMinOrder: boolean;
  totalPayableToman: number;
  /** هزینه استاندارد ارسال از Setting — برای نمایش خط‌خورده در حالت رایگان */
  standardDeliveryToman: number;
}

export interface CartDTO {
  /** شناسه سبد سرور — کلاینت تغییر آن را = گم‌شدن هویت دستگاه تفسیر می‌کند */
  cartId: string;
  items: CartLineDTO[];
  warnings: CartWarning[];
  totals: CartTotals;
}

// ------------------------------------------------------------
// تنظیمات ارسال — هر بار خواندن کامل (۵ کوئری کلیدی را با ردیف‌ها موازی می‌کنیم)
// ------------------------------------------------------------

const DEFAULT_FREE_SHIPPING = 1_500_000;
const DEFAULT_DELIVERY_FEE = 49_000;
const DEFAULT_MIN_ORDER = 300_000;

async function cartPricingRole(cartId: string): Promise<string | undefined> {
  const cart = await db.cart.findUnique({ where: { id: cartId }, select: { user: { select: { role: true } } } });
  return cart?.user?.role;
}

async function readDeliverySettings() {
  const rows = await db.setting.findMany({
    where: {
      key: { in: ['freeShippingThresholdToman', 'deliveryFeeToman', 'minOrderToman'] },
    },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const num = (k: string, fallback: number) => {
    const v = map.get(k);
    return v !== undefined && Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  return {
    freeShippingThreshold: num('freeShippingThresholdToman', DEFAULT_FREE_SHIPPING),
    deliveryFee: num('deliveryFeeToman', DEFAULT_DELIVERY_FEE),
    minOrder: num('minOrderToman', DEFAULT_MIN_ORDER),
  };
}

// ------------------------------------------------------------
// هسته خواندن — ۵ دستور ثابت (ضد N+1: واکشی دسته‌ای IN)
// ------------------------------------------------------------

export async function getCartData(cartId: string): Promise<CartDTO> {
  const [rows, settings, role] = await Promise.all([
    db.cartItem.findMany({
      where: { cartId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        quantity: true,
        requestedWeightGrams: true,
        variant: {
          select: {
            id: true,
            weightGrams: true,
            priceToman: true,
            isWholesale: true,
            pricePerKgToman: true,
            compareAtPriceToman: true,
            stock: true,
            isActive: true,
            product: {
              select: {
                id: true,
                slug: true,
                title: true,
                isActive: true,
                images: {
                  select: { url: true, alt: true },
                  orderBy: { sortOrder: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    }),
    readDeliverySettings(),
    cartPricingRole(cartId),
  ]);

  const items: CartLineDTO[] = [];
  const warnings: CartWarning[] = [];

  for (const row of rows) {
    const v = row.variant;
    const authorized = !v.isWholesale || role === 'PARTNER';
    const requestedWeight = v.isWholesale ? row.requestedWeightGrams ?? v.weightGrams : v.weightGrams;
    const weightValid = !v.isWholesale || requestedWeight >= v.weightGrams;
    const unitPrice = v.isWholesale ? Math.round((v.pricePerKgToman ?? 0) * requestedWeight / 1000) : v.priceToman;
    const quantity = v.isWholesale ? 1 : row.quantity;
    const purchasable = authorized && weightValid && v.isActive && v.product.isActive && v.stock > 0;

    if (!authorized) {
      warnings.push({ type: 'UNAVAILABLE', message: 'خرید این بسته فقط برای همکار تأییدشده فعال است؛ آن را از سبد حذف کنید.', slug: v.product.slug, title: v.product.title });
    } else if (!weightValid) {
      warnings.push({ type: 'UNAVAILABLE', message: 'حداقل وزن خرید عمده تغییر کرده است؛ وزن را اصلاح کنید.', slug: v.product.slug, title: v.product.title });
    } else if (!v.isActive || !v.product.isActive) {
      warnings.push({
        type: 'UNAVAILABLE',
        message: `«${v.product.title}» فعلاً قابل خرید نیست و در تسویه حساب محاسبه نمی‌شود.`,
        slug: v.product.slug,
        title: v.product.title,
      });
    } else if (v.stock === 0) {
      warnings.push({
        type: 'UNAVAILABLE',
        message: `«${v.product.title}» (${Math.round(v.weightGrams)} گرم) موقتاً ناموجود است.`,
        slug: v.product.slug,
        title: v.product.title,
      });
    } else if ((v.isWholesale ? requestedWeight : row.quantity) > v.stock) {
      warnings.push({
        type: 'STOCK_SHORTAGE',
        message: v.isWholesale ? `موجودی عمدهٔ «${v.product.title}» ${v.stock / 1000} کیلوگرم است؛ وزن را کاهش دهید.` : `فقط ${v.stock} عدد از «${v.product.title}» موجود است — تعداد را کاهش دهید.`,
        slug: v.product.slug,
        title: v.product.title,
      });
    }

    items.push({
      id: row.id,
      productId: v.product.id,
      variantId: v.id,
      slug: v.product.slug,
      title: v.product.title,
      image: v.product.images[0]?.url ?? null,
      weightGrams: requestedWeight,
      unitPriceToman: authorized ? unitPrice : 0,
      compareAtPriceToman: authorized ? v.compareAtPriceToman : null,
      quantity,
      stock: v.stock,
      lineTotalToman: purchasable ? unitPrice * quantity : 0,
      isPurchasable: purchasable,
      isWholesale: v.isWholesale,
      minWeightGrams: v.isWholesale ? v.weightGrams : undefined,
      pricePerKgToman: authorized && v.isWholesale ? v.pricePerKgToman : undefined,
    });
  }

  // مبالغ فقط از ردیف‌های قابل خرید — صحیح تومان
  const purchasableItems = items.filter((i) => i.isPurchasable);
  const subtotalToman = purchasableItems.reduce((s, i) => s + i.lineTotalToman, 0);
  const totalQuantity = purchasableItems.reduce((s, i) => s + i.quantity, 0);

  const freeShipping =
    subtotalToman >= settings.freeShippingThreshold && subtotalToman > 0;
  const deliveryToman =
    subtotalToman === 0 || freeShipping ? 0 : settings.deliveryFee;

  return {
    cartId,
    items,
    warnings,
    totals: {
      itemCount: purchasableItems.length,
      totalQuantity,
      subtotalToman,
      deliveryToman,
      freeShipping,
      remainingForFreeShippingToman: freeShipping
        ? 0
        : Math.max(0, settings.freeShippingThreshold - subtotalToman),
      minOrderToman: settings.minOrder,
      meetsMinOrder: subtotalToman >= settings.minOrder,
      totalPayableToman: subtotalToman + deliveryToman,
      standardDeliveryToman: settings.deliveryFee,
    },
  };
}

// ------------------------------------------------------------
// سبد مالک — کاربر واردشده یا دستگاه مهمان
// ------------------------------------------------------------

export async function getOrCreateCartId(deviceId: string): Promise<string> {
  const cart = await db.cart.upsert({
    where: { deviceId },
    create: { deviceId },
    update: {},
    select: { id: true },
  });
  return cart.id;
}

export async function getOrCreateCartIdByUser(userId: string): Promise<string> {
  const cart = await db.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });
  return cart.id;
}

/**
 * تعیین مالک سبد از روی درخواست:
 * کاربر واردشده (کوکی نشست) → سبد کاربر؛ در غیر این صورت سبد دستگاه مهمان.
 * Expected queries: نشست معتبر ۲ (نشست ۱ + upsert سبد ۱)؛ مهمان ۱ (بدون کوکی نشست
 * هیچ کوئری نشستی زده نمی‌شود).
 */
export async function resolveCart(req: NextRequest): Promise<{
  cartId: string;
  /** فقط برای مهمان — برای Set کردن کوکی pars_device در صورت جدید بودن */
  deviceId: string | null;
  isNewDevice: boolean;
}> {
  const user = await getSessionUser(req);
  if (user) {
    return {
      cartId: await getOrCreateCartIdByUser(user.id),
      deviceId: null,
      isNewDevice: false,
    };
  }
  const { deviceId, isNew } = resolveDeviceId(req);
  return { cartId: await getOrCreateCartId(deviceId), deviceId, isNewDevice: isNew };
}

// ------------------------------------------------------------
// افزودن کالا — با تشخیص تغییر قیمت و سقف موجودی
// ------------------------------------------------------------

const MAX_QTY = 20;

export async function addItem(
  cartId: string,
  input: {
    productId: string;
    variantId: string;
    quantity: number;
    expectedUnitPriceToman?: number;
    weightGrams?: number;
  }
): Promise<CartDTO> {
  const role = await cartPricingRole(cartId);
  // ۱) واریانت + محصول — منبع حقیقت
  const variant = await db.productVariant.findUnique({
    where: { id: input.variantId },
    select: {
      id: true,
      productId: true,
      priceToman: true,
      isWholesale: true,
      pricePerKgToman: true,
      weightGrams: true,
      stock: true,
      isActive: true,
      product: { select: { id: true, isActive: true, title: true } },
    },
  });

  if (
    !variant ||
    !variant.isActive ||
    !variant.product.isActive ||
    variant.productId !== input.productId
  ) {
    throw new ApiError(400, 'UNAVAILABLE', 'این کالا فعلاً قابل خرید نیست');
  }
  if (variant.stock === 0) {
    throw new ApiError(400, 'STOCK_EMPTY', 'این وزن موقتاً ناموجود است');
  }
  if (variant.isWholesale && role !== 'PARTNER') {
    throw new ApiError(403, 'PARTNER_REQUIRED', 'این بسته فقط برای همکار تأییدشده قابل خرید است');
  }

  // ۲) ردیف موجود؟ (unique cartId+variantId) — افزایش تدریجی با سقف موجودی
  const existing = await db.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId: input.variantId } },
    select: { id: true, quantity: true, requestedWeightGrams: true },
  });

  // تشخیص «سبد تازه» — اولین کالای سبد خالی → رویداد سبد جدید برای مدیرها
  // (هیچ اعلانی برای هر افزودنِ بعدی زده نمی‌شود — ضد اسپم)
  const isNewCartActivity =
    !existing && (await db.cartItem.count({ where: { cartId } })) === 0;

  const warnings: CartWarning[] = [];

  if (variant.isWholesale) {
    const incomingWeight = input.weightGrams ?? variant.weightGrams;
    if (input.quantity !== 1 || incomingWeight < variant.weightGrams) throw new ApiError(400, 'MIN_WHOLESALE_WEIGHT', 'وزن خرید باید حداقل وزن عمدهٔ محصول باشد');
    const totalWeight = (existing?.requestedWeightGrams ?? (existing ? variant.weightGrams : 0)) + incomingWeight;
    if (totalWeight > variant.stock || totalWeight > 1_000_000) throw new ApiError(400, 'STOCK_SHORTAGE', 'موجودی عمده برای این وزن کافی نیست');
    if (Math.round((variant.pricePerKgToman ?? 0) * totalWeight / 1000) > 2_000_000_000) throw new ApiError(400, 'AMOUNT_LIMIT', 'مبلغ این وزن بیش از حد مجاز است');
    await db.cartItem.upsert({ where: { cartId_variantId: { cartId, variantId: variant.id } }, create: { cartId, productId: input.productId, variantId: variant.id, quantity: 1, requestedWeightGrams: totalWeight }, update: { quantity: 1, requestedWeightGrams: totalWeight } });
    return getCartData(cartId);
  }

  // تشخیص تغییر قیمت — فقط راهنما، هرگز در محاسبه استفاده نمی‌شود
  if (
    input.expectedUnitPriceToman !== undefined &&
    input.expectedUnitPriceToman !== variant.priceToman
  ) {
    warnings.push({
      type: 'PRICE_CHANGED',
      message: 'قیمت این کالا به‌روزرسانی شد.',
      title: variant.product.title,
    });
  }

  const requested = existing ? existing.quantity + input.quantity : input.quantity;
  const finalQty = Math.min(requested, variant.stock, MAX_QTY);
  if (finalQty < requested) {
    warnings.push({
      type: 'STOCK_SHORTAGE',
      message: `بیشتر از ${finalQty} عدد از «${variant.product.title}» در انبار نیست.`,
      title: variant.product.title,
    });
  }

  if (existing) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: finalQty } });
  } else {
    await db.cartItem.create({
      data: {
        cartId,
        productId: input.productId,
        variantId: input.variantId,
        quantity: finalQty,
      },
    });
  }

  // اعلان «سبد خرید جدید» برای مدیرها — فقط اولین کالای سبد خالی؛ fire-and-forget
  if (isNewCartActivity && finalQty > 0) {
    void notifyAdmins({
      type: 'CART_NEW',
      title: 'سبد خرید جدید شروع شد',
      body: `یک مشتری «${variant.product.title}» را به سبد اضافه کرد`,
    });
  }

  const cart = await getCartData(cartId);
  return { ...cart, warnings: [...warnings, ...cart.warnings] };
}

// ------------------------------------------------------------
// تغییر تعداد ردیف — سقف موجودی؛ ردیف متعلق به «همین سبد» باشد (ضد IDOR)
// ------------------------------------------------------------

export async function updateItem(
  cartId: string,
  itemId: string,
  quantity: number | undefined,
  weightGrams?: number
): Promise<CartDTO> {
  const item = await db.cartItem.findFirst({
    where: { id: itemId, cartId },
    select: {
      id: true,
      quantity: true,
      variant: {
        select: {
          stock: true,
          isWholesale: true,
          weightGrams: true,
          pricePerKgToman: true,
          isActive: true,
          product: { select: { isActive: true, title: true } },
        },
      },
    },
  });
  if (!item) throw ApiError.notFound('ردیف سبد یافت نشد');
  if (!item.variant.isActive || !item.variant.product.isActive) {
    throw new ApiError(400, 'UNAVAILABLE', 'این کالا فعلاً قابل خرید نیست');
  }

  if (item.variant.isWholesale) {
    if (await cartPricingRole(cartId) !== 'PARTNER') throw new ApiError(403, 'PARTNER_REQUIRED', 'حساب همکار فعال نیست');
    if (!weightGrams || weightGrams < item.variant.weightGrams) throw new ApiError(400, 'MIN_WHOLESALE_WEIGHT', 'وزن کمتر از حداقل خرید عمده است');
    if (weightGrams > item.variant.stock) throw new ApiError(400, 'STOCK_SHORTAGE', 'این وزن در انبار موجود نیست');
    if (Math.round((item.variant.pricePerKgToman ?? 0) * weightGrams / 1000) > 2_000_000_000) throw new ApiError(400, 'AMOUNT_LIMIT', 'مبلغ بیش از حد مجاز است');
    await db.cartItem.update({ where: { id: item.id }, data: { quantity: 1, requestedWeightGrams: weightGrams } });
    return getCartData(cartId);
  }
  if (quantity === undefined) throw new ApiError(400, 'VALIDATION', 'تعداد بسته را وارد کنید');

  const warnings: CartWarning[] = [];
  const finalQty = Math.min(quantity, item.variant.stock, MAX_QTY);
  if (finalQty < quantity) {
    warnings.push({
      type: 'STOCK_SHORTAGE',
      message: `بیشتر از ${finalQty} عدد از «${item.variant.product.title}» در انبار نیست.`,
      title: item.variant.product.title,
    });
  }

  await db.cartItem.update({ where: { id: item.id }, data: { quantity: finalQty } });
  const cart = await getCartData(cartId);
  return { ...cart, warnings: [...warnings, ...cart.warnings] };
}

// ------------------------------------------------------------
// حذف ردیف — deleteMany با شرط مالکیت در همان دستور (ضد IDOR)
// ------------------------------------------------------------

export async function removeItem(
  cartId: string,
  itemId: string
): Promise<CartDTO> {
  const removed = await db.cartItem.deleteMany({ where: { id: itemId, cartId } });
  if (removed.count === 0) throw ApiError.notFound('ردیف سبد یافت نشد');
  return getCartData(cartId);
}

// ------------------------------------------------------------
// ادغام سبد مهمان با سبد کاربر — پس از ورود OTP (فاز ۹)
// ------------------------------------------------------------

/**
 * ادغام ردیف‌های سبد دستگاه مهمان در سبد کاربر و حذف سبد مهمان.
 * - سبد کاربر همیشه ساخته می‌شود (حتی بدون سبد مهمان) — return: cartId کاربر
 * - ردیف‌های ناموجود/غیرفعال حین ادغام حذف می‌شوند (فقط قابل‌خریدها)
 * - سقف هر ردیف: min(جمع دو سبد, موجودی, MAX_QTY)
 *
 * Expected queries: کاربر ۱ + سبد مهمان با ردیف‌ها ۱ + ردیف‌های کاربر ۱ +
 * واریانت‌های IN ۱ + حداکثر ۳ دستور برای هر ردیف (upsert) + حذف سبد مهمان ۱.
 * نوشتن‌ها به‌ازای هر ردیف است (سقف = اندازه سبد مهمان ≤ ۲۰) — خواندن‌ها ثابت.
 */
export async function mergeGuestCart(
  userId: string,
  deviceId: string | null
): Promise<string> {
  const userCartId = await getOrCreateCartIdByUser(userId);
  if (!deviceId) return userCartId;

  const deviceCart = await db.cart.findUnique({
    where: { deviceId },
    select: {
      id: true,
      items: { select: { productId: true, variantId: true, quantity: true } },
    },
  });
  if (!deviceCart) return userCartId;
  if (deviceCart.items.length === 0) {
    await db.cart.delete({ where: { id: deviceCart.id } });
    return userCartId;
  }

  const [userItems, variants] = await Promise.all([
    db.cartItem.findMany({
      where: { cartId: userCartId },
      select: { variantId: true, quantity: true },
    }),
    db.productVariant.findMany({
      where: {
        id: { in: deviceCart.items.map((i) => i.variantId) },
        isWholesale: false,
        isActive: true,
        stock: { gt: 0 },
        product: { isActive: true },
      },
      select: { id: true, stock: true },
    }),
  ]);

  const userQty = new Map(userItems.map((i) => [i.variantId, i.quantity]));
  const stockMap = new Map(variants.map((v) => [v.id, v.stock]));

  for (const item of deviceCart.items) {
    const stock = stockMap.get(item.variantId);
    if (stock === undefined) continue; // ناموجود/غیرفعال — از ادغام حذف می‌شود
    const target = Math.min(
      (userQty.get(item.variantId) ?? 0) + item.quantity,
      stock,
      MAX_QTY
    );
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId: userCartId, variantId: item.variantId } },
      create: {
        cartId: userCartId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: target,
      },
      update: { quantity: target },
    });
    userQty.set(item.variantId, target);
  }

  // سبد مهمان دیگر لازم نیست — حذف cascade ردیف‌ها
  await db.cart.delete({ where: { id: deviceCart.id } });
  return userCartId;
}

// ------------------------------------------------------------
// انتقال معکوس سبد کاربر به دستگاه — هنگام خروج (رفع خالی‌شدن سبد)
// ------------------------------------------------------------

/**
 * پیش از باطل‌کردن نشست، ردیف‌های سبد کاربر به سبد دستگاه برمی‌گردند تا
 * خروج/انقضای نشست سبد را پاک نکند (سبد کاربر پس از ورود، تنها مالکیت
 * داده است و سبد دستگاه حذف شده بود — بدون این انتقال، خروج = سبد خالی).
 * ردیف‌های ناموجود/غیرفعال منتقل نمی‌شوند؛ سقف هر ردیف min(موجودی, MAX_QTY).
 *
 * Expected queries: سبد کاربر با ردیف‌ها ۱ + ردیف‌های دستگاه ۱ +
 * واریانت‌های IN ۱ + حداکثر ۱ نوشتن به‌ازای هر ردیف + حذف سبد کاربر ۱.
 */
export async function exportUserCartToDevice(
  userId: string,
  deviceId: string
): Promise<void> {
  const userCart = await db.cart.findUnique({
    where: { userId },
    select: {
      id: true,
      items: { select: { productId: true, variantId: true, quantity: true } },
    },
  });
  if (!userCart || userCart.items.length === 0) return;

  const deviceCartId = await getOrCreateCartId(deviceId);
  if (deviceCartId === userCart.id) return; // همان سبد است — چیزی برای جابه‌جایی نیست

  const [deviceItems, variants] = await Promise.all([
    db.cartItem.findMany({
      where: { cartId: deviceCartId },
      select: { variantId: true, quantity: true },
    }),
    db.productVariant.findMany({
      where: {
        id: { in: userCart.items.map((i) => i.variantId) },
        isWholesale: false,
        isActive: true,
        stock: { gt: 0 },
        product: { isActive: true },
      },
      select: { id: true, stock: true },
    }),
  ]);

  const deviceQty = new Map(deviceItems.map((i) => [i.variantId, i.quantity]));
  const stockMap = new Map(variants.map((v) => [v.id, v.stock]));

  for (const item of userCart.items) {
    const stock = stockMap.get(item.variantId);
    if (stock === undefined) continue; // ناموجود/غیرفعال — منتقل نمی‌شود
    const target = Math.min(
      (deviceQty.get(item.variantId) ?? 0) + item.quantity,
      stock,
      MAX_QTY
    );
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId: deviceCartId, variantId: item.variantId } },
      create: {
        cartId: deviceCartId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: target,
      },
      update: { quantity: target },
    });
    deviceQty.set(item.variantId, target);
  }

  // Private wholesale packages stay in the account and never transfer to a guest device.
  await db.cartItem.deleteMany({ where: { cartId: userCart.id, variant: { isWholesale: false } } });
  if (await db.cartItem.count({ where: { cartId: userCart.id } }) === 0) {
    await db.cart.delete({ where: { id: userCart.id } });
  }
}
