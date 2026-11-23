import { revalidateStoreCache, CACHE_TAGS } from '@/server/lib/cache-tags';
import { randomInt, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import type { SessionUser } from '@/server/lib/auth';
import { getCartData } from '@/server/services/cart.service';
import { sendOrderConfirmation } from '@/server/services/notification.service';
import {
  notifyAdmins,
  notifyInbox,
} from '@/server/services/notification-center.service';
import { getShippingSettings, resolveShippingFee } from '@/server/services/shipping.service';
import {
  getPaymentConfig,
  paymentCallbackUrl,
  requestZibalPayment,
} from '@/server/services/payment.service';
import { jalaliOrderDate } from '@/lib/jalali';
import type { CreateOrderInput } from '@/server/validators/order.schema';

/**
 * سرویس سفارش (فاز ۹ — ثبت با Snapshot کامل قیمت، بند ۱۳ و ۱۶ مشخصات)
 *
 * قواعد حیاتی:
 * - مبالغ فقط از سبد سمت سرور (getCartData) که قیمت را از ProductVariant
 *   دیتابیس می‌خواند — قیمت/مبلغ ارسالی کلاینت هرگز استفاده نمی‌شود
 * - Snapshot کامل در OrderItem: عنوان محصول، وزن، قیمت واحد، قیمت قبل تخفیف،
 *   تعداد و جمع ردیف — حذف محصول در آینده سفارش تاریخی را نمی‌شکند
 * - کاهش موجودی + افزایش salesCount + پاک‌سازی سبد در یک تراکنش اتمیک
 * - پرداخت آنلاین در sandbox شبیه‌سازی می‌شود (paymentRef با پیشوند SANDBOX
 *   و برچسب «تستی» در UI) — اتصال درگاه واقعی خارج از محدوده فعلی است
 * - ضد IDOR: سفارش کاربر دیگر → 404 (وجود آن فاش نمی‌شود)
 *
 * Expected queries:
 *   POST /api/orders — خواندن: سبد کاربر ۱ + getCartData ۵ + تنظیمات فروش/پرداخت ۱ +
 *   تنظیمات ارسال ۱ + بررسی کد ~۱-۲ +
 *   تراکنش: سفارش ۱ + به‌ازای هر ردیف (آیتم ۱ + کاهش موجودی ۱ + salesCount ۱)
 *   + پاک‌سازی سبد ۱ — نوشتن‌ها به‌ازای ردیف‌ها inherent است (سقف ۲۰)
 *   GET /api/orders — ۵ (نشست ۲ + سفارش‌ها ۱ + آیتم‌ها IN ۱ + تصاویر IN ۱) — اندازه‌گیری‌شده
 *   GET /api/orders/[code] — ۶ (نشست ۲ + سفارش+آیتم‌ها ۲ + تصاویر IN ۱) — اندازه‌گیری‌شده
 */

const ORDERS_PAGE_SIZE = 10;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // بدون 0/O و 1/I

export interface AddressSnapshot {
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  postalCode?: string;
  fullAddress: string;
  /** پین نقشه اختیاری تحویل — از دفترچه آدرس کاربر (سفارش‌های قدیمی ندارند) */
  latitude?: number;
  longitude?: number;
}

export interface OrderItemDTO {
  id: string;
  productId: string;
  slug: string;
  productTitle: string;
  image: string | null;
  weightGrams: number;
  unitPriceToman: number;
  compareAtPriceToman: number | null;
  quantity: number;
  lineTotalToman: number;
  isWholesale: boolean;
  pricePerKgToman: number | null;
}

export interface OrderDTO {
  id: string;
  code: string;
  // PENDING_PAYMENT | PAID | PROCESSING | SHIPPED | DELIVERED | CANCELED
  status: string;
  subtotalToman: number;
  discountToman: number;
  deliveryToman: number;
  totalToman: number;
  // ONLINE_GATEWAY | COD — در سفارش‌های خیلی قدیمی ممکن است null باشد
  paymentMethod: string | null;
  // Snapshot روش ارسال پستی در لحظه ثبت (فاز ۱۵) — سفارش‌های قدیمی null
  shippingMethodName: string | null;
  shippingMethodEta: string | null;
  // UNPAID | PAID | FAILED | REFUNDED
  paymentStatus: string;
  paidAt: string | null;
  paymentRef: string | null;
  /** شناسه تراکنش درگاه (زیبال) — در درگاه واقعی پر می‌شود (فاز ۱۶) */
  paymentTrackId: string | null;
  trackingCode: string | null;
  customerNote: string | null;
  createdAt: string;
  address: AddressSnapshot;
  items: OrderItemDTO[];
}

export interface OrderSummaryDTO {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  totalToman: number;
  createdAt: string;
  itemCount: number;
  items: Array<{ productTitle: string; quantity: number; image: string | null }>;
}

export interface OrderListDTO {
  orders: OrderSummaryDTO[];
  page: number;
  hasMore: boolean;
}

// ------------------------------------------------------------
// کد خوانای سفارش — PARS-14050816-XXXX
// ------------------------------------------------------------

async function generateOrderCode(now: Date): Promise<string> {
  const datePart = jalaliOrderDate(now);
  for (let attempt = 0; attempt < 5; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    }
    const code = `PARS-${datePart}-${suffix}`;
    const exists = await db.order.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new ApiError(500, 'INTERNAL', 'تولید کد سفارش ناموفق بود');
}

// ------------------------------------------------------------
// ثبت سفارش از سبد کاربر
// ------------------------------------------------------------

export async function createOrderFromCart(
  user: SessionUser,
  input: CreateOrderInput,
  ctx?: { origin?: string }
): Promise<OrderDTO & { payment?: { startUrl: string; trackId: string } }> {
  revalidateStoreCache(CACHE_TAGS.HOME, CACHE_TAGS.FEED);
  // ۱) سبد کاربر — منبع حقیقت قیمت (۶ کوئری خواندن ثابت)
  const cart = await db.cart.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!cart) {
    throw new ApiError(400, 'CART_EMPTY', 'سبد خرید شما خالی است');
  }
  const cartData = await getCartData(cart.id);

  if (cartData.items.length === 0 || cartData.totals.itemCount === 0) {
    throw new ApiError(400, 'CART_EMPTY', 'سبد خرید شما خالی است');
  }

  // ۲) اعتبارسنجی قابل‌خرید بودن — سفارش فقط با سبد کاملاً سالم
  const unavailable = cartData.items.filter((i) => !i.isPurchasable);
  if (unavailable.length > 0) {
    throw new ApiError(
      400,
      'CART_HAS_UNAVAILABLE',
      'برخی کالاها ناموجود شده‌اند — سبد را بررسی کنید'
    );
  }
  if (cartData.warnings.some((w) => w.type === 'STOCK_SHORTAGE')) {
    throw new ApiError(
      400,
      'STOCK_SHORTAGE',
      'موجودی برخی کالاها تغییر کرده است — سبد را به‌روزرسانی کنید'
    );
  }
  if (!cartData.totals.meetsMinOrder) {
    throw new ApiError(
      400,
      'MIN_ORDER',
      `حداقل مبلغ سفارش ${cartData.totals.minOrderToman.toLocaleString('en-US')} تومان است`
    );
  }

  // ۳) تنظیمات فروش و پرداخت (فاز ۱۵) — Expected queries: ۱
  //    storeOpen=false → ثبت سفارش جدید مسدود؛ روش پرداخت غیرفعال → 400
  const orderFlags = await db.setting.findMany({
    where: { key: { in: ['storeOpen', 'onlineGatewayEnabled', 'codEnabled'] } },
    select: { key: true, value: true },
  });
  const flagMap = new Map(orderFlags.map((r) => [r.key, r.value]));
  const flag = (key: string, fallback: boolean) => {
    const v = flagMap.get(key);
    return v === undefined ? fallback : v === 'true';
  };
  if (!flag('storeOpen', true)) {
    throw new ApiError(
      400,
      'STORE_CLOSED',
      'فروشگاه موقتاً بسته است — ثبت سفارش جدید در دسترس نیست'
    );
  }
  if (input.paymentMethod === 'ONLINE_GATEWAY' && !flag('onlineGatewayEnabled', true)) {
    throw new ApiError(400, 'PAYMENT_DISABLED', 'پرداخت آنلاین در حال حاضر غیرفعال است');
  }
  if (input.paymentMethod === 'COD' && !flag('codEnabled', true)) {
    throw new ApiError(400, 'PAYMENT_DISABLED', 'پرداخت در محل در حال حاضر غیرفعال است');
  }

  // ۴) هزینه ارسال — روش انتخابی مشتری یا هزینه پایه (فاز ۱۵) — Expected queries: ۱
  const shipping = await getShippingSettings();
  const resolved = resolveShippingFee(shipping, input.shippingMethodId, cartData.totals.subtotalToman);

  // ۵) مبالغ نهایی — فقط از محاسبه سرور
  const subtotalToman = cartData.totals.subtotalToman;
  const deliveryToman = resolved.feeToman;
  const totalToman = subtotalToman + deliveryToman;

  const now = new Date();
  const code = await generateOrderCode(now);
  const isOnline = input.paymentMethod === 'ONLINE_GATEWAY';

  // ۶) درگاه واقعی (فاز ۱۶) — نشست پرداخت «قبل از» ساخت سفارش ساخته می‌شود تا
  //    سفارشِ بدون trackId باقی نماند؛ شکست درگاه → 502 و سبد دست‌نخورده
  //    SANDBOX (پیش‌فرض) هیچ تماس شبکه‌ای ندارد و مثل قبل بلافاصله PAID می‌شود
  const paymentConfig = await getPaymentConfig();
  let zibalTrackId: string | null = null;
  let zibalStartUrl: string | null = null;
  if (isOnline && paymentConfig.real) {
    if (paymentConfig.provider !== 'ZIBAL') {
      throw new ApiError(
        400,
        'GATEWAY_NOT_CONFIGURED',
        'این درگاه هنوز متصل نشده است — درگاه فعلی: زیبال (ZIBAL)'
      );
    }
    if (!paymentConfig.merchant) {
      throw new ApiError(
        400,
        'GATEWAY_NOT_CONFIGURED',
        'پیکربندی درگاه ناقص است — مرچنت کد را در تنظیمات فروشگاه وارد کنید (برای تست: zibal)'
      );
    }
    const pay = await requestZibalPayment({
      merchant: paymentConfig.merchant,
      orderCode: code,
      totalToman,
      callbackUrl: paymentCallbackUrl(ctx?.origin ?? '', code),
      mobile: input.address.receiverPhone,
    });
    zibalTrackId = pay.trackId;
    zibalStartUrl = pay.startUrl;
  }

  // ۷) تراکنش اتمیک: سفارش + آیتم‌های snapshot + کاهش موجودی + پاک‌سازی سبد
  const onlineInstantPaid = isOnline && !paymentConfig.real; // فقط SANDBOX
  const createdOrder = await db.$transaction(async (tx) => {
    if (cartData.items.some((item) => item.isWholesale)) {
      const currentUser = await tx.user.findUnique({ where: { id: user.id }, select: { role: true, isActive: true } });
      if (currentUser?.role !== 'PARTNER' || !currentUser.isActive) throw new ApiError(403, 'PARTNER_REQUIRED', 'وضعیت همکاری تغییر کرده است؛ سبد را دوباره بررسی کنید');
    }
    const order = await tx.order.create({
      data: {
        code,
        userId: user.id,
        // SANDBOX: پرداخت شبیه‌سازی‌شده → بلافاصله PAID؛ درگاه واقعی → PENDING_PAYMENT تا verify
        status: onlineInstantPaid ? 'PAID' : 'PENDING_PAYMENT',
        subtotalToman,
        discountToman: 0,
        deliveryToman,
        totalToman,
        addressSnapshot: JSON.stringify(input.address),
        // Snapshot روش ارسال در لحظه ثبت (بند ۱۶)
        shippingMethodName: resolved.methodName,
        shippingMethodEta: resolved.methodEta,
        paymentMethod: input.paymentMethod,
        paymentStatus: onlineInstantPaid ? 'PAID' : 'UNPAID',
        paidAt: onlineInstantPaid ? now : null,
        paymentRef: onlineInstantPaid
          ? `SANDBOX-${randomUUID().slice(0, 8).toUpperCase()}`
          : null,
        paymentTrackId: zibalTrackId,
        customerNote: input.customerNote ?? null,
      },
      select: { id: true },
    });

    for (const item of cartData.items) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.productId,
          variantId: item.variantId,
          // —— Snapshot های الزامی (بند ۱۶) ——
          productTitle: item.title,
          weightGrams: item.weightGrams,
          unitPriceToman: item.unitPriceToman,
          isWholesale: item.isWholesale,
          pricePerKgToman: item.isWholesale ? item.pricePerKgToman : null,
          compareAtPriceToman: item.compareAtPriceToman,
          quantity: item.quantity,
          lineTotalToman: item.lineTotalToman,
        },
      });
      // کاهش موجودی مشروط به کفافی — گارد TOCTOU: بررسی stock_shortage بالاتر
      // بیرون از تراکنش خوانده شده و در فاصلهٔ ثبت، سفارش موازی می‌تواند موجودی
      // را مصرف کند؛ شرط stock >= quantity در همان دستور کاهش، منفی‌شدن انبار و
      // فروش بیش از موجودی را ناممکن می‌کند (شکست → rollback کل تراکنش)
      const decremented = await tx.productVariant.updateMany({
        where: { id: item.variantId, stock: { gte: item.isWholesale ? item.weightGrams : item.quantity } },
        data: { stock: { decrement: item.isWholesale ? item.weightGrams : item.quantity } },
      });
      if (decremented.count === 0) {
        throw new ApiError(
          400,
          'STOCK_SHORTAGE',
          'موجودی برخی کالاها تغییر کرده است — سبد را به‌روزرسانی کنید'
        );
      }
      await tx.product.update({
        where: { id: item.productId },
        data: { salesCount: { increment: item.quantity } },
      });
    }

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return order;
  });

  // اعلان تأیید سفارش — fire-and-forget (فاز ۱۰)؛ هرگز پاسخ را مسدود یا خراب نمی‌کند
  sendOrderConfirmation(user.id, {
    code,
    totalToman,
    itemCount: cartData.totals.itemCount,
  });

  // —— مرکز اعلان‌ها (زنگوله) —— fire-and-forget؛ هرگز جریان ثبت سفارش را نمی‌شکند
  // مشتری: ردیف صندوق داخل‌اپ + مسیر عمیق به جزئیات سفارش
  void notifyInbox(user.id, {
    type: 'ORDER_NEW',
    title: 'سفارش شما ثبت شد',
    body: `سفارش ${code} شامل ${cartData.totals.itemCount.toLocaleString('fa-IR')} کالا به مبلغ ${totalToman.toLocaleString('fa-IR')} تومان ثبت شد`,
    url: `/?o=${code}`,
  });
  // مدیرها: رویداد سفارش جدید با مسیر پنل سفارش‌ها
  void notifyAdmins({
    type: 'ORDER_NEW',
    title: 'سفارش جدید ثبت شد',
    body: `سفارش ${code} شامل ${cartData.totals.itemCount.toLocaleString('fa-IR')} کالا به مبلغ ${totalToman.toLocaleString('fa-IR')} تومان ثبت شد`,
    url: `/admin/orders/${createdOrder.id}`,
  });

  const orderDto = await getOrderForUser(user, code);
  if (zibalStartUrl && zibalTrackId) {
    return { ...orderDto, payment: { startUrl: zibalStartUrl, trackId: zibalTrackId } };
  }
  return orderDto;
}

