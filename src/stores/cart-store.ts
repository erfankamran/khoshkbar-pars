import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { apiDelete, apiGet, apiPatch, apiPost, ApiClientError } from '@/lib/api-client';

/**
 * سبد خرید فروشگاه پارس (فاز ۸ — همگام‌سازی سمت سرور)
 *
 * معماری:
 * - سرور «منبع حقیقت» قیمت و موجودی است؛ پاسخ هر درخواست سبد، کل State را
 *   جایگزین می‌کند (items/warnings/totals همه از سرور).
 * - نوشتن‌ها Optimistic هستند: تغییر آنیِ UI → درخواست → جایگزینی با پاسخ
 *   سرور → در صورت خطا refresh() برای بازگشت به حالت واقعی.
 * - نسخه محلی (persist) فقط برای «نمایش فوری بج و ردیف‌ها» پیش از اولین
 *   همگام‌سازی است؛ هرگز مبنای محاسبه قیمت نیست (بند ۱۳ مشخصات).
 * - سبد مهمان با کوکی HttpOnly pars_device شناسایی می‌شود (فاز ۹: ادغام با
 *   کاربر پس از ورود OTP).
 */

// ——— قرارداد سرور (CartDTO — src/server/services/cart.service.ts) ———

export interface CartLine {
  id: string;
  productId: string;
  variantId: string;
  slug: string;
  title: string;
  image: string | null;
  weightGrams: number;
  unitPriceToman: number;
  compareAtPriceToman: number | null;
  quantity: number;
  stock: number;
  lineTotalToman: number;
  isPurchasable: boolean;
  isWholesale?: boolean;
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
  itemCount: number;
  totalQuantity: number;
  subtotalToman: number;
  deliveryToman: number;
  freeShipping: boolean;
  remainingForFreeShippingToman: number;
  minOrderToman: number;
  meetsMinOrder: boolean;
  totalPayableToman: number;
  /** هزینه استاندارد ارسال از Setting — برای نمایش خط‌خورده در حالت رایگان */
  standardDeliveryToman: number;
}

export interface CartDTO {
  cartId: string;
  items: CartLine[];
  warnings: CartWarning[];
  totals: CartTotals;
}

// ——— ورودی افزودن (همان امضای قدیمی فاز ۶/۷ تا callers تغییر نکنند) ———

export interface AddToCartInput {
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  image?: string;
  weightGrams: number;
  /** قیمت نمایش‌داده‌شده در UI — فقط راهنمای تشخیص تغییر قیمت سرور */
  unitPrice: number;
  quantity: number;
  isWholesale?: boolean;
}

interface CartState extends Omit<CartDTO, 'cartId'> {
  /** شناسه سبد سرور — null تا اولین sync؛ تغییر آن = گم شدن هویت دستگاه */
  cartId: string | null;
  /** همگام‌سازی اولیه انجام شده؟ (پیش از آن بج از نسخه محلی نمایش داده می‌شود) */
  hydrated: boolean;
  /** در حال ارسال یک تغییر به سرور (برای قفل ورودی‌ها) */
  syncing: boolean;
  add: (input: AddToCartInput) => Promise<void>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  setWeight: (itemId: string, weightGrams: number) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  /** همگام‌سازی کامل با سرور — منبع حقیقت جایگزین می‌شود */
  refresh: () => Promise<void>;
  /** جایگزینی وضعیت با پاسخ سرور — پاسخ verify OTP (سبد ادغام‌شده فاز ۹) */
  applyServerCart: (cart: CartDTO) => void;
  /** فراخوانی پس از ثبت سفارش (فازهای بعد) */
  clear: () => void;
}
const EMPTY_TOTALS: CartTotals = {
  itemCount: 0,
  totalQuantity: 0,
  subtotalToman: 0,
  deliveryToman: 0,
  freeShipping: false,
  remainingForFreeShippingToman: 0,
  minOrderToman: 0,
  meetsMinOrder: false,
  totalPayableToman: 0,
  standardDeliveryToman: 0,
};

/** پیشوند id بهینه‌یستیک ردیفی که هنوز پاسخ سرور برایش نرسیده */
const LOCAL_ID_PREFIX = 'local-';

/**
 * تبدیل id محلی (`local-<variantId>`) به id واقعی سرور.
 * چرا؟ کاربر ممکن است بلافاصله پس از «افزودن» روی +/- یا حذف بزند — پیش از
 * آنکه پاسخ سرور جای state را بگیرد. درخواست با id محلی ۴۰۴ می‌شد (رفع race).
 * تا ۵ ثانیه (۲۰×۲۵۰ms) منتظر پاسخ add می‌ماند؛ اگر ردیف از سبد رفت null.
 */
