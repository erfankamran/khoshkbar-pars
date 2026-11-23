'use client';

import { motion } from 'framer-motion';
import {
  Home,
  LayoutGrid,
  Newspaper,
  ShoppingCart,
  UserRound,
} from 'lucide-react';
import { toFaDigits } from '@/lib/fa';
import { cn } from '@/lib/utils';
import { useCartStore, selectCartCount } from '@/stores/cart-store';
import { useRouterStore, type ViewName } from '@/stores/router-store';

/**
 * نوار ناوبری پایین (بخش ۶ مشخصات)
 * ۵ تب: خانه، دسته‌بندی، وبلاگ، سبد خرید، حساب
 * (تب وبلاگ جایگزین علاقه‌مندی شد — درخواست کاربر: ورودی سئو؛
 *  علاقه‌مندی همچنان از حساب کاربری در دسترس است)
 * - وضعیت فعال با نشانگر طلایی متحرک (layoutId)
 * - بج تعداد سبد خرید
 * - Safe Area پایین با pb-safe
 * - لمس مجدد تب فعال → بازگشت به ریشه تب (رفتار اپ بومی)
 */
const TABS: Array<{
  view: ViewName;
  label: string;
  icon: typeof Home;
}> = [
  { view: 'home', label: 'خانه', icon: Home },
  // تب دسته‌بندی → نمای اختصاصی کاشی‌های بزرگ دسته‌ها (نه فروشگاه)
  { view: 'categories', label: 'دسته‌بندی', icon: LayoutGrid },
  // تب وبلاگ — جایگزین علاقه‌مندی (درخواست کاربر)
  { view: 'blog', label: 'وبلاگ', icon: Newspaper },
  { view: 'cart', label: 'سبد خرید', icon: ShoppingCart },
  { view: 'account', label: 'حساب', icon: UserRound },
];

export function BottomNav() {
  const stack = useRouterStore((s) => s.stack);
  const reset = useRouterStore((s) => s.reset);
  const popToRoot = useRouterStore((s) => s.popToRoot);
  const cartCount = useCartStore(selectCartCount);

  const activeRoot = stack[0]?.view;
  const isDeep = stack.length > 1;

  return (
    <nav
      className="relative z-20 shrink-0 border-t border-cream-200 bg-white/95 pb-safe backdrop-blur-sm"
      aria-label="ناوبری اصلی"
    >
      <div className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = activeRoot === tab.view;
          const showBadge = tab.view === 'cart' && cartCount > 0;

          return (
            <motion.button
              key={tab.view}
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => {
                if (active) {
                  if (isDeep) popToRoot();
                  return;
                }
                reset({ view: tab.view });
              }}
              className={cn(
                'relative flex h-16 flex-col items-center justify-center gap-1 transition-colors',
                active ? 'text-brand-600' : 'text-ink-400'
              )}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.label}
            >
              <span className="relative">
                <tab.icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={active ? 2.2 : 1.7}
                  aria-hidden
                />
                {showBadge && (
                  <span className="absolute -left-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[9px] font-black leading-none text-brand-950">
                    {toFaDigits(cartCount)}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-bold leading-none">
                {tab.label}
              </span>
              {active && (
                <motion.span
                  layoutId="pars-nav-dot"
                  className="absolute top-1 h-1 w-6 rounded-full bg-gold-400"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  aria-hidden
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
