'use client';
import { useId } from 'react';
import { formatPrice, formatWeight } from '@/lib/fa';

export function WholesaleWeightPicker({ minimum, stock, pricePerKg, value, onChange, disabled }: {
  minimum: number; stock: number; pricePerKg: number; value: number;
  onChange: (grams: number) => void; disabled?: boolean;
}) {
  const id = useId();
  const valid = Number.isInteger(value) && value >= minimum && value <= stock;
  return <div className="my-3 rounded-2xl border border-brand-200 bg-brand-50 p-3">
    <p className="text-xs font-bold leading-6 text-brand-800">قیمت همکار: {formatPrice(pricePerKg)} برای هر کیلو</p>
    <p className="text-[11px] leading-6 text-ink-600">حداقل خرید {formatWeight(minimum)} · موجودی {formatWeight(stock)}</p>
    <label htmlFor={id} className="mt-2 block text-xs font-bold text-ink-800">وزن سفارش عمده (کیلوگرم)</label>
    <input id={id} type="number" inputMode="decimal" min={minimum / 1000} max={stock / 1000} step="0.001" value={Number.isFinite(value) ? value / 1000 : ''} onChange={(event) => onChange(event.target.value === '' ? NaN : Math.round(Number(event.target.value) * 1000))} disabled={disabled} aria-invalid={!valid} aria-describedby={`${id}-hint`} className="mt-1 h-11 w-full rounded-xl border border-brand-200 bg-white px-3 text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-brand-500" />
    <p id={`${id}-hint`} className={`mt-1 text-[11px] leading-6 ${valid ? 'text-brand-800' : 'text-red-600'}`}>
      {valid ? `مبلغ این وزن: ${formatPrice(Math.round(pricePerKg * value / 1000))}` : `وزن را بین ${minimum / 1000} و ${stock / 1000} کیلو وارد کنید`}
    </p>
  </div>;
}
