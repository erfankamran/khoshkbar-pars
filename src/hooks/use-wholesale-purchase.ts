'use client';
import { useState } from 'react';
interface Variant { id: string; weightGrams: number; stock: number; priceToman: number; isWholesale?: boolean; pricePerKgToman?: number | null }
export function useWholesalePurchase(selected: Variant | null) {
  const [draft, setDraft] = useState<{ id: string; grams: number } | null>(null);
  const weight = draft?.id === selected?.id ? draft!.grams : selected?.weightGrams ?? 0;
  const valid = !selected?.isWholesale || (Number.isInteger(weight) && weight >= selected.weightGrams && weight <= selected.stock && !!selected.pricePerKgToman);
  return { weight, valid, total: Math.round((selected?.pricePerKgToman ?? 0) * weight / 1000), setWeight: (grams: number) => setDraft({ id: selected?.id ?? '', grams }) };
}
