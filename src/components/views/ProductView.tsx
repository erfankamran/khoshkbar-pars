'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Minus, Plus, ShieldCheck, Star, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Gallery } from '@/components/product/Gallery';
import { ProductRow } from '@/components/product/ProductRow';
import { ReviewSection, type ReviewSectionData } from '@/components/product/ReviewSection';
import { maxQtyFor, quickPicksFor, type QuickPick } from '@/components/product/weight-quick-picks';
import { ErrorState } from '@/components/shared/States';
import { ProductDetailSkeleton } from '@/components/shared/Skeletons';
import { useApi } from '@/hooks/use-api';
import { formatPrice, formatWeight, toFaDigits } from '@/lib/fa';
import { cn } from '@/lib/utils';
import { useCartStore } from '@/stores/cart-store';
import { useRouterStore } from '@/stores/router-store';
import type { getProductDetail } from '@/server/services/catalog.service';
import { WholesaleWeightPicker } from '@/components/product/WholesaleWeightPicker';
import { useWholesalePurchase } from '@/hooks/use-wholesale-purchase';

type DetailDTO = Awaited<ReturnType<typeof getProductDetail>>;

/**
 * صفحه جزئیات محصول (فاز ۷ — بخش ۵.۲ مشخصات)
 *
 * - گالری، انتخاب وزن با قیمت زنده، نوار خرید چسبان (sticky bottom)
 * - استپر تعداد بسته + چیپ‌های خرید سریع وزنی (۱/۲/۵ کیلو) — خرید وزن
 *   سنگین بدون چندبار رفت‌وبرگشت (جمع وزن و قیمت زنده)
 * - مشخصات (attributes)، نظرات با توزیع امتیاز، محصولات مرتبط
 * - داده از GET /api/products/[slug] + /api/products/[slug]/reviews
 * - کلید نما product:slug → حفظ اسکرول هنگام بازگشت از صفحات دیگر
 */

