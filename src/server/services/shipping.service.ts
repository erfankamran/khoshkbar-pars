import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';

/**
 * سرویس ارسال پستی (فاز ۱۵)
 *
 * روش‌های ارسال در تنظیمات فروشگاه (کلید «shippingMethods») به‌صورت JSON
 * نگهداری می‌شوند و مدیر از پنل آن‌ها را ویرایش می‌کند. سفارش در لحظه ثبت،
 * نام و زمان تحویل روش انتخابی را Snapshot می‌کند تا گزارش‌های بعدی
 * به تنظیماتِ ممکن است تغییر کرده وابسته نمانند (بند ۱۶ مشخصات).
 */

export interface ShippingMethod {
  id: string;
  name: string;
  costToman: number;
  etaDays: string;
  enabled: boolean;
}

/** روش‌های پیش‌فرض — تا وقتی مدیر هنوز چیزی ذخیره نکرده است */
export const DEFAULT_SHIPPING_METHODS: ShippingMethod[] = [
  { id: 'pishtaz', name: 'پست پیشتاز', costToman: 49_000, etaDays: '۲ تا ۴ روز کاری', enabled: true },
  { id: 'sepordeh', name: 'پست سفارشی', costToman: 39_000, etaDays: '۳ تا ۷ روز کاری', enabled: true },
  { id: 'tipax', name: 'تیپاکس / چاپار', costToman: 89_000, etaDays: '۱ تا ۳ روز کاری', enabled: false },
];

const ID_RE = /^[a-z0-9-]{2,24}$/;

/** پارس امن JSON روش‌های ارسال — هر آیتم نامعتبر نادیده گرفته می‌شود */
export function parseShippingMethods(raw: string | null | undefined): ShippingMethod[] {
  if (!raw) return DEFAULT_SHIPPING_METHODS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SHIPPING_METHODS;
  }
  if (!Array.isArray(parsed)) return DEFAULT_SHIPPING_METHODS;

  const out: ShippingMethod[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const id = typeof m.id === 'string' ? m.id.trim() : '';
    const name = typeof m.name === 'string' ? m.name.trim() : '';
    const eta = typeof m.etaDays === 'string' ? m.etaDays.trim() : '';
    const cost = typeof m.costToman === 'number' ? m.costToman : Number(m.costToman);
    if (!ID_RE.test(id) || seen.has(id)) continue;
    if (name.length < 2 || name.length > 40) continue;
    if (eta.length < 2 || eta.length > 40) continue;
    if (!Number.isInteger(cost) || cost < 0 || cost > 5_000_000) continue;
    seen.add(id);
    out.push({ id, name, costToman: cost, etaDays: eta, enabled: m.enabled !== false });
  }
  return out.length > 0 ? out : DEFAULT_SHIPPING_METHODS;
}

/** اعتبارسنجی ورودی پنل — خروجی: رشته JSON آماده ذخیره؛ نامعتبر → 400 */
export function serializeShippingMethods(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError(400, 'VALIDATION', 'حداقل یک روش ارسال لازم است');
  }
  if (raw.length > 6) {
    throw new ApiError(400, 'VALIDATION', 'حداکثر ۶ روش ارسال مجاز است');
  }
  const seen = new Set<string>();
  const out: ShippingMethod[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      throw new ApiError(400, 'VALIDATION', 'ساختار روش ارسال نامعتبر است');
    }
    const m = item as Record<string, unknown>;
    const id = typeof m.id === 'string' ? m.id.trim() : '';
    const name = typeof m.name === 'string' ? m.name.trim() : '';
    const eta = typeof m.etaDays === 'string' ? m.etaDays.trim() : '';
    const cost = typeof m.costToman === 'number' ? m.costToman : Number(m.costToman);
    const enabled = m.enabled !== false;
    if (!ID_RE.test(id)) {
      throw new ApiError(400, 'VALIDATION', 'شناسه روش ارسال باید ۲ تا ۲۴ حرف لاتین کوچک، رقم یا خط تیره باشد');
    }
    if (seen.has(id)) {
      throw new ApiError(400, 'VALIDATION', `شناسه روش ارسال تکراری است: ${id}`);
    }
    if (name.length < 2 || name.length > 40) {
      throw new ApiError(400, 'VALIDATION', 'نام روش ارسال باید ۲ تا ۴۰ حرف باشد');
    }
    if (eta.length < 2 || eta.length > 40) {
      throw new ApiError(400, 'VALIDATION', 'زمان تحویل روش ارسال باید ۲ تا ۴۰ حرف باشد');
    }
    if (!Number.isInteger(cost) || cost < 0 || cost > 5_000_000) {
      throw new ApiError(400, 'VALIDATION', 'هزینه روش ارسال باید عدد صحیح ۰ تا ۵٬۰۰۰٬۰۰۰ تومان باشد');
    }
    seen.add(id);
    out.push({ id, name, costToman: cost, etaDays: eta, enabled });
  }
  return JSON.stringify(out);
}

export interface ShippingSettings {
  methods: ShippingMethod[];
  freeShippingThreshold: number;
  flatDeliveryFee: number;
}

/** خواندن تنظیمات ارسال — Expected queries: ۱ */
export async function getShippingSettings(): Promise<ShippingSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: ['shippingMethods', 'freeShippingThresholdToman', 'deliveryFeeToman'] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (raw: string | undefined, fallback: number) => {
    const v = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  return {
    methods: parseShippingMethods(map.get('shippingMethods')),
    freeShippingThreshold: num(map.get('freeShippingThresholdToman'), 1_500_000),
    flatDeliveryFee: num(map.get('deliveryFeeToman'), 49_000),
  };
}

export interface ResolvedShipping {
  /** هزینه نهایی ارسال سفارش (۰ = رایگان) */
  feeToman: number;
  /** نام روش برای Snapshot سفارش */
  methodName: string | null;
  /** زمان تحویل اعلام‌شده برای Snapshot سفارش */
  methodEta: string | null;
}

/**
 * حل هزینه ارسال برای ثبت سفارش:
 * - روش انتخابی معتبر و فعال → هزینه همان روش (آستانه رایگان still applies)
 * - روش نامعتبر/غیرفعال/بدون انتخاب → هزینه ثابت پایه (رفتار فازهای قبل)
 */
export function resolveShippingFee(
  settings: ShippingSettings,
  methodId: string | undefined,
  subtotalToman: number
): ResolvedShipping {
  const free = subtotalToman >= settings.freeShippingThreshold && subtotalToman > 0;
  const method = methodId
    ? settings.methods.find((m) => m.id === methodId && m.enabled)
    : undefined;
  if (method) {
    return {
      feeToman: free ? 0 : method.costToman,
      methodName: method.name,
      methodEta: method.etaDays,
    };
  }
  return {
    feeToman: free ? 0 : settings.flatDeliveryFee,
    methodName: null,
    methodEta: null,
  };
}
