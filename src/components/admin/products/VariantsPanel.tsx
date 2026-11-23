'use client';

import { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiPatch, apiPost, ApiClientError } from '@/lib/api-client';
import { formatPrice, formatWeight, toFaDigits } from '@/lib/fa';
import type { AdminProductDetailDTO } from '@/server/services/admin/catalog-admin.service';

/**
 * پنل مدیریت واریانت‌های وزنی (فاز ۱۱.۲)
 *
 * - افزودن: فرم ردیفی ساده (وزن/قیمت/تخفیف/موجودی/sku)
 * - ویرایش: حالت درجای همان ردیف (PATCH جزئی)
 * - حذف: واریانت سفارش‌خورده دکمه حذف ندارد — فقط غیرفعال‌سازی
 *   (پیام API: HAS_REFERENCES → 409؛ اینجا UI هم پیش‌گیرانه قفل است)
 */

interface Props {
  product: AdminProductDetailDTO;
  onChanged: (p: AdminProductDetailDTO) => void;
}

interface VariantDraft {
  weightGrams: string;
  priceToman: string;
  compareAtPriceToman: string;
  sku: string;
  stock: string;
  isActive: boolean;
}

const EMPTY_DRAFT: VariantDraft = {
  weightGrams: '',
  priceToman: '',
  compareAtPriceToman: '',
  sku: '',
  stock: '',
  isActive: true,
};

const cellInputCls =
  'h-10 w-full rounded-lg border border-cream-200 bg-white px-2 text-center text-[12px] font-bold text-ink-900 outline-none focus:border-brand-400';

