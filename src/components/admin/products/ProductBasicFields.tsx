'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { AdminCategoryDTO } from '@/server/services/admin/catalog-admin.service';

/**
 * فیلدهای پایه فرم محصول (فاز ۱۱.۲) — مشترک میان «محصول جدید» و «ویرایش»
 * کنترل‌شده: همه مقادیر از والد می‌آیند و تغییرها بالا برمی‌گردند
 * (تک‌منبع state — جلوگیری از دو نسخه‌ای شدن فرم)
 */

export interface ProductFormValues {
  slug: string;
  title: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  attributes: Array<{ k: string; v: string }>;
  isSuggested: boolean;
  isActive: boolean;
}

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  slug: '',
  title: '',
  categoryId: '',
  shortDescription: '',
  description: '',
  attributes: [],
  isSuggested: false,
  isActive: true,
};

interface Props {
  values: ProductFormValues;
  onChange: (v: ProductFormValues) => void;
  categories: AdminCategoryDTO[];
  /** فرم ویرایش: اسلاگ قفل می‌شود تا URL ثبات داشته باشد */
  lockSlug?: boolean;
}

const inputCls =
  'h-11 w-full rounded-xl border border-cream-200 bg-white px-3 text-[13px] font-bold text-ink-900 outline-none transition-colors placeholder:font-normal placeholder:text-ink-300 focus:border-brand-400';

export function ProductBasicFields({ values, onChange, categories, lockSlug }: Props) {
  const set = <K extends keyof ProductFormValues>(key: K, val: ProductFormValues[K]) =>
    onChange({ ...values, [key]: val });

  return (
    <div className="space-y-4">
      {/* عنوان + اسلاگ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="p-title" className="mb-1.5 block text-[11px] font-bold text-ink-600">
            عنوان محصول *
          </label>
          <input
            id="p-title"
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            maxLength={120}
            placeholder="مثال: پسته اکبری خوش‌قشنگ"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="p-slug" className="mb-1.5 block text-[11px] font-bold text-ink-600">
            اسلاگ (آدرس صفحه) *
          </label>
          <input
            id="p-slug"
            dir="ltr"
            value={values.slug}
            onChange={(e) => set('slug', e.target.value.toLowerCase())}
            maxLength={60}
            disabled={lockSlug}
            placeholder="pistachio-akbari"
            className={`${inputCls} text-left ${lockSlug ? 'cursor-not-allowed opacity-60' : ''}`}
          />
          <p className="mt-1 text-[10px] text-ink-400">
            فقط حروف لاتین کوچک، عدد و خط تیره — مثال: pistachio-akbari
          </p>
        </div>
      </div>

      {/* دسته */}
      <div>
        <label htmlFor="p-category" className="mb-1.5 block text-[11px] font-bold text-ink-600">
          دسته‌بندی *
        </label>
        <select
          id="p-category"
          value={values.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
          className={inputCls}
        >
          <option value="" disabled>
            انتخاب دسته…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} {c.isActive ? '' : '(غیرفعال)'}
            </option>
          ))}
        </select>
      </div>

      {/* معرفی کوتاه */}
      <div>
        <label htmlFor="p-short" className="mb-1.5 block text-[11px] font-bold text-ink-600">
          معرفی کوتاه
        </label>
        <input
          id="p-short"
          value={values.shortDescription}
          onChange={(e) => set('shortDescription', e.target.value)}
          maxLength={200}
          placeholder="یک خط زیر عنوان کارت محصول"
          className={inputCls}
        />
      </div>

      {/* توضیحات کامل */}
      <div>
        <label htmlFor="p-desc" className="mb-1.5 block text-[11px] font-bold text-ink-600">
          توضیحات کامل
        </label>
        <textarea
          id="p-desc"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          maxLength={5000}
          rows={5}
          placeholder="متن صفحه جزئیات محصول…"
          className="w-full rounded-xl border border-cream-200 bg-white p-3 text-[13px] font-bold leading-6 text-ink-900 outline-none transition-colors placeholder:font-normal placeholder:text-ink-300 focus:border-brand-400"
        />
      </div>

      {/* ویژگی‌ها */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-bold text-ink-600">
            ویژگی‌ها (حداکثر ۱۲ مورد)
          </span>
          <button
            type="button"
            onClick={() => set('attributes', [...values.attributes, { k: '', v: '' }])}
            disabled={values.attributes.length >= 12}
            className="flex h-8 items-center gap-1 rounded-lg bg-brand-50 px-2.5 text-[11px] font-black text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            افزودن ویژگی
          </button>
        </div>
        {values.attributes.length === 0 ? (
          <p className="rounded-xl bg-cream-50 px-3 py-2.5 text-[11px] text-ink-400">
            مثال: گرماژ ← درجه یک | بسته‌بندی ← جعبه لوکس
          </p>
        ) : (
          <div className="space-y-2">
            {values.attributes.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={a.k}
                  onChange={(e) => {
                    const next = [...values.attributes];
                    next[i] = { ...next[i], k: e.target.value };
                    set('attributes', next);
                  }}
                  maxLength={40}
                  placeholder="عنوان (مثال: گرماژ)"
                  className={inputCls}
                  aria-label={`عنوان ویژگی ${i + 1}`}
                />
                <input
                  value={a.v}
                  onChange={(e) => {
                    const next = [...values.attributes];
                    next[i] = { ...next[i], v: e.target.value };
                    set('attributes', next);
                  }}
                  maxLength={100}
                  placeholder="مقدار (مثال: درجه یک)"
                  className={inputCls}
                  aria-label={`مقدار ویژگی ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    set(
                      'attributes',
                      values.attributes.filter((_, j) => j !== i)
                    )
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50"
                  aria-label="حذف ویژگی"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* کلیدهای وضعیت */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-cream-50 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          <span className="text-[12px] font-bold text-ink-700">فعال (نمایش در فروشگاه)</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={values.isSuggested}
            onChange={(e) => set('isSuggested', e.target.checked)}
            className="h-4 w-4 accent-gold-500"
          />
          <span className="text-[12px] font-bold text-ink-700">پیشنهاد پارس (صفحه اصلی)</span>
        </label>
      </div>
    </div>
  );
}
