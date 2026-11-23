'use client';

import { memo, useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, Plus, Star } from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice, formatWeight, toFaDigits } from '@/lib/fa';
import { useCartStore } from '@/stores/cart-store';
import { useRouterStore } from '@/stores/router-store';
import type { ProductCardDTO } from '@/server/services/catalog.service';
import { cn } from '@/lib/utils';

/**
 * کارت محصول — واحد مشترک همه ردیف‌های افقی (فاز ۶) و شبکه‌ای (فاز ۷)
 *
 * - انتخابگر وزن روی کارت (واریانت‌ها از قبل در DTO هستند → بدون درخواست اضافه)
 * - بج تخفیف، هشدار موجودی کم، حالت ناموجود
 * - افزودن سریع به سبد با بازخورد فوری (بج هدر + آیکون تیک + toast)
 * - قیمت همیشه از واریانت انتخابی — قیمت فعلی سرور، نه قیمت کش‌شده
 */

/** وزن فشرده برای چیپ‌های کارت: ۲۵۰ گرم → «۲۵۰ گ» / ۱۰۰۰ → «۱ ک» */
function compactWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${toFaDigits(Number.isInteger(kg) ? kg : kg.toFixed(1))} ک`;
  }
  return `${toFaDigits(grams)} گ`;
}

export const ProductCard = memo(function ProductCard({
  product,
  className,
}: {
  product: ProductCardDTO;
  className?: string;
}) {
  const push = useRouterStore((s) => s.push);
  const add = useCartStore((s) => s.add);

  const variants = product.variants;
  // واریانت پیش‌فرض: کم‌وزن‌ترین (DTO واریانت‌ها را صعودی می‌دهد)
  const [selectedId, setSelectedId] = useState<string>(
    () => variants[0]?.id ?? ''
  );
  const [justAdded, setJustAdded] = useState(false);

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? variants[0] ?? null,
    [variants, selectedId]
  );

  const outOfStock = product.totalStock === 0 || !selected || selected.stock < (selected.isWholesale ? selected.weightGrams : 1);
  const lowStock = !outOfStock && selected && !selected.isWholesale && selected.stock <= 5;

  const selectedDiscount =
    selected?.compareAtPriceToman && selected.compareAtPriceToman > selected.priceToman
      ? Math.round(
          ((selected.compareAtPriceToman - selected.priceToman) /
            selected.compareAtPriceToman) *
            100
        )
      : 0;

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selected || outOfStock) return;
    try {
      await add({
        productId: product.id,
        variantId: selected.id,
        slug: product.slug,
        name: product.title,
        image: product.image?.url,
        weightGrams: selected.weightGrams,
        unitPrice: selected.priceToman,
        isWholesale: selected.isWholesale,
        quantity: 1,
      });
      toast.success(`«${product.title}» به سبد اضافه شد`);
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'افزودن به سبد ناموفق بود');
    }
  };

  const openDetail = () =>
    push({
      view: 'product',
      params: { slug: product.slug },
      key: `product:${product.slug}`,
    });

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={product.title}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openDetail();
      }}
      className={cn(
        'group w-40 shrink-0 cursor-pointer rounded-3xl border border-cream-200 bg-white p-3 shadow-card transition-transform active:scale-[0.98]',
        className
      )}
    >
      {/* ——— تصویر + بج‌ها ——— */}
      <div className="relative">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-cream-100">
          {product.image ? (
            <Image
              src={product.image.url}
              alt={product.image.alt ?? product.title}
              fill
              sizes="(max-width: 480px) 43vw, 160px"
              className="object-cover"
            />
          ) : null}
        </div>

        {/* بج تخفیف — بیشترین درصد بین واریانت‌ها */}
        {product.hasDiscount && product.maxDiscountPercent > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
            ٪{toFaDigits(product.maxDiscountPercent)}
          </span>
        )}

        {/* هشدار موجودی کم واریانت انتخابی */}
        {lowStock && (
          <span className="absolute bottom-2 right-2 rounded-full bg-gold-400/95 px-2 py-0.5 text-[10px] font-black text-brand-950 shadow-sm">
            {`فقط ${toFaDigits(selected?.stock ?? 0)} عدد`}
          </span>
        )}

        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70">
            <span className="rounded-full bg-ink-800 px-3 py-1 text-[11px] font-black text-white">
              ناموجود
            </span>
          </div>
        )}
      </div>

      {/* ——— عنوان و امتیاز ——— */}
      <h3 className="mt-2.5 truncate text-[13px] font-extrabold text-ink-900">
        {product.title}
      </h3>

      <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-500">
        <Star className="h-3 w-3 fill-gold-400 text-gold-400" aria-hidden />
        <span className="font-bold text-ink-700">
          {toFaDigits(product.rating.toFixed(1))}
        </span>
        {product.ratingCount > 0 && (
          <span className="text-ink-400">
            {`(${toFaDigits(product.ratingCount)})`}
          </span>
        )}
        <span className="flex-1" />
        <span className="text-[10px] text-ink-400">
          {`${toFaDigits(product.salesCount)} فروش`}
        </span>
      </div>

      {/* ——— انتخابگر وزن ——— */}
      {variants.length > 1 && !outOfStock ? (
        <div
          role="radiogroup"
          aria-label={`انتخاب وزن برای ${product.title}`}
          className="mt-2 grid grid-cols-2 gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {variants.map((v) => {
            const isActive = v.id === selected?.id;
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={v.stock === 0}
                onClick={() => setSelectedId(v.id)}
                className={cn(
                  'h-6 rounded-lg text-[10px] font-bold transition-colors',
                  isActive
                    ? 'bg-brand-500 text-white'
                    : v.stock === 0
                      ? 'bg-cream-100 text-ink-300 line-through'
                      : 'bg-cream-100 text-ink-600 active:bg-cream-200'
                )}
              >
                {compactWeight(v.weightGrams)}
              </button>
            );
          })}
        </div>
      ) : (
        variants[0] && (
          <p className="mt-2 text-[11px] font-bold text-ink-500">
            {formatWeight(variants[0].weightGrams)}
          </p>
        )
      )}

      {/* ——— قیمت + افزودن ——— */}
      <div className="mt-2 flex items-end justify-between gap-1">
        <div className="min-w-0">
          {selected?.isWholesale && <p className="text-[10px] font-bold text-brand-700">قیمت هر کیلو · همکار</p>}
          {selectedDiscount > 0 && selected?.compareAtPriceToman && (
            <p className="text-[10px] leading-4 text-ink-300 line-through">
              {formatPrice(selected.compareAtPriceToman)}
            </p>
          )}
          <p className="truncate text-[13px] font-black leading-5 text-brand-800">
            {selected ? formatPrice(selected.isWholesale ? selected.pricePerKgToman! : selected.priceToman) : '—'}
          </p>
        </div>

        <button
          type="button"
          aria-label={`افزودن ${product.title} به سبد`}
          disabled={outOfStock}
          onClick={handleAdd}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl shadow-sm transition-all active:scale-90',
            outOfStock
              ? 'bg-cream-200 text-ink-300'
              : justAdded
                ? 'bg-green-600 text-white'
                : 'bg-brand-500 text-white active:bg-brand-700'
          )}
        >
          {justAdded ? (
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
          ) : (
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          )}
        </button>
      </div>
    </article>
  );
});
