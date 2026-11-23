'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  ProductBasicFields,
  type ProductFormValues,
} from '@/components/admin/products/ProductBasicFields';
import { VariantsPanel } from '@/components/admin/products/VariantsPanel';
import { ImagesPanel } from '@/components/admin/products/ImagesPanel';
import { useApi } from '@/hooks/use-api';
import { apiDelete, apiPatch, ApiClientError } from '@/lib/api-client';
import { toFaDigits } from '@/lib/fa';
import { slugRegex } from '@/lib/admin-forms';
import type { AdminCategoryDTO, AdminProductDetailDTO } from '@/server/services/admin/catalog-admin.service';

/**
 * ویرایش محصول (فاز ۱۱.۲) — سه بخش: فیلدهای پایه + واریانت‌ها + تصاویر
 * اسلاگ در ویرایش قفل است (URL ثابت فروشگاه)؛ تغییرش آدرس‌های ایندکس‌شده را می‌شکند
 */

export default function AdminEditProductPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const { data: product, loading, error, reload } = useApi<AdminProductDetailDTO>(
    typeof id === 'string' && /^[a-z0-9]{20,40}$/i.test(id) ? `/api/admin/products/${id}` : null
  );
  const cats = useApi<{ items: AdminCategoryDTO[] }>('/api/admin/categories');

  const [values, setValues] = useState<ProductFormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // پرکردن فرم از داده سرور — فقط یک‌بار پس از رسیدن داده
  useEffect(() => {
    if (product && values === null) {
      setValues({
        slug: product.slug,
        title: product.title,
        categoryId: product.category.id,
        shortDescription: product.shortDescription ?? '',
        description: product.description ?? '',
        attributes: product.attributes,
        isSuggested: product.isSuggested,
        isActive: product.isActive,
      });
    }
  }, [product, values]);

  const dirty = useMemo(() => {
    if (!product || !values) return false;
    return (
      values.title !== product.title ||
      values.categoryId !== product.category.id ||
      values.shortDescription !== (product.shortDescription ?? '') ||
      values.description !== (product.description ?? '') ||
      JSON.stringify(values.attributes) !== JSON.stringify(product.attributes) ||
      values.isSuggested !== product.isSuggested ||
      values.isActive !== product.isActive
    );
  }, [product, values]);

  const save = async () => {
    if (!values || !product) return;
    if (values.title.trim().length < 2) {
      toast.error('عنوان حداقل ۲ کاراکتر است');
      return;
    }
    if (!values.categoryId) {
      toast.error('دسته‌بندی را انتخاب کنید');
      return;
    }
    setSaving(true);
    try {
      const updated = await apiPatch<AdminProductDetailDTO>(`/api/admin/products/${product.id}`, {
        title: values.title.trim(),
        categoryId: values.categoryId,
        shortDescription: values.shortDescription.trim() || undefined,
        description: values.description.trim() || undefined,
        attributes: values.attributes.filter((a) => a.k.trim() && a.v.trim()),
        isSuggested: values.isSuggested,
        isActive: values.isActive,
      });
      toast.success('تغییرات ذخیره شد');
      // پاسخ سرور مرجع حقیقت — state فرم با آن هم‌تراز می‌شود
      setValues({
        slug: updated.slug,
        title: updated.title,
        categoryId: updated.category.id,
        shortDescription: updated.shortDescription ?? '',
        description: updated.description ?? '',
        attributes: updated.attributes,
        isSuggested: updated.isSuggested,
        isActive: updated.isActive,
      });
      reload();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'ذخیره ناموفق بود');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    if (
      !window.confirm(
        `«${product.title}» برای همیشه حذف شود؟\nاگر سابقه سفارش دارد، حذف ممکن نیست و باید غیرفعال شود.`
      )
    )
      return;
    setDeleting(true);
    try {
      await apiDelete(`/api/admin/products/${product.id}`);
      toast.success('محصول حذف شد');
      router.push('/admin/products');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'حذف ناموفق بود');
      setDeleting(false);
    }
  };

  return (
    <AdminShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/products"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-cream-100 text-ink-600 transition-colors hover:bg-cream-200"
            aria-label="بازگشت به لیست"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <div>
            <h1 className="text-base font-black text-ink-900">
              {loading ? 'در حال بارگذاری…' : (product?.title ?? 'محصول')}
            </h1>
            {product && (
              <p className="mt-0.5 text-[11px] text-ink-400">
                {product.hasOrders
                  ? '⚠ این محصول سابقه سفارش دارد — حذف سخت ممکن نیست'
                  : `فروش کل: ${toFaDigits(product.salesCount)} عدد`}
              </p>
            )}
          </div>
        </div>
        {product && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={deleting}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-[11.5px] font-black text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            )}
            حذف محصول
          </button>
        )}
      </div>

      {loading && !product ? (
        <div className="space-y-3">
          <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
          <div className="shimmer h-40 rounded-3xl" aria-label="در حال بارگذاری" />
        </div>
      ) : error || !product ? (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-6 text-center">
          <p className="text-[13px] font-black text-red-700">{error ?? 'محصول یافت نشد'}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 h-10 rounded-xl bg-red-600 px-4 text-[12px] font-black text-white"
          >
            تلاش مجدد
          </button>
        </div>
      ) : (
        values && (
          <div className="space-y-5">
            {/* ——— فیلدهای پایه ——— */}
            <section
              className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card md:p-5"
              aria-label="فیلدهای محصول"
            >
              <ProductBasicFields
                values={values}
                onChange={setValues}
                categories={cats.data?.items ?? []}
                lockSlug
              />
              <div className="mt-4 flex items-center justify-end gap-3">
                {dirty && (
                  <span className="text-[11px] font-bold text-gold-700">
                    تغییرات ذخیره‌نشده دارد
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !dirty}
                  className="flex h-11 items-center gap-2 rounded-2xl bg-brand-600 px-6 text-[12.5px] font-black text-white shadow-card transition-all active:scale-[0.98] disabled:bg-cream-200 disabled:text-ink-400 disabled:shadow-none"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  ذخیره تغییرات
                </button>
              </div>
            </section>

            {/* ——— واریانت‌ها ——— */}
            <VariantsPanel product={product} onChanged={reload} />

            {/* ——— تصاویر ——— */}
            <ImagesPanel product={product} onChanged={reload} />
          </div>
        )
      )}
    </AdminShell>
  );
}
