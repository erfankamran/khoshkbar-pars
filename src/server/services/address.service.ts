import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import type { SessionUser } from '@/server/lib/auth';
import type { SaveAddressInput } from '@/server/validators/address.schema';

/**
 * سرویس دفترچه آدرس (فاز ۱۰ — تسویه سریع‌تر در خریدهای بعدی)
 *
 * قواعد حیاتی:
 * - ضد IDOR: آدرس کاربر دیگر → 404 (وجود آن فاش نمی‌شود — همان الگوی سفارش)
 * - دقیقاً یک آدرس پیش‌فرض: اولین آدرس همیشه پیش‌فرض می‌شود؛ تنظیم پیش‌فرض
 *   جدید، پرچم قبلی را در همان تراکنش برمی‌دارد؛ حذف آدرس پیش‌فرض، تازه‌ترین
 *   آدرس باقی‌مانده را ارتقا می‌دهد (تسویه هرگز بدون پیش‌فرض نمی‌ماند)
 * - سقف آدرس: ۱۰ — دفترچه آدرس دفترچه‌ی سازمانی نیست؛ سقف کم، سوءاستفاده را می‌بندد
 * - آدرس در سفارش Snapshot می‌شود (بند ۱۳) — پس حذف آدرس سفارش قبلی را نمی‌شکند
 *
 * Expected queries (اندازه‌گیری‌شده در measure-queries.sh):
 *   GET  /api/addresses      — ۲-۳ (نشست ۲ + فهرست ۱)
 *   POST /api/addresses      — ۷ (نشست ۲ + شمارش ۱ + تراکنش BEGIN + برداشتن پیش‌فرض + درج + COMMIT)
 *   PUT  /api/addresses/[id] — ۶ (نشست ۲ + یافتن ۱ + تراکنش BEGIN + برداشتن پیش‌فرض + بروزرسانی + COMMIT)
 *   DELETE /api/addresses/[id] — ۷ (نشست ۲ + یافتن ۱ + تراکنش BEGIN + حذف + ارتقای جایگزین ۲ + COMMIT)
 */

const MAX_ADDRESSES = 10;

export interface AddressDTO {
  id: string;
  title: string;
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  postalCode: string | null;
  fullAddress: string;
  /** پین نقشه اختیاری — انتخاب کاربر روی نقشه تحویل (سفارش‌های قدیمی/آدرس بدون پین null) */
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

function toDTO(row: {
  id: string;
  title: string;
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  postalCode: string | null;
  fullAddress: string;
  /** نام ستون دیتابیس lat/lng است — DTO کلاینت latitude/longitude */
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
}): AddressDTO {
  return {
    id: row.id,
    title: row.title,
    receiverName: row.receiverName,
    receiverPhone: row.receiverPhone,
    province: row.province,
    city: row.city,
    postalCode: row.postalCode,
    fullAddress: row.fullAddress,
    latitude: row.lat,
    longitude: row.lng,
    isDefault: row.isDefault,
  };
}

// ------------------------------------------------------------
// خواندن
// ------------------------------------------------------------

/** GET /api/addresses — فهرست آدرس‌های کاربر (پیش‌فرض اول) */
export async function listAddresses(user: SessionUser): Promise<AddressDTO[]> {
  const rows = await db.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      receiverName: true,
      receiverPhone: true,
      province: true,
      city: true,
      postalCode: true,
      fullAddress: true,
      lat: true,
      lng: true,
      isDefault: true,
    },
  });
  return rows.map(toDTO);
}

// ------------------------------------------------------------
// نوشتن
// ------------------------------------------------------------

/** POST /api/addresses — افزودن آدرس */
export async function createAddress(
  user: SessionUser,
  input: SaveAddressInput
): Promise<AddressDTO> {
  const count = await db.address.count({ where: { userId: user.id } });
  if (count >= MAX_ADDRESSES) {
    throw new ApiError(400, 'ADDRESS_LIMIT', `حداکثر ${MAX_ADDRESSES} آدرس می‌توانید ذخیره کنید`);
  }
  // اولین آدرس همیشه پیش‌فرض است — کاربر تازه‌کار با آدرس خالی روبه‌رو نمی‌شود
  const makeDefault = count === 0 ? true : input.isDefault;

  const row = await db.$transaction(async (tx) => {
    if (makeDefault && count > 0) {
      await tx.address.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.address.create({
      data: {
        userId: user.id,
        title: input.title,
        receiverName: input.receiverName,
        receiverPhone: input.receiverPhone,
        province: input.province,
        city: input.city,
        postalCode: input.postalCode ?? null,
        fullAddress: input.fullAddress,
        // پین نقشه اختیاری — null یعنی کاربر موقعیت را روی نقشه انتخاب نکرده
        lat: input.latitude ?? null,
        lng: input.longitude ?? null,
        isDefault: makeDefault,
      },
      select: {
        id: true,
        title: true,
        receiverName: true,
        receiverPhone: true,
        province: true,
        city: true,
        postalCode: true,
        fullAddress: true,
        lat: true,
        lng: true,
        isDefault: true,
      },
    });
  });
  return toDTO(row);
}

/**
 * PUT /api/addresses/[id] — ویرایش آدرس (فقط مالک)
 * آدرس کاربر دیگر → 404
 */
export async function updateAddress(
  user: SessionUser,
  id: string,
  input: SaveAddressInput
): Promise<AddressDTO> {
  const existing = await db.address.findFirst({
    where: { id, userId: user.id },
    select: { id: true, isDefault: true },
  });
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'آدرس یافت نشد');
  }

  const row = await db.$transaction(async (tx) => {
    if (input.isDefault && !existing.isDefault) {
      await tx.address.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.address.update({
      where: { id },
      data: {
        title: input.title,
        receiverName: input.receiverName,
        receiverPhone: input.receiverPhone,
        province: input.province,
        city: input.city,
        postalCode: input.postalCode ?? null,
        fullAddress: input.fullAddress,
        lat: input.latitude ?? null,
        lng: input.longitude ?? null,
        isDefault: input.isDefault || existing.isDefault,
      },
      select: {
        id: true,
        title: true,
        receiverName: true,
        receiverPhone: true,
        province: true,
        city: true,
        postalCode: true,
        fullAddress: true,
        lat: true,
        lng: true,
        isDefault: true,
      },
    });
  });
  return toDTO(row);
}

/**
 * DELETE /api/addresses/[id] — حذف آدرس (فقط مالک)
 * اگر پیش‌فرض حذف شود، تازه‌ترین آدرس باقی‌مانده ارتقا می‌دهد
 */
export async function deleteAddress(user: SessionUser, id: string): Promise<{ deleted: true }> {
  const existing = await db.address.findFirst({
    where: { id, userId: user.id },
    select: { id: true, isDefault: true },
  });
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'آدرس یافت نشد');
  }

  await db.$transaction(async (tx) => {
    await tx.address.delete({ where: { id } });
    if (existing.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (next) {
        await tx.address.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  });
  return { deleted: true };
}
