'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatPrice, formatWeight, toFaDigits } from '@/lib/fa';
import { cn } from '@/lib/utils';
import type { CartLine } from '@/stores/cart-store';
import { useCartStore } from '@/stores/cart-store';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { WholesaleWeightPicker } from '@/components/product/WholesaleWeightPicker';
import { useRouterStore } from '@/stores/router-store';

/**
 * ردیف کالای سبد خرید (فاز ۸)
 * - قیمت واحد و جمع ردیف همیشه از سرور (منبع حقیقت)
 * - استپر تعداد با سقف موجودی؛ حذف با Trash
 * - ردیف غیرقابل خرید (غیرفعال/ناموجود) با تیرگی و بج «ناموجود» نمایش داده
 *   می‌شود اما در مبالغ تسویه حساب نمی‌آید (هشدار جدا در بالای سبد)
 */

const MAX_QTY = 20;

export function CartItemRow({
  line,
  busy,
  onQtyChange,
  onRemove,
}: {
  line: CartLine;
  busy: boolean;
  onQtyChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const push = useRouterStore((s) => s.push);
  const [draftWeight, setDraftWeight] = useState(line.weightGrams);
  useEffect(() => setDraftWeight(line.weightGrams), [line.weightGrams]);
  const maxQty = Math.min(line.stock, MAX_QTY);
  const overStock = line.quantity > line.stock;

  return (
    <article
      className={cn(
        'flex gap-3 rounded-3xl border border-cream-200 bg-white p-3 shadow-card',
        !line.isPurchasable && 'opacity-55'
      )}
    >
      {/* ——— تصویر (کلیک → صفحه محصول) ——— */}
      <button
        type="button"
        onClick={() => push({ view: 'product', params: { slug: line.slug }, key: `product:${line.slug}` })}
        className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-cream-100"
        aria-label={`مشاهده ${line.title}`}
      >
        {line.image ? (
          <img
            src={line.image}
            alt={line.title}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : null}
      </button>

      {/* ——— اطلاعات ——— */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => push({ view: 'product', params: { slug: line.slug }, key: `product:${line.slug}` })}
            className="min-w-0 flex-1 text-start"
          >
            <h3 className="truncate text-[13px] font-extrabold text-ink-900">
              {line.title}
            </h3>
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
            aria-label={`حذف ${line.title} از سبد`}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          <span className="rounded-full bg-cream-100 px-2 py-0.5 text-[10px] font-bold text-ink-500">
            {formatWeight(line.weightGrams)}
          </span>
          {!line.isPurchasable && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
              ناموجود
            </span>
          )}
          {line.isPurchasable && line.quantity >= line.stock && (
            <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-700">
              {`حداکثر ${toFaDigits(line.stock)} عدد`}
            </span>
          )}
        </div>

        {/* ——— قیمت و استپر ——— */}
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            {line.compareAtPriceToman && line.compareAtPriceToman > line.unitPriceToman && (
              <p className="text-[10px] leading-3.5 text-ink-300 line-through">
                {formatPrice(line.compareAtPriceToman * line.quantity)}
              </p>
            )}
            <p className="text-[13px] font-black text-brand-800">
              {formatPrice(line.lineTotalToman)}
            </p>
            {line.quantity > 1 && (
              <p className="text-[10px] text-ink-400">
                {`${toFaDigits(line.quantity)} × ${formatPrice(line.unitPriceToman)}`}
              </p>
            )}
          </div>

          {/* استپر تعداد */}
          <div
            className={cn('flex items-center gap-1 rounded-full border border-cream-200 bg-cream-50 p-1', line.isWholesale && 'hidden')}
            role="group"
            aria-label={`تعداد ${line.title}`}
          >
            <button
              type="button"
              onClick={() => (line.quantity <= 1 ? onRemove() : onQtyChange(line.quantity - 1))}
              disabled={busy || !line.isPurchasable}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink-600 shadow-card transition-transform active:scale-90 disabled:opacity-40"
              aria-label={line.quantity <= 1 ? 'حذف از سبد' : 'کاهش تعداد'}
            >
              {line.quantity <= 1 ? (
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Minus className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            <span
              className="min-w-6 text-center text-[13px] font-black tabular-nums text-ink-900"
              aria-live="polite"
            >
              {toFaDigits(line.quantity)}
            </span>
            <button
              type="button"
              onClick={() => onQtyChange(line.quantity + 1)}
              disabled={busy || !line.isPurchasable || line.quantity >= maxQty}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink-600 shadow-card transition-transform active:scale-90 disabled:opacity-40"
              aria-label="افزایش تعداد"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        {line.isWholesale && line.pricePerKgToman && <>
          <WholesaleWeightPicker minimum={line.minWeightGrams!} stock={line.stock} pricePerKg={line.pricePerKgToman} value={draftWeight} onChange={setDraftWeight} disabled={busy} />
          <button type="button" disabled={busy || !Number.isInteger(draftWeight) || draftWeight < line.minWeightGrams! || draftWeight > line.stock || draftWeight === line.weightGrams} onClick={() => void useCartStore.getState().setWeight(line.id, draftWeight).catch((error) => toast.error(error instanceof Error ? error.message : 'ثبت وزن انجام نشد'))} className="min-h-10 w-full rounded-xl bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-40">ثبت وزن جدید</button>
        </>}
        {overStock && !line.isWholesale && (
          <p className="mt-1.5 rounded-xl bg-gold-100/70 px-2.5 py-1 text-[10px] font-bold text-gold-700">
            {`فقط ${toFaDigits(line.stock)} عدد در انبار — تعداد را کاهش دهید`}
          </p>
        )}
      </div>
    </article>
  );
}
