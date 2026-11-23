import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import type { SessionUser } from '@/server/lib/auth';
import { BRAND } from '@/lib/config';
import type { AddressSnapshot } from '@/server/services/order.service';

/**
 * فاکتور چاپی A5 (درخواست کاربر — گزینه ۲)
 *
 * - دسترسی: مالک سفارش یا ادمین — سفارش دیگران برای مشتری 404 است (ضد IDOR)
 * - همهٔ مبالغ از snapshot لحظهٔ ثبت سفارش می‌آید؛ حذف محصول در آینده
 *   فاکتور تاریخی را نمی‌شکند
 * - مشخصات فروشگاه (سربرگ): برند از Setting + ثابت BRAND؛ نشانی پستی از
 *   کلیدهای store.address / store.postalCode پنل تنظیمات (خالی = بدون آن ردیف)
 * - بخش «از کی به کی»: فرستنده = فروشگاه، گیرنده = آدرس Snapshot سفارش
 *
 * Expected queries: ۲ (سفارش + تنظیمات سربرگ)
 */

export interface InvoiceStoreInfo {
  name: string;
  fullName: string;
  tagline: string;
  supportPhone: string;
  /** خالی = سربرگ بدون نشانی (ادمین هنوز پر نکرده) */
  address: string;
  postalCode: string;
  /** خالی = نشان پیش‌فرض «پ» */
  logoUrl: string;
}

export interface InvoiceItemDTO {
  id: string;
  productTitle: string;
  weightGrams: number;
  unitPriceToman: number;
  quantity: number;
  lineTotalToman: number;
  isWholesale: boolean;
  pricePerKgToman: number | null;
}

export interface InvoiceDTO {
  order: {
    id: string;
    code: string;
    status: string;
    createdAt: string;
    subtotalToman: number;
    discountToman: number;
    deliveryToman: number;
    totalToman: number;
    paymentMethod: string | null;
    paymentStatus: string;
    paidAt: string | null;
    paymentRef: string | null;
    paymentTrackId: string | null;
    trackingCode: string | null;
    shippingMethodName: string | null;
    shippingMethodEta: string | null;
    customerNote: string | null;
    customer: { fullName: string | null; phone: string };
    address: AddressSnapshot;
    items: InvoiceItemDTO[];
  };
  store: InvoiceStoreInfo;
  /** زمان تولید فاکتور — پاورقی «تاریخ چاپ» */
  printedAt: string;
}

/** هم‌راستا با پیش‌فرض پنل تنظیمات (settings.service) */
const DEFAULT_SUPPORT_PHONE = '02191008080';

const STORE_SETTING_KEYS = [
  'brand.name',
  'brand.fullName',
  'brand.tagline',
  'brand.logoUrl',
  'supportPhone',
  'store.address',
  'store.postalCode',
] as const;

/** سربرگ فروشگاه — Setting روی پیش‌فرض BRAND */
async function getStoreInfo(): Promise<InvoiceStoreInfo> {
  const rows = await db.setting.findMany({
    where: { key: { in: [...STORE_SETTING_KEYS] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const pick = (key: string, fallback = ''): string => {
    const v = map.get(key)?.trim();
    return v !== undefined && v !== '' ? v : fallback;
  };
  return {
    name: pick('brand.name', BRAND.name),
    fullName: pick('brand.fullName', BRAND.fullName),
    tagline: pick('brand.tagline', BRAND.tagline),
    supportPhone: pick('supportPhone', DEFAULT_SUPPORT_PHONE),
    address: pick('store.address'),
    postalCode: pick('store.postalCode'),
    logoUrl: pick('brand.logoUrl'),
  };
}

/** فاکتور سفارش برای مالک یا ادمین */
export async function getInvoiceForUser(user: SessionUser, code: string): Promise<InvoiceDTO> {
  const order = await db.order.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      userId: true,
      status: true,
      createdAt: true,
      subtotalToman: true,
      discountToman: true,
      deliveryToman: true,
      totalToman: true,
      paymentMethod: true,
      paymentStatus: true,
      paidAt: true,
      paymentRef: true,
      paymentTrackId: true,
      trackingCode: true,
      shippingMethodName: true,
      shippingMethodEta: true,
      customerNote: true,
      addressSnapshot: true,
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          productTitle: true,
          weightGrams: true,
          unitPriceToman: true,
          isWholesale: true,
          pricePerKgToman: true,
          quantity: true,
          lineTotalToman: true,
        },
      },
    },
  });

  // سفارش دیگران هم 404 — وجود سفارش فاش نمی‌شود (هم‌سو با getOrderForUser)
  if (!order || (user.role !== 'ADMIN' && order.userId !== user.id)) {
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

  const store = await getStoreInfo();

  return {
    order: {
      id: order.id,
      code: order.code,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      subtotalToman: order.subtotalToman,
      discountToman: order.discountToman,
      deliveryToman: order.deliveryToman,
      totalToman: order.totalToman,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paidAt: order.paidAt?.toISOString() ?? null,
      paymentRef: order.paymentRef,
      paymentTrackId: order.paymentTrackId,
      trackingCode: order.trackingCode,
      shippingMethodName: order.shippingMethodName,
      shippingMethodEta: order.shippingMethodEta,
      customerNote: order.customerNote,
      customer: {
        fullName: address.receiverName,
        phone: address.receiverPhone,
      },
      address,
      items: order.items.map((i) => ({
        id: i.id,
        productTitle: i.productTitle,
        weightGrams: i.weightGrams,
        unitPriceToman: i.unitPriceToman,
        isWholesale: i.isWholesale,
        pricePerKgToman: i.pricePerKgToman,
        quantity: i.quantity,
        lineTotalToman: i.lineTotalToman,
      })),
    },
    store,
    printedAt: new Date().toISOString(),
  };
}
