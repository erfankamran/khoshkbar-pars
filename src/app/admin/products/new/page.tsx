'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  EMPTY_PRODUCT_FORM,
  ProductBasicFields,
  type ProductFormValues,
} from '@/components/admin/products/ProductBasicFields';
import { useApi } from '@/hooks/use-api';
import { apiPost, ApiClientError } from '@/lib/api-client';
import { slugRegex } from '@/lib/admin-forms';
import type { AdminCategoryDTO, AdminProductDetailDTO } from '@/server/services/admin/catalog-admin.service';

/**
 * ایجاد محصول جدید (فاز ۱۱.۲) — مرحله ۱: فیلدهای پایه
 * پس از ثبت، به صفحه ویرایش هدایت می‌شویم تا واریانت/تصویر اضافه شود
 * (واریانت اجباری است — محصول بدون واریانت قابل خرید نیست)
 */

export default function AdminNewProductPage() {
  const router = useRouter();
  const cats = useApi<{ items: AdminCategoryDTO[] }>('/api/admin/categories');
  const [values, setValues] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // دسته پیش‌فرض به‌صورت مشتق‌شده در رندر (الگوی رسمی React — بدون effect)
  const defaultCategoryId = useMemo(
    () => cats.data?.items.find((c) => c.isActive)?.id ?? '',
    [cats.data]
  );
  const effectiveValues: ProductFormValues = {
    ...values,
    categoryId: values.categoryId || defaultCategoryId,
  };

  const canSubmit = useMemo(
    () =>
      effectiveValues.title.trim().length >= 2 &&
      slugRegex.test(effectiveValues.slug.trim()) &&
      effectiveValues.categoryId !== '' &&
      !submitting,
    [effectiveValues, submitting]
  );

  const submit = async () => {
    setErr(null);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const created = await apiPost<AdminProductDetailDTO>('/api/admin/products', {
        slug: effectiveValues.slug.trim(),
        title: effectiveValues.title.trim(),
        categoryId: effectiveValues.categoryId,
        shortDescription: effectiveValues.shortDescription.trim() || undefined,
        description: effectiveValues.description.trim() || undefined,
        attributes: effectiveValues.attributes.filter((a) => a.k.trim() && a.v.trim()),
        isSuggested: effectiveValues.isSuggested,
        isActive: effectiveValues.isActive,
      });
      toast.success('محصول ساخته شد — اکنون واریانت وزنی اضافه کنید');
      router.push(`/admin/products/${created.id}`);
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : 'ایجاد محصول ناموفق بود');
      setSubmitting(false);
    }
  };

  return (
    <AdminShell>
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/admin/products"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-cream-100 text-ink-600 transition-colors hover:bg-cream-200"
          aria-label="بازگشت به لیست"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <h1 className="text-base font-black text-ink-900">محصول جدید</h1>
      </div>

      <div className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card md:p-5">
        <ProductBasicFields
          values={effectiveValues}
          onChange={setValues}
          categories={cats.data?.items ?? []}
        />

        {err && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[11.5px] font-black text-red-600">
            {err}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="flex h-11 items-center gap-2 rounded-2xl bg-brand-600 px-6 text-[12.5px] font-black text-white shadow-card transition-all active:scale-[0.98] disabled:bg-cream-200 disabled:text-ink-400 disabled:shadow-none"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            ثبت و ادامه (افزودن واریانت)
          </button>
        </div>
      </div>
    </AdminShell>
  );
}
