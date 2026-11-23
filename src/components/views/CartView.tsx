'use client';

import { useEffect } from 'react';
import { AlertTriangle, ChevronLeft, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { CartItemRow } from '@/components/cart/CartItemRow';
import { CartSummary } from '@/components/cart/CartSummary';
import { EmptyState } from '@/components/shared/States';
import { formatPrice, toFaDigits } from '@/lib/fa';
import { useAuthStore } from '@/stores/auth-store';
import { useCartStore } from '@/stores/cart-store';
import { useRouterStore } from '@/stores/router-store';

/**
 * سبد خرید (فاز ۸ — همگام‌سازی سمت سرور · فاز ۹ — مسیر تسویه)
 *
 * - نسخه محلی (persist) بلافاصله نمایش داده می‌شود؛ GET /api/cart آن را با
 *   «قیمت و موجودی واقعی سرور» جایگزین می‌کند (منبع حقیقت — بند ۱۳ مشخصات)
 * - هشدارها (تغییر قیمت / کمبود موجودی / غیرقابل خرید) بالای لیست نمایش داده می‌شوند
 * - استپر و حذف: Optimistic + PATCH/DELETE → جایگزینی با پاسخ سرور
 * - «ادامه فرایند خرید»: کاربر → تسویه حساب؛ مهمان → ورود OTP
 */
export function CartView() {
  const reset = useRouterStore((s) => s.reset);
  const push = useRouterStore((s) => s.push);

  const items = useCartStore((s) => s.items);
  const warnings = useCartStore((s) => s.warnings);
  const totals = useCartStore((s) => s.totals);
  const hydrated = useCartStore((s) => s.hydrated);
  const syncing = useCartStore((s) => s.syncing);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const refresh = useCartStore((s) => s.refresh);

  // ورود به سبد → همگام‌سازی تازه (قیمت/موجودی ممکن است از آخرین بازدید تغییر کرده باشد)
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleQty = async (itemId: string, quantity: number) => {
    try {
      await setQuantity(itemId, quantity);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تغییر تعداد ناموفق بود');
    }
  };

  const handleRemove = async (itemId: string) => {
    try {
      await remove(itemId);
      toast.success('کالا از سبد حذف شد');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'حذف کالا ناموفق بود');
    }
  };

  const handleCheckout = () => {
    if (items.length === 0 || !totals.meetsMinOrder) return;
    // همیشه مستقیم تسویه حساب — نمای تسویه خودش برای مهمان نام/شماره می‌گیرد
    // و با کد پیامکی تایید می‌کند (درخواست کاربر)
    push({ view: 'checkout', key: 'checkout' });
  };

  // ——— حالت بارگذاری اولیه (بدون نسخه محلی) ———
  if (!hydrated && items.length === 0) {
    return (
      <div className="min-h-full pb-8">
        <h1 className="px-4 pb-1 pt-5 text-lg font-black text-ink-900">سبد خرید</h1>
        <div className="space-y-3 px-4 pt-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="shimmer h-28 rounded-3xl" aria-label="در حال بارگذاری سبد" />
          ))}
        </div>
      </div>
    );
  }

  // ——— سبد خالی ———
  if (items.length === 0) {
    return (
      <div className="min-h-full">
        <h1 className="px-4 pb-1 pt-5 text-lg font-black text-ink-900">سبد خرید</h1>
        <EmptyState
          icon={ShoppingBag}
          title="سبد خرید شما خالی است"
          description="محصولات دلخواه خود را با وزن دلخواه انتخاب کنید و اینجا مشاهده خواهید کرد."
          actionLabel="شروع خرید"
          onAction={() => reset({ view: 'home' })}
        />
      </div>
    );
  }

  const purchasableCount = items.filter((i) => i.isPurchasable).length;

  return (
    <div className="min-h-full pb-32">
      <div className="flex items-baseline justify-between px-4 pb-1 pt-5">
        <h1 className="text-lg font-black text-ink-900">سبد خرید</h1>
        {purchasableCount > 0 && (
          <span className="text-[11px] font-bold text-ink-400">
            {`${toFaDigits(purchasableCount)} کالا`}
          </span>
        )}
      </div>

      {/* ——— هشدارهای سرور (تغییر قیمت / موجودی / غیرفعال) ——— */}
      {warnings.length > 0 && (
        <div className="mx-4 mt-2 space-y-1.5" role="alert">
          {warnings.map((w, i) => (
            <div
              key={`${w.type}-${i}`}
              className="flex items-start gap-2 rounded-2xl bg-gold-100/80 px-3 py-2"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-700" aria-hidden />
              <p className="text-[11px] font-bold leading-5 text-gold-800">{w.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* ——— ردیف‌ها ——— */}
      <div className="mt-3 space-y-3 px-4">
        {items.map((line) => (
          <CartItemRow
            key={line.id}
            line={line}
            busy={syncing}
            onQtyChange={(q) => void handleQty(line.id, q)}
            onRemove={() => void handleRemove(line.id)}
          />
        ))}
      </div>

      {/* ——— خلاصه مبالغ ——— */}
      <CartSummary totals={totals} />

      {/* ——— نوار ادامه خرید ——— */}
      <div className="sticky bottom-0 z-20 mt-4 border-t border-cream-200 bg-cream-50/95 p-3 backdrop-blur">
        <button
          type="button"
          onClick={handleCheckout}
          disabled={purchasableCount === 0 || !totals.meetsMinOrder}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-sm font-black text-white shadow-card transition-all active:scale-[0.98] active:bg-brand-700 disabled:bg-cream-200 disabled:text-ink-400 disabled:shadow-none"
        >
          ادامه فرایند خرید
          <ChevronLeft className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden />
          <span className="text-xs font-bold opacity-90">
            {`(${formatPrice(totals.totalPayableToman)})`}
          </span>
        </button>
      </div>
    </div>
  );
}