export function VariantsPanel({ product, onChanged }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<VariantDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<VariantDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  const parseDraft = (d: VariantDraft) => ({
    weightGrams: parseInt(toEn(d.weightGrams), 10),
    priceToman: parseInt(toEn(d.priceToman), 10),
    compareAtPriceToman: toEn(d.compareAtPriceToman) ? parseInt(toEn(d.compareAtPriceToman), 10) : null,
    sku: d.sku.trim() || null,
    stock: parseInt(toEn(d.stock), 10),
    isActive: d.isActive,
  });

  const toEn = (s: string) =>
    s.replace(/[۰-۹]/g, (ch) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch))).replace(/[^\d]/g, '');

  const validate = (d: VariantDraft): string | null => {
    const v = parseDraft(d);
    if (!Number.isFinite(v.weightGrams) || v.weightGrams < 10 || v.weightGrams > 5000)
      return 'وزن باید بین ۱۰ تا ۵۰۰۰ گرم باشد';
    if (!Number.isFinite(v.priceToman) || v.priceToman < 1000)
      return 'قیمت حداقل ۱٬۰۰۰ تومان است';
    if (v.compareAtPriceToman != null && v.compareAtPriceToman <= v.priceToman)
      return 'قیمت قبل از تخفیف باید بیشتر از قیمت فروش باشد';
    if (!Number.isFinite(v.stock) || v.stock < 0) return 'موجودی معتبر وارد کنید';
    return null;
  };

  const addVariant = async () => {
    const err = validate(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const updated = await apiPost<AdminProductDetailDTO>(
        `/api/admin/products/${product.id}/variants`,
        parseDraft(draft)
      );
      onChanged(updated);
      setDraft(EMPTY_DRAFT);
      setShowAdd(false);
      toast.success('واریانت اضافه شد');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'افزودن واریانت ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (variantId: string) => {
    const err = validate(editDraft);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const updated = await apiPatch<AdminProductDetailDTO>(
        `/api/admin/variants/${variantId}`,
        parseDraft(editDraft)
      );
      onChanged(updated);
      setEditingId(null);
      toast.success('واریانت بروزرسانی شد');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'ذخیره ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (
    v: AdminProductDetailDTO['variants'][number],
    isActive: boolean
  ) => {
    setBusy(true);
    try {
      const updated = await apiPatch<AdminProductDetailDTO>(`/api/admin/variants/${v.id}`, {
        isActive,
      });
      onChanged(updated);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'تغییر وضعیت ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (v: AdminProductDetailDTO['variants'][number]) => {
    setBusy(true);
    try {
      await apiDelete(`/api/admin/variants/${v.id}`);
      onChanged({ ...product, variants: product.variants.filter((x) => x.id !== v.id) });
      toast.success('واریانت حذف شد');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'حذف ناموفق بود');
    } finally {
      setBusy(false);
    }
  };

  const editRow = (v: AdminProductDetailDTO['variants'][number]) => {
    setEditingId(v.id);
    setEditDraft({
      weightGrams: String(v.weightGrams),
      priceToman: String(v.priceToman),
      compareAtPriceToman: v.compareAtPriceToman == null ? '' : String(v.compareAtPriceToman),
      sku: v.sku ?? '',
      stock: String(v.stock),
      isActive: v.isActive,
    });
  };

  return (
    <section
      className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card"
      aria-label="واریانت‌های وزنی"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-black text-ink-900">
          واریانت‌های وزنی ({toFaDigits(product.variants.length)})
        </h2>
        <button
          type="button"
          onClick={() => {
            setShowAdd((s) => !s);
            setEditingId(null);
          }}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3 text-[11.5px] font-black text-white shadow-card transition-all active:scale-[0.98]"
        >
          {showAdd ? <X className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
          {showAdd ? 'بستن' : 'افزودن وزن'}
        </button>
      </div>

      {/* ——— فرم افزودن ——— */}
      {showAdd && (
        <div className="mb-4 rounded-2xl border border-brand-100 bg-brand-50/50 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Field label="وزن (گرم) *">
              <input dir="ltr" inputMode="numeric" value={draft.weightGrams}
                onChange={(e) => setDraft({ ...draft, weightGrams: e.target.value })}
                placeholder="250" className={cellInputCls} />
            </Field>
            <Field label="قیمت (تومان) *">
              <input dir="ltr" inputMode="numeric" value={draft.priceToman}
                onChange={(e) => setDraft({ ...draft, priceToman: e.target.value })}
                placeholder="489000" className={cellInputCls} />
            </Field>
            <Field label="قبل از تخفیف">
              <input dir="ltr" inputMode="numeric" value={draft.compareAtPriceToman}
                onChange={(e) => setDraft({ ...draft, compareAtPriceToman: e.target.value })}
                placeholder="—" className={cellInputCls} />
            </Field>
            <Field label="موجودی *">
              <input dir="ltr" inputMode="numeric" value={draft.stock}
                onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                placeholder="20" className={cellInputCls} />
            </Field>
            <Field label="SKU">
              <input dir="ltr" value={draft.sku}
                onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                placeholder="PST-250" className={cellInputCls} />
            </Field>
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                className="h-4 w-4 accent-brand-600" />
              <span className="text-[11px] font-bold text-ink-600">فعال</span>
            </label>
            <button type="button" onClick={() => void addVariant()} disabled={busy}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[11.5px] font-black text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
              ثبت واریانت
            </button>
          </div>
        </div>
      )}

      {/* ——— جدول واریانت‌ها ——— */}
      {product.variants.length === 0 ? (
        <p className="rounded-2xl bg-cream-50 px-3 py-4 text-center text-[11.5px] text-ink-400">
          هنوز واریانتی ندارد — محصول بدون واریانت در فروشگاه قابل خرید نیست
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-right">
            <thead>
              <tr className="border-b border-cream-200 text-[10.5px] font-bold text-ink-400">
                <th className="pb-2 font-bold">وزن</th>
                <th className="pb-2 font-bold">قیمت</th>
                <th className="pb-2 font-bold">قبل از تخفیف</th>
                <th className="pb-2 font-bold">موجودی</th>
                <th className="pb-2 font-bold">SKU</th>
                <th className="pb-2 font-bold">فعال</th>
                <th className="pb-2 font-bold">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) =>
                editingId === v.id ? (
                  <tr key={v.id} className="border-b border-cream-100 bg-brand-50/40">
                    <td className="py-2 pl-2">
                      <input dir="ltr" inputMode="numeric" value={editDraft.weightGrams}
                        onChange={(e) => setEditDraft({ ...editDraft, weightGrams: e.target.value })}
                        className={cellInputCls} aria-label="وزن" />
                    </td>
                    <td className="py-2 pl-2">
                      <input dir="ltr" inputMode="numeric" value={editDraft.priceToman}
                        onChange={(e) => setEditDraft({ ...editDraft, priceToman: e.target.value })}
                        className={cellInputCls} aria-label="قیمت" />
                    </td>
                    <td className="py-2 pl-2">
                      <input dir="ltr" inputMode="numeric" value={editDraft.compareAtPriceToman}
                        onChange={(e) => setEditDraft({ ...editDraft, compareAtPriceToman: e.target.value })}
                        className={cellInputCls} aria-label="قبل از تخفیف" />
                    </td>
                    <td className="py-2 pl-2">
                      <input dir="ltr" inputMode="numeric" value={editDraft.stock}
                        onChange={(e) => setEditDraft({ ...editDraft, stock: e.target.value })}
                        className={cellInputCls} aria-label="موجودی" />
                    </td>
                    <td className="py-2 pl-2">
                      <input dir="ltr" value={editDraft.sku}
                        onChange={(e) => setEditDraft({ ...editDraft, sku: e.target.value })}
                        className={cellInputCls} aria-label="SKU" />
                    </td>
                    <td className="py-2">
                      <input type="checkbox" checked={editDraft.isActive}
                        onChange={(e) => setEditDraft({ ...editDraft, isActive: e.target.checked })}
                        className="h-4 w-4 accent-brand-600" aria-label="فعال" />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => void saveEdit(v.id)} disabled={busy}
                          className="flex h-8 items-center rounded-lg bg-brand-600 px-2.5 text-[10.5px] font-black text-white disabled:opacity-60">
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : 'ذخیره'}
                        </button>
                        <button type="button" onClick={() => setEditingId(null)}
                          className="flex h-8 items-center rounded-lg bg-cream-100 px-2.5 text-[10.5px] font-black text-ink-600">
                          انصراف
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={v.id} className="border-b border-cream-100 last:border-0">
                    <td className="py-2.5 text-[12px] font-black text-ink-900">
                      {formatWeight(v.weightGrams)}
                    </td>
                    <td className="py-2.5 text-[12px] font-black text-brand-700">
                      {formatPrice(v.priceToman)}
                    </td>
                    <td className="py-2.5 text-[11.5px] text-ink-400">
                      {v.compareAtPriceToman ? formatPrice(v.compareAtPriceToman) : '—'}
                    </td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-black ${
                        v.stock === 0 ? 'bg-red-50 text-red-600' : v.stock <= 5 ? 'bg-gold-100 text-gold-700' : 'bg-brand-50 text-brand-700'
                      }`}>
                        {v.stock === 0 ? 'ناموجود' : toFaDigits(v.stock)}
                      </span>
                    </td>
                    <td dir="ltr" className="text-right text-[11px] text-ink-400">{v.sku ?? '—'}</td>
                    <td className="py-2.5">
                      <input type="checkbox" checked={v.isActive}
                        onChange={(e) => void toggleActive(v, e.target.checked)}
                        disabled={busy} className="h-4 w-4 accent-brand-600"
                        aria-label={`فعال بودن واریانت ${v.weightGrams} گرم`} />
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => editRow(v)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-600 transition-colors hover:bg-brand-50"
                          aria-label="ویرایش واریانت">
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        {v.hasOrders ? (
                          <span title="سابقه سفارش دارد — فقط غیرفعال‌سازی"
                            className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg text-ink-200">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        ) : (
                          <button type="button" onClick={() => void remove(v)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50"
                            aria-label="حذف واریانت">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-bold text-ink-500">{label}</span>
      {children}
    </div>
  );
}
