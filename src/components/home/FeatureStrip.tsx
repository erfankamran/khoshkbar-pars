'use client';

import { Banknote, Leaf, RotateCcw, Truck } from 'lucide-react';

/**
 * نوار مزیت‌های فروشگاه — جدا از فوتر، بعد از «پرسش‌های متداول» (درخواست کاربر)
 *
 * ظاهر مینیمال: پس‌زمینهٔ شفاف، بوردر سبز تم سایت، دو آیتم در هر ردیف؛
 * متن‌ها بدون overflow-hidden (در صورت نیاز می‌شکنند، بریده نمی‌شوند).
 * چهار مزیت واقعی فروشگاه — هم‌راستا با محتوای پرسش‌های متداول.
 */
const FEATURES = [
  { id: 'feat-shipping', icon: Truck, title: 'ارسال سریع', hint: 'بسته‌بندی پنج‌لایه' },
  { id: 'feat-fresh', icon: Leaf, title: 'تازه‌روزی روزانه', hint: 'همان روز بسته‌بندی می‌شود' },
  { id: 'feat-return', icon: RotateCcw, title: 'ضمانت ۷ روزه', hint: 'بازگشت بدون قید و شرط' },
  { id: 'feat-cod', icon: Banknote, title: 'پرداخت در محل', hint: 'درب منزل، هنگام تحویل' },
] as const;

export function FeatureStrip() {
  return (
    <section
      aria-label="خدمات فروشگاه"
      className="mx-4 mt-6 rounded-2xl border border-brand-300/70 p-1.5"
    >
      <div className="grid grid-cols-2 gap-1">
        {FEATURES.map((f) => (
          <div key={f.id} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5">
            <f.icon className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[12px] font-black leading-5 text-brand-900">
                {f.title}
              </span>
              <span className="block text-[10px] leading-4 text-brand-700/75">{f.hint}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