// ------------------------------------------------------------
// فهرست سفارش‌های کاربر
// ------------------------------------------------------------

export async function listOrdersForUser(
  user: SessionUser,
  page: number
): Promise<OrderListDTO> {
  const rows = await db.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * ORDERS_PAGE_SIZE,
    take: ORDERS_PAGE_SIZE + 1,
    select: {
      id: true,
      code: true,
      status: true,
      paymentStatus: true,
      totalToman: true,
      createdAt: true,
      items: {
        orderBy: { id: 'asc' },
        select: {
          productId: true,
          productTitle: true,
          quantity: true,
        },
      },
    },
  });

  const hasMore = rows.length > ORDERS_PAGE_SIZE;
  const orders = hasMore ? rows.slice(0, ORDERS_PAGE_SIZE) : rows;

  // تصاویر همه محصولات صفحه — یک دستور batch-IN (ضد N+1)
  const productIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productId)))];
  const images = productIds.length
    ? await db.productImage.findMany({
        where: { productId: { in: productIds } },
        orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }],
        select: { productId: true, url: true },
      })
    : [];
  const firstImageByProduct = new Map<string, string>();
  for (const img of images) {
    if (!firstImageByProduct.has(img.productId)) {
      firstImageByProduct.set(img.productId, img.url);
    }
  }

  return {
    page,
    hasMore,
    orders: orders.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totalToman: o.totalToman,
      createdAt: o.createdAt.toISOString(),
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      items: o.items.map((i) => ({
        productTitle: i.productTitle,
        quantity: i.quantity,
        image: firstImageByProduct.get(i.productId) ?? null,
      })),
    })),
  };
}

