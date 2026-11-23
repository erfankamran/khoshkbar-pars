/**
 * خرید سریع بر مبنای وزن هدف (فاز تجربه خرید وزنی)
 *
 * مشتری به جای «تعداد بسته» به وزن کل فکر می‌کند — «۵ کیلو می‌خواهم».
 * این ماژول برای هر وزن هدف بهترین ترکیب «بسته × تعداد» را از میان
 * واریانت‌های موجود پیدا می‌کند:
 *  - فقط بسته‌های موجود در انبار (stock > 0)
 *  - وزن هدف باید دقیقاً بر بسته بخش‌پذیر باشد (بدون باقی‌مانده)
 *  - بزرگ‌ترین بستهٔ ممکن انتخاب می‌شود (کم‌ترین تعداد بسته، سبک‌ترین سبد)
 *  - تعداد در سقف ۲۰ (همان سقف سرور validators/cart.schema) و موجودی جا شود
 *
 * بدون تغییر دیتابیس: نتیجه همان افزودن عادی به سبد با quantity است.
 */

/** سقف تعداد هر ردیف سبد — هم‌سخت با سقف سرور (MAX_QTY = 20) */
const MAX_PACKS = 20;

/** اهداف وزنی چیپ‌های خرید سریع (گرم) */
const QUICK_TARGETS = [1000, 2000, 5000];

export interface WeightPack {
  id: string;
  weightGrams: number;
  priceToman: number;
  compareAtPriceToman: number | null;
  stock: number;
}

export interface QuickPick {
  /** وزن هدف چیپ (گرم) — برچسب نمایشی با formatWeight */
  targetGrams: number;
  /** بسته انتخاب‌شده برای رسیدن به وزن هدف */
  variantId: string;
  /** چند بسته از آن واریانت */
  count: number;
}

/** بهترین ترکیب بسته×تعداد برای وزن هدف؛ هیچ ترکیبی ممکن نبود null */
function planQuickPick(
  targetGrams: number,
  packs: WeightPack[]
): QuickPick | null {
  let best: QuickPick | null = null;
  let bestPackGrams = 0;
  for (const v of packs) {
    if (v.stock <= 0) continue;
    if (v.weightGrams <= 0 || targetGrams % v.weightGrams !== 0) continue;
    const count = targetGrams / v.weightGrams;
    if (count > Math.min(v.stock, MAX_PACKS)) continue;
    if (v.weightGrams > bestPackGrams) {
      best = { targetGrams, variantId: v.id, count };
      bestPackGrams = v.weightGrams;
    }
  }
  return best;
}

/** چیپ‌های خرید سریع فعال برای این محصول (چیپ‌های نشدنی حذف می‌شوند) */
export function quickPicksFor(packs: WeightPack[]): QuickPick[] {
  return QUICK_TARGETS.map((t) => planQuickPick(t, packs)).filter(
    (p): p is QuickPick => p !== null
  );
}

/** سقف مجاز استپر برای یک بسته — کمینهٔ موجودی و سقف سرور */
export function maxQtyFor(pack: WeightPack | null): number {
  if (!pack) return 1;
  return Math.max(1, Math.min(pack.stock, MAX_PACKS));
}
