'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Minus, Plus, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice, formatWeight, toFaDigits } from '@/lib/fa';
import { useCartStore } from '@/stores/cart-store';
import { maxQtyFor, quickPicksFor, type QuickPick } from '@/components/product/weight-quick-picks';
import { cn } from '@/lib/utils';
import { WholesaleWeightPicker } from './WholesaleWeightPicker';
import { useWholesalePurchase } from '@/hooks/use-wholesale-purchase';

/**
 * جعبه خرید صفحه استاندارد محصول /p/[slug] (فاز ۱۳)
 *
 * - دقیقاً همان سبد سرور فروشگاه (useCartStore) — بدون کپی منطق قیمت
 * - انتخاب وزن + استپر تعداد بسته + چیپ‌های خرید سریع وزنی (۱/۲/۵ کیلو)
 *   → خرید وزن سنگین (مثلاً ۵ کیلو) در یک کلیک، بدون چندبار افزودن
 * - قیمت زندهٔ کل (تعداد × بسته) + بج تخفیف + هشدار موجودی
 * - پس از افزودن، کاربر با لینک به فروشگاه برمی‌گردد (سبد همان است)
 */

interface BuyBoxVariant {
  id: string;
  weightGrams: number;
  priceToman: number;
  compareAtPriceToman: number | null;
  stock: number;
  isWholesale?: boolean;
  pricePerKgToman?: number | null;
}