export function ProductView({ slug }: { slug?: string }) {
  const back = useRouterStore((s) => s.back);
  const push = useRouterStore((s) => s.push);
  const add = useCartStore((s) => s.add);

  const detailPath = slug ? `/api/products/${slug}` : null;
  const reviewsPath = slug ? `/api/products/${slug}/reviews?limit=20` : null;

  const { data, loading, error, reload } = useApi<DetailDTO>(detailPath);
  const {
    data: reviews,
    loading: reviewsLoading,
  } = useApi<ReviewSectionData>(reviewsPath);

  const variants = data?.product.variants ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [packCount, setPackCount] = useState(1);

  // واریانت انتخابی — پیش‌فرض کم‌وزن‌ترین
  const selected = useMemo(() => {
    if (!data) return null;
    return variants.find((v) => v.id === selectedId) ?? variants[0] ?? null;
  }, [data, selectedId, variants]);

  const outOfStock = !selected || selected.stock < (selected.isWholesale ? selected.weightGrams : 1);
  const maxQty = maxQtyFor(selected);
  const purchase = useWholesalePurchase(selected);
  const quickPicks: QuickPick[] = useMemo(() => quickPicksFor(variants.filter((variant) => !variant.isWholesale)), [variants]);

  const selectPack = (variantId: string) => {
    setSelectedId(variantId);
    setPackCount(1); // تعویض بسته → شمارش از نو (پیش‌بینی‌پذیر برای مشتری)
  };

  const handleAdd = async () => {
    if (!data || !selected || outOfStock || !purchase.valid) return;
    const qty = selected.isWholesale ? 1 : Math.max(1, Math.min(packCount, maxQty));
    try {
      await add({
        productId: data.product.id,
        variantId: selected.id,
        slug: data.product.slug,
        name: data.product.title,
        image: data.product.image?.url,
        weightGrams: selected.isWholesale ? purchase.weight : selected.weightGrams,
        unitPrice: selected.isWholesale ? purchase.total : selected.priceToman,
        isWholesale: selected.isWholesale,
        quantity: qty,
      });
      const weightLabel =
        qty > 1
          ? `${formatWeight(selected.weightGrams)} × ${toFaDigits(qty)}`
          : formatWeight(selected.weightGrams);
      toast.success(`«${data.product.title}» (${weightLabel}) به سبد اضافه شد`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'افزودن به سبد ناموفق بود');
    }
  };

  if (error) {
    return (
      <div className="min-h-full">
        <TopBar title="محصول" />
        <ErrorState
          title="محصول بارگذاری نشد"
          description={error}
          onRetry={reload}
          className="pt-10"
        />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-h-full">
        <ProductDetailSkeleton />
      </div>
    );
  }

  const p = data.product;

  return (
    <div className="min-h-full pb-28">
      <TopBar title={p.category.title} />

      {/* ——— گالری ——— */}
      <Gallery images={p.images} title={p.title} />

      {/* ——— عنوان و آمار ——— */}
      <div className="px-4 pt-4">
        <h1 className="text-lg font-black leading-7 text-ink-900">{p.title}</h1>
        <p className="mt-1 text-xs leading-5 text-ink-500">
          {p.shortDescription}
        </p>

        <div className="mt-2.5 flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" aria-hidden />
            <span className="font-bold text-ink-800">
              {toFaDigits(p.rating.toFixed(1))}
            </span>
            {p.ratingCount > 0 && (
              <span className="text-ink-400">
                {`(${toFaDigits(p.ratingCount)} نظر)`}
              </span>
            )}
          </span>
          <span className="text-ink-300">|</span>
          <span className="text-ink-500">
            {`${toFaDigits(p.salesCount)} فروش موفق`}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() =>
              push({ view: 'category', params: { slug: p.category.slug }, key: `category:${p.category.slug}` })
            }
            className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-700 active:bg-brand-100"
          >
            {p.category.title}
          </button>
        </div>
      </div>

      {/* ——— انتخاب وزن ——— */}
      <section className="px-4 pt-5" aria-label="انتخاب وزن">
        {selected?.isWholesale && <WholesaleWeightPicker minimum={selected.weightGrams} stock={selected.stock} pricePerKg={selected.pricePerKgToman!} value={purchase.weight} onChange={purchase.setWeight} />}
        <h2 className="mb-2.5 text-[15px] font-extrabold text-ink-900">
          {selected?.isWholesale ? 'خرید عمده با وزن دلخواه' : 'انتخاب وزن بسته'}
        </h2>
        <div
          role="radiogroup"
          aria-label="انتخاب وزن بسته"
          className={cn('grid grid-cols-2 gap-2', selected?.isWholesale && 'hidden')}
        >
          {variants.map((v) => {
            const isActive = v.id === selected?.id;
            const soldOut = v.stock === 0;
            const hasDiscount =
              v.compareAtPriceToman && v.compareAtPriceToman > v.priceToman;
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={soldOut}
                onClick={() => selectPack(v.id)}
                className={cn(
                  'relative rounded-2xl border-2 p-3 text-start transition-all active:scale-[0.98]',
                  isActive
                    ? 'border-brand-500 bg-brand-50/60'
                    : 'border-cream-200 bg-white',
                  soldOut && 'opacity-50'
                )}
              >
                <p className="text-[13px] font-extrabold text-ink-900">
                  {formatWeight(v.weightGrams)}
                </p>
                <p
                  className={cn(
                    'mt-1 text-[13px] font-black',
                    isActive ? 'text-brand-700' : 'text-ink-700'
                  )}
                >
                  {formatPrice(v.priceToman)}
                </p>
                {hasDiscount && (
                  <p className="text-[10px] text-ink-300 line-through">
                    {formatPrice(v.compareAtPriceToman!)}
                  </p>
                )}
                {soldOut ? (
                  <span className="mt-1 inline-block rounded-full bg-cream-200 px-1.5 py-0.5 text-[9px] font-bold text-ink-400">
                    ناموجود
                  </span>
                ) : v.stock <= 5 ? (
                  <span className="mt-1 inline-block rounded-full bg-gold-100 px-1.5 py-0.5 text-[9px] font-bold text-gold-700">
                    {`فقط ${toFaDigits(v.stock)} عدد`}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* ——— تعداد بسته + خرید سریع وزنی ——— */}
      <section className={cn('px-4 pt-4', selected?.isWholesale && 'hidden')} aria-label="تعداد بسته و خرید سریع">
        <div className="flex items-center justify-between rounded-2xl border border-cream-200 bg-white px-3.5 py-2.5">
          <div>
            <p className="text-[12.5px] font-extrabold text-ink-900">تعداد بسته</p>
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
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink-600 shadow-card transition-transform active:scale-90 disabled:opacity-40"
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
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink-600 shadow-card transition-transform active:scale-90 disabled:opacity-40"
              aria-label="افزایش تعداد بسته"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {quickPicks.length > 0 && !outOfStock && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="ml-0.5 text-[10.5px] font-bold text-ink-400">خرید سریع:</span>
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
                    'rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors active:scale-95',
                    active
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-cream-200 bg-white text-ink-700'
                  )}
                  aria-label={`خرید ${formatWeight(qp.targetGrams)} — ${toFaDigits(qp.count)} بسته`}
                >
                  {formatWeight(qp.targetGrams)}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ——— تضمین‌ها ——— */}
      <div className="mx-4 mt-4 flex items-center gap-2 rounded-2xl bg-cream-100/70 px-3 py-2.5">
        <Truck className="h-4 w-4 text-brand-600" aria-hidden />
        <span className="text-[11px] font-bold text-ink-600">ارسال سریع</span>
        <span className="h-3 w-px bg-cream-300" aria-hidden />
        <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden />
        <span className="text-[11px] font-bold text-ink-600">
          تضمین تازگی و بازگشت کالا
        </span>
      </div>

      {/* ——— توضیحات ——— */}
      {p.description && (
        <section className="px-4 pt-6" aria-label="توضیحات محصول">
          <h2 className="mb-2 text-[15px] font-extrabold text-ink-900">
            درباره این محصول
          </h2>
          <p className="text-xs leading-6 text-ink-600 whitespace-pre-line">
            {p.description}
          </p>
        </section>
      )}

      {/* ——— مشخصات ——— */}
      {p.attributes.length > 0 && (
        <section className="px-4 pt-6" aria-label="مشخصات محصول">
          <h2 className="mb-2 text-[15px] font-extrabold text-ink-900">
            مشخصات
          </h2>
          <dl className="overflow-hidden rounded-2xl border border-cream-200">
            {p.attributes.map((a, i) => (
              <div
                key={`${a.k}-${i}`}
                className={cn(
                  'flex items-center justify-between bg-white px-3.5 py-2.5',
                  i % 2 === 1 && 'bg-cream-50'
                )}
              >
                <dt className="text-xs text-ink-500">{a.k}</dt>
                <dd className="text-xs font-bold text-ink-800">{a.v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ——— نظرات ——— */}
      {reviews && <ReviewSection data={reviews} />}
      {reviewsLoading && (
        <div className="px-4 pt-6">
          <div className="shimmer h-28 rounded-3xl" aria-label="در حال بارگذاری نظرات" />
        </div>
      )}

      {/* ——— محصولات مرتبط ——— */}
      {data.related.length > 0 && (
        <>
          <h2 className="px-4 pb-3 pt-7 text-[15px] font-extrabold text-ink-900">
            محصولات مشابه
          </h2>
          <ProductRow items={data.related} />
        </>
      )}

      {/* ——— نوار خرید چسبان ——— */}
      <div className="sticky bottom-0 z-20 mt-6 border-t border-cream-200 bg-cream-50/95 p-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {selected?.compareAtPriceToman &&
              selected.compareAtPriceToman > selected.priceToman && (
                <p className="text-[10px] leading-3.5 text-ink-300 line-through">
                  {formatPrice(selected.compareAtPriceToman * packCount)}
                </p>
              )}
            <p className="truncate text-base font-black leading-6 text-brand-800">
              {selected ? formatPrice(selected.isWholesale ? purchase.total : selected.priceToman * packCount) : '—'}
            </p>
            {selected && !selected.isWholesale && packCount > 1 && (
              <p className="text-[10px] text-ink-400">
                {`${toFaDigits(packCount)} × ${formatPrice(selected.priceToman)}`}
              </p>
            )}
            {selected?.isWholesale && <p className="text-[10px] font-bold text-brand-700">مبلغ {formatWeight(purchase.weight)} با نرخ هر کیلو {formatPrice(selected.pricePerKgToman!)}</p>}
          </div>
          <button
            type="button"
            disabled={outOfStock || !purchase.valid}
            onClick={handleAdd}
            className={cn(
              'flex h-12 items-center gap-2 rounded-2xl px-6 text-sm font-black transition-all active:scale-[0.98]',
              outOfStock
                ? 'bg-cream-200 text-ink-400'
                : 'bg-brand-500 text-white shadow-card active:bg-brand-700'
            )}
          >
            <Plus className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden />
            {outOfStock ? 'ناموجود' : 'افزودن به سبد'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** نوار بالای صفحه جزئیات — چسبان، با بازگشت و دسته */
function TopBar({ title }: { title: string }) {
  const back = useRouterStore((s) => s.back);
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-cream-200 bg-cream-50/95 px-3 py-3 backdrop-blur">
      <button
        type="button"
        onClick={back}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-card transition-transform active:scale-90"
        aria-label="بازگشت"
      >
        <ChevronRight className="h-5 w-5 text-ink-700" aria-hidden />
      </button>
      <span className="text-xs font-bold text-ink-500">{title}</span>
    </div>
  );
}