// ------------------------------------------------------------
// جزئیات سفارش — فقط مالک (ضد IDOR: ۴۰۴ برای سفارش دیگران)
// ------------------------------------------------------------

export async function getOrderForUser(
  user: SessionUser,
  code: string
): Promise<OrderDTO> {
  const order = await db.order.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      userId: true,
      status: true,
      subtotalToman: true,
      discountToman: true,
      deliveryToman: true,
      totalToman: true,
      paymentMethod: true,
      paymentStatus: true,
      paymentTrackId: true,
      shippingMethodName: true,
      shippingMethodEta: true,
      paidAt: true,
      paymentRef: true,
      trackingCode: true,
      customerNote: true,
      createdAt: true,
      addressSnapshot: true,
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          productId: true,
          productTitle: true,
          weightGrams: true,
          unitPriceToman: true,
          isWholesale: true,
          pricePerKgToman: true,
          compareAtPriceToman: true,
          quantity: true,
          lineTotalToman: true,
          product: { select: { slug: true, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } } } },
        },
      },
    },
  });

  // سفارش دیگران هم 404 — نه 403 (وجود سفارش فاش نمی‌شود)
  if (!order || order.userId !== user.id) {
    throw ApiError.notFound('سفارش یافت نشد');
  }

  let address: AddressSnapshot;
  try {
    address = JSON.parse(order.addressSnapshot) as AddressSnapshot;
  } catch {
    address = {
      receiverName: '',
      receiverPhone: '',
      province: '',
      city: '',
      fullAddress: order.addressSnapshot,
    };
  }

  return {
    id: order.id,
    code: order.code,
    status: order.status,
    subtotalToman: order.subtotalToman,
    discountToman: order.discountToman,
    deliveryToman: order.deliveryToman,
    totalToman: order.totalToman,
    paymentMethod: order.paymentMethod,
    shippingMethodName: order.shippingMethodName,
    shippingMethodEta: order.shippingMethodEta,
    paymentStatus: order.paymentStatus,
    paidAt: order.paidAt?.toISOString() ?? null,
    paymentRef: order.paymentRef,
    paymentTrackId: order.paymentTrackId,
    trackingCode: order.trackingCode,
    customerNote: order.customerNote,
    createdAt: order.createdAt.toISOString(),
    address,
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      slug: i.product.slug,
      productTitle: i.productTitle,
      image: i.product.images[0]?.url ?? null,
      weightGrams: i.weightGrams,
      unitPriceToman: i.unitPriceToman,
      isWholesale: i.isWholesale,
      pricePerKgToman: i.pricePerKgToman,
      compareAtPriceToman: i.compareAtPriceToman,
      quantity: i.quantity,
      lineTotalToman: i.lineTotalToman,
    })),
  };
}