export function ProductBuyBox({
  productId,
  slug,
  title,
  imageUrl,
  variants,
}: {
  productId: string;
  slug: string;
  title: string;
  imageUrl?: string;
  variants: BuyBoxVariant[];
}) {
  const add = useCartStore((s) => s.add);

  const [selectedId, setSelectedId] = useState<string>(variants[0]?.id ?? '');
  const [packCount, setPackCount] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? variants[0] ?? null,
    [variants, selectedId]
  );

  const maxQty = maxQtyFor(selected);
  const purchase = useWholesalePurchase(selected);
  const quickPicks: QuickPick[] = useMemo(() => quickPicksFor(variants.filter((variant) => !variant.isWholesale)), [variants]);

  const selectPack = (variantId: string) => {
    setSelectedId(variantId);
    setPackCount(1); // تعویض بسته → شمارش از نو
  };

  const outOfStock = !selected || selected.stock < (selected.isWholesale ? selected.weightGrams : 1);
  const lowStock = !outOfStock && selected && !selected.isWholesale && selected.stock <= 5;
  const hasDiscount =
    !!selected?.compareAtPriceToman && selected.compareAtPriceToman > selected.priceToman;

  const handleAdd = async () => {
    if (!selected || outOfStock || adding || !purchase.valid) return;
    const qty = selected.isWholesale ? 1 : Math.max(1, Math.min(packCount, maxQty));
    setAdding(true);
    try {
      await add({
        productId,
        variantId: selected.id,
        slug,
        name: title,
        image: imageUrl,
        weightGrams: selected.isWholesale ? purchase.weight : selected.weightGrams,
        unitPrice: selected.isWholesale ? purchase.total : selected.priceToman,
        isWholesale: selected.isWholesale,
        quantity: qty,
      });
      const weightLabel =
        qty > 1
          ? `${formatWeight(selected.weightGrams)} × ${toFaDigits(qty)}`
          : formatWeight(selected.weightGrams);
      toast.success(`«${title}» (${weightLabel}) به سبد اضافه شد`);
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'افزودن به سبد ناموفق بود');
    } finally {
      setAdding(false);
    }
  };

  if (variants.length === 0) {
    return (
      <div className="mt-4 rounded-2xl bg-cream-100 p-4 text-center text-[12px] font-bold text-ink-400">
        این محصول فعلاً برای فروش فعال نیست
      </div>
    );
  }

  return (
    <div className="mt-4">
      {selected?.isWholesale && <WholesaleWeightPicker minimum={selected.weightGrams} stock={selected.stock} pricePerKg={selected.pricePerKgToman!} value={purchase.weight} onChange={purchase.setWeight} />}
      {/* ——— انتخاب وزن ——— */}
      <p className={cn('text-[11px] font-bold text-ink-500', selected?.isWholesale && 'hidden')}>انتخاب وزن بسته</p>
      <div className={cn('mt-2 flex flex-wrap gap-2', selected?.isWholesale && 'hidden')} role="radiogroup" aria-label="انتخاب وزن بسته">
        {variants.map((v) => {
          const active = selected?.id === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={v.stock === 0}
              onClick={() => selectPack(v.id)}
              className={cn(
                'rounded-xl border px-3 py-2 text-[11.5px] font-bold transition-colors',
                v.stock === 0
                  ? 'cursor-not-allowed border-cream-200 text-ink-300 line-through'
                  : active
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-cream-200 bg-white text-ink-700 hover:border-brand-300'
              )}
            >
              {formatWeight(v.weightGrams)}
            </button>
          );
        })}
      </div>

      {/* ——— تعداد بسته + خرید سریع وزنی ——— */}
      <div className={cn('mt-4 flex items-center justify-between gap-3', selected?.isWholesale && 'hidden')}>
        <div>
          <p className="text-[11px] font-bold text-ink-500">تعداد بسته</p>
          {selected && (
            <p className="mt-0.5 text-[10px] text-ink-400">
              {`جمع وزن: ${formatWeight(selected.weightGrams * packCount)}`}
            </p>
          )}
        </div>
        <div
          className="flex items-center gap-1 rounded-full border border-cream-200 bg-cream-50 p-1"
          role="group"
          aria-label="تعداد بسته"
        >
          <button
            type="button"
            onClick={() => setPackCount((q) => Math.max(1, q - 1))}
            disabled={outOfStock || packCount <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-600 shadow-card transition-transform active:scale-90 disabled:opacity-40"
            aria-label="کاهش تعداد بسته"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span
            className="min-w-8 text-center text-[15px] font-black tabular-nums text-ink-900"
            aria-live="polite"
          >
            {toFaDigits(packCount)}
          </span>
          <button
            type="button"
            onClick={() => setPackCount((q) => Math.min(maxQty, q + 1))}
            disabled={outOfStock || packCount >= maxQty}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-600 shadow-card transition-transform active:scale-90 disabled:opacity-40"
            aria-label="افزایش تعداد بسته"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {quickPicks.length > 0 && !outOfStock && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-bold text-ink-400">خرید سریع:</span>
          {quickPicks.map((qp) => {
            const active = selected?.id === qp.variantId && packCount === qp.count;
            return (
              <button
                key={qp.targetGrams}
                type="button"
                onClick={() => {
                  selectPack(qp.variantId);
                  setPackCount(qp.count);
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors',
                  active
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-cream-200 bg-white text-ink-700 hover:border-brand-300'
                )}
                aria-label={`خرید ${formatWeight(qp.targetGrams)} — ${toFaDigits(qp.count)} بسته`}
              >
                {formatWeight(qp.targetGrams)}
              </button>
            );
          })}
        </div>
      )}

      {/* ——— قیمت کل ——— */}
      <div className="mt-4 flex items-end justify-between">
        <div>
          {hasDiscount && selected?.compareAtPriceToman && (
            <p className="text-[11.5px] text-ink-300 line-through">
              {formatPrice(selected.compareAtPriceToman * packCount)}
            </p>
          )}
          <p className="text-lg font-black text-ink-900">
            {selected ? formatPrice(selected.isWholesale ? purchase.total : selected.priceToman * packCount) : '—'}
          </p>
          {selected && !selected.isWholesale && packCount > 1 && (
            <p className="text-[10px] text-ink-400">
              {`${toFaDigits(packCount)} × ${formatPrice(selected.priceToman)}`}
            </p>
          )}
        </div>
        {outOfStock ? (
          <span className="rounded-xl bg-cream-100 px-3 py-2 text-[11.5px] font-black text-ink-400">
            ناموجود
          </span>
        ) : lowStock ? (
          <span className="text-[11px] font-bold text-gold-700">
            تنها {toFaDigits(selected!.stock)} بسته باقی مانده
          </span>
        ) : null}
      </div>

      {/* ——— دکمه افزودن ——— */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={outOfStock || adding || !purchase.valid}
          className={cn(
            'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-black transition-colors',
            outOfStock
              ? 'cursor-not-allowed bg-cream-100 text-ink-300'
              : 'bg-brand-600 text-white hover:bg-brand-700'
          )}
        >
          {justAdded ? (
            <>
              <Check className="h-4 w-4" aria-hidden />
              به سبد اضافه شد
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden />
              افزودن به سبد خرید
            </>
          )}
        </button>
        <Link
          href="/"
          className="flex h-11 items-center gap-1.5 rounded-xl border border-cream-200 px-3 text-[11.5px] font-bold text-ink-600 transition-colors hover:bg-cream-100"
          aria-label="مشاهده سبد خرید در فروشگاه"
        >
          <ShoppingCart className="h-4 w-4" aria-hidden />
          سبد خرید
        </Link>
      </div>
      <p className="mt-2 text-center text-[10px] text-ink-300">
        پرداخت در محیط امن فروشگاه پارس انجام می‌شود
      </p>
    </div>
  );
}