async function resolveServerItemId(itemId: string): Promise<string> {
  if (!itemId.startsWith(LOCAL_ID_PREFIX)) return itemId;
  const variantId = itemId.slice(LOCAL_ID_PREFIX.length);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const row = useCartStore
      .getState()
      .items.find((i) => i.variantId === variantId);
    if (!row) break; // ردیف حذف شده — خطای طبیعی ۴۰۴ برگردد
    if (!row.id.startsWith(LOCAL_ID_PREFIX)) return row.id;
  }
  return itemId; // سرور پاسخ نداد — caller خطای CART_SYNC می‌دهد
}

/**
 * خودترمیمی سبد پس از گم‌شدن هویت دستگاه: ردیف‌های صادرشدهٔ سرور (نه
 * optimistic) دوباره POST می‌شوند؛ پاسخ آخرین درخواست، سبد کامل است.
 * خطاهای هر ردیف نادیده گرفته می‌شوند (کالای ناموجود از خود می‌افتد).
 * اگر هیچ ردیفی بازنگشت null — caller حالت خالی سرور را می‌پذیرد.
 */
async function healCartFromLocal(local: CartLine[]): Promise<CartDTO | null> {
  const rows = local
    .filter((i) => !i.isWholesale && i.isPurchasable && !i.id.startsWith(LOCAL_ID_PREFIX))
    .slice(0, 20);
  let last: CartDTO | null = null;
  for (const item of rows) {
    try {
      last = await apiPost<CartDTO>('/api/cart/items', {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      });
    } catch {
      /* ردیف بعدی — ردیف ناموجود/غیرفعال خودش حذف می‌شود */
    }
  }
  return last;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      cartId: null,
      items: [],
      warnings: [],
      totals: EMPTY_TOTALS,
      hydrated: false,
      syncing: false,

      // ——— افزودن: optimistic + POST → جایگزینی با پاسخ سرور ———
      add: async (input) => {
        // Optimistic — بج و ردیف‌ها آنی دیده می‌شوند
        if (!input.isWholesale) set((state) => {
          const existing = state.items.find(
            (i) => i.productId === input.productId && i.variantId === input.variantId
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === existing.id
                  ? { ...i, quantity: i.quantity + input.quantity }
                  : i
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                id: `local-${input.variantId}`,
                productId: input.productId,
                variantId: input.variantId,
                slug: input.slug,
                title: input.name,
                image: input.image ?? null,
                weightGrams: input.weightGrams,
                unitPriceToman: input.unitPrice,
                compareAtPriceToman: null,
                quantity: input.quantity,
                stock: 99,
                lineTotalToman: input.unitPrice * input.quantity,
                isPurchasable: true,
              },
            ],
          };
        });

        try {
          const cart = await apiPost<CartDTO>('/api/cart/items', {
            productId: input.productId,
            variantId: input.variantId,
            quantity: input.quantity,
            expectedUnitPriceToman: input.unitPrice,
            ...(input.isWholesale ? { weightGrams: input.weightGrams } : {}),
          });
          set({
            cartId: cart.cartId,
            items: cart.items,
            warnings: cart.warnings,
            totals: cart.totals,
            hydrated: true,
          });
        } catch (error) {
          // بازگشت به حالت واقعی سرور
          await get().refresh();
          if (error instanceof ApiClientError) throw error;
          throw new ApiClientError(0, 'CART_SYNC', 'افزودن به سبد ناموفق بود — دوباره تلاش کنید');
        }
      },

      // ——— تغییر تعداد: optimistic + PATCH ———
      setQuantity: async (itemId, quantity) => {
        const prev = get().items;
        set((state) => ({
          items: state.items.map((i) =>
            i.id === itemId
              ? { ...i, quantity, lineTotalToman: i.unitPriceToman * quantity }
              : i
          ),
        }));
        try {
          set({ syncing: true });
          // ردیف تازه‌افزوده هنوز id محلی دارد — تا رسیدن id واقعی سرور صبر
          const serverId = await resolveServerItemId(itemId);
          const cart = await apiPatch<CartDTO>(`/api/cart/items/${serverId}`, { quantity });
          set({ cartId: cart.cartId, items: cart.items, warnings: cart.warnings, totals: cart.totals });
        } catch {
          set({ items: prev }); // revert
          throw new ApiClientError(0, 'CART_SYNC', 'تغییر تعداد ناموفق بود');
        } finally {
          set({ syncing: false });
        }
      },

      setWeight: async (itemId, weightGrams) => {
        set({ syncing: true });
        try {
          const serverId = await resolveServerItemId(itemId);
          const cart = await apiPatch<CartDTO>(`/api/cart/items/${serverId}`, { weightGrams });
          set({ cartId: cart.cartId, items: cart.items, warnings: cart.warnings, totals: cart.totals });
        } finally { set({ syncing: false }); }
      },
      // ——— حذف: optimistic + DELETE ———
      remove: async (itemId) => {
        const prev = get().items;
        set((state) => ({ items: state.items.filter((i) => i.id !== itemId) }));
        try {
          set({ syncing: true });
          const serverId = await resolveServerItemId(itemId);
          const cart = await apiDelete<CartDTO>(`/api/cart/items/${serverId}`);
          set({ cartId: cart.cartId, items: cart.items, warnings: cart.warnings, totals: cart.totals });
        } catch {
          set({ items: prev });
          throw new ApiClientError(0, 'CART_SYNC', 'حذف کالا ناموفق بود');
        } finally {
          set({ syncing: false });
        }
      },

      // ——— همگام‌سازی کامل — GET منبع حقیقت ———
      refresh: async () => {
        try {
          const cart = await apiGet<CartDTO>('/api/cart');
          const local = get().items;

          // ——— خودترمیمی هویت گم‌شده (رفع خالی شدن خودبه‌خودی سبد) ———
          // اگر سرور سبد خالی داد ولی ما ردیف‌های صادرشدهٔ سرور داریم و
          // شناسهٔ سبد عوض شده، یعنی هویت دستگاه بین دو sync گم شده
          // (بلاک کوکی در iframe / پاک‌سازی کوکی) — اقلام به سرور معرفی
          // می‌شوند به‌جای آنکه بی‌صدا پاک شوند. اگر cartId همان قبلی است،
          // خالی بودن واقعی است (حذف در تب دیگر) و دست نمی‌زنیم.
          if (
            cart.items.length === 0 &&
            local.some((i) => !i.id.startsWith('local-')) &&
            (get().cartId === null || get().cartId !== cart.cartId)
          ) {
            const healed = await healCartFromLocal(local);
            if (healed) {
              set({
                cartId: healed.cartId,
                items: healed.items,
                warnings: healed.warnings,
                totals: healed.totals,
                hydrated: true,
              });
              return;
            }
          }

          set({
            cartId: cart.cartId,
            items: cart.items,
            warnings: cart.warnings,
            totals: cart.totals,
            hydrated: true,
          });
        } catch {
          // سرد بودن شبکه → نسخه محلی باقی می‌ماند؛ تلاش بعدی در بازدید سبد
        }
      },

      // ——— جایگزینی با پاسخ سرور (بدون درخواست جدید — فاز ۹) ———
      applyServerCart: (cart) =>
        set({
          cartId: cart.cartId,
          items: cart.items,
          warnings: cart.warnings,
          totals: cart.totals,
          hydrated: true,
        }),

      clear: () => set({ items: [], warnings: [], totals: EMPTY_TOTALS }),
    }),
    {
      name: 'pars:cart',
      storage: createJSONStorage(() => localStorage),
      // فقط داده نمایشی ذخیره می‌شود — وضعیت‌های گذرا نه؛ cartId برای
      // تشخیص گم‌شدن هویت سبد (شرط خودترمیمی refresh)
      partialize: (state) => ({
        cartId: state.cartId,
        items: state.items.filter((item) => !item.isWholesale),
        warnings: state.warnings,
        totals: state.items.some((item) => item.isWholesale) ? EMPTY_TOTALS : state.totals,
      }),
    }
  )
);

/**
 * تعداد اقلام سبد برای نمایش بج — فقط ردیف‌های قابل خرید.
 * چرا؟ ردیف غیرقابل‌خرید (ناموجود/غیرفعال) در مبالغ سرور هم حساب نمی‌شود
 * (totals.totalQuantity فقط purchasable است) — بج باید همان را نشان دهد
 * (اصلاح ریسک شناخته‌شده فاز ۸).
 */
export const selectCartCount = (state: CartState): number =>
  state.items.reduce(
    (sum, item) => sum + (item.isPurchasable ? item.quantity : 0),
    0
  );
