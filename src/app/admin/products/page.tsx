'use client';

import { useMemo, useState } from 'react';
import {
  ImageIcon,
  Package,
  Pencil,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { MediaUploadField } from '@/components/admin/MediaUploadField';
import {
  EmptyState,
  PageHeader,
  Toolbar,
  DeleteButton,
  mutationError,
} from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { apiPatch, apiPost } from '@/lib/api-client';
import { formatPrice, toFaDigits } from '@/lib/fa';
import { parseProductAttributes } from '@/lib/product-attributes';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * مدیریت محصولات (فاز ۱۴) — فهرست، ایجاد/ویرایش با واریانت وزنی و تصاویر
 * API: /api/admin/products (+ [id]) — همه تغییرات با reload منعطف
 */

interface VariantRow {
  id?: string;
  weightGrams: number;
  priceToman: number;
  compareAtPriceToman?: number | null;
  sku?: string | null;
  stock: number;
  isActive: boolean;
  isWholesale?: boolean;
  pricePerKgToman?: number | null;
}

interface ImageRow {
  url: string;
  alt?: string | null;
}

interface AdminProduct {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  description?: string | null;
  attributes?: string | null;
  isSuggested: boolean;
  isActive: boolean;
  salesCount: number;
  category: { id: string; title: string; slug: string };
  images: Array<{ url: string; alt: string | null }>;
  variants: VariantRow[];
  _count: { orderItems: number; reviews: number };
}

interface ProductsResp {
  products: AdminProduct[];
  total: number;
}

interface CategoryLite {
  id: string;
  title: string;
  slug: string;
  isActive: boolean;
}

interface AttrRow {
  key: string;
  value: string;
}

export default function AdminProductsPage() {
  return (
    <AdminShell>
      <ProductsContent />
    </AdminShell>
  );
}

function ProductsContent() {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [status, setStatus] = useState('all');

  const { data, loading, error, reload } = useApi<ProductsResp>(
    `/api/admin/products?page=1&pageSize=50&q=${encodeURIComponent(q)}&categoryId=${categoryId}&status=${status}`
  );
  const { data: cats } = useApi<{ categories: CategoryLite[] }>('/api/admin/categories');

  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleField = async (p: AdminProduct, field: 'isActive' | 'isSuggested') => {
    try {
      await apiPatch(`/api/admin/products/${p.id}`, { [field]: !p[field] });
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="محصولات"
        desc="مدیریت کاتالوگ، قیمت واریانت‌های وزنی و موجودی"
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white transition-colors hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            محصول جدید
          </button>
        }
      />

      <Toolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی عنوان یا اسلاگ…"
            className="h-9 border-0 bg-cream-50 pr-9 text-[12px]"
          />
        </div>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-9 w-44 border-0 bg-cream-50 text-[12px]">
            <SelectValue placeholder="دسته‌بندی" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه دسته‌ها</SelectItem>
            {cats?.categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-32 border-0 bg-cream-50 text-[12px]">
            <SelectValue placeholder="وضعیت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه</SelectItem>
            <SelectItem value="active">فعال</SelectItem>
            <SelectItem value="inactive">غیرفعال</SelectItem>
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={reload}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg bg-cream-100 text-ink-500 hover:bg-cream-200"
          aria-label="بازخوانی"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>
      </Toolbar>

      {loading ? (
        <div className="shimmer h-96 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={Package} title="دریافت محصولات ناموفق بود" hint={error ?? undefined} />
      ) : data.products.length === 0 ? (
        <EmptyState icon={Package} title="محصولی یافت نشد" hint="با دکمه «محصول جدید» اولین محصول را بسازید" />
      ) : (
        <>
          {/* موبایل — کارت‌های قابل لمس (کلیک روی کارت = ویرایش) */}
          <div className="space-y-2.5 md:hidden">
            {data.products.map((p) => (
              <ProductCard
                key={p.id}
                p={p}
                onEdit={() => setEditing(p)}
                onToggle={toggleField}
                onDeleted={reload}
              />
            ))}
          </div>

          {/* دسکتاپ — جدول کامل */}
          <div className="hidden overflow-hidden rounded-3xl border border-cream-200 bg-white md:block">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50/70 text-[10.5px] text-ink-400">
                  <th className="px-4 py-3 font-bold">محصول</th>
                  <th className="px-3 py-3 font-bold">دسته</th>
                  <th className="px-3 py-3 font-bold">واریانت‌ها</th>
                  <th className="px-3 py-3 font-bold">موجودی</th>
                  <th className="px-3 py-3 font-bold">فعال</th>
                  <th className="px-3 py-3 font-bold">پیشنهادی</th>
                  <th className="px-3 py-3 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <ProductRow
                    key={p.id}
                    p={p}
                    onEdit={() => setEditing(p)}
                    onToggle={toggleField}
                    onDeleted={reload}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {creating && (
        <ProductFormDialog
          categories={cats?.categories ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {editing && (
        <ProductFormDialog
          product={editing}
          categories={cats?.categories ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

/**
 * کارت محصول موبایل — کل کارت کلیک‌پذیر (ویرایش)، کلیدهای فعال/پیشنهادی مستقل
 */
function ProductCard({
  p,
  onEdit,
  onToggle,
  onDeleted,
}: {
  p: AdminProduct;
  onEdit: () => void;
  onToggle: (p: AdminProduct, f: 'isActive' | 'isSuggested') => void;
  onDeleted: () => void;
}) {
  const totalStock = p.variants.filter((v) => !v.isWholesale).reduce((s, v) => s + v.stock, 0);
  const prices = p.variants.filter((v) => !v.isWholesale).map((v) => v.priceToman);
  const priceLabel =
    prices.length > 0
      ? prices.length > 1 && Math.min(...prices) !== Math.max(...prices)
        ? `${formatPrice(Math.min(...prices))} – ${formatPrice(Math.max(...prices))}`
        : formatPrice(prices[0])
      : '—';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onEdit();
      }}
      className="cursor-pointer rounded-2xl border border-cream-200 bg-white p-3.5 transition-colors active:bg-cream-50"
      aria-label={`ویرایش ${p.title}`}
    >
      <div className="flex items-center gap-3">
        {p.images[0]?.url ? (
           
          <img
            src={p.images[0].url}
            alt={p.images[0].alt ?? `تصویر ${p.title}`}
            className="h-13 w-13 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl bg-cream-100 text-ink-300">
            <ImageIcon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-black text-ink-900">{p.title}</p>
          <p dir="ltr" className="truncate text-right text-[10px] text-ink-400">
            /{p.slug}
          </p>
          <p className="mt-0.5 text-[11px] font-bold text-ink-500">{p.category.title}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream-100 text-ink-500">
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>

      {/* کلیدها — جدا از ناحیه کلیک ویرایش کارت */}
      <div
        className="mt-3 flex items-center gap-3 border-t border-cream-100 pt-2.5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-bold text-ink-700">
            {toFaDigits(p.variants.length)} وزن — {priceLabel} تومان
          </span>
          <span
            className={`mt-0.5 text-[10.5px] font-black ${
              totalStock === 0 ? 'text-red-600' : 'text-ink-400'
            }`}
          >
            موجودی بستهٔ عادی: {toFaDigits(totalStock)}
          </span>
        </div>
        <label
          className="flex items-center gap-1.5 text-[10.5px] font-bold text-ink-500"
          aria-label={`فعال بودن ${p.title}`}
        >
          <Switch
            checked={p.isActive}
            onCheckedChange={() => onToggle(p, 'isActive')}
          />
          فعال
        </label>
        <button
          type="button"
          onClick={() => onToggle(p, 'isSuggested')}
          aria-label={`پیشنهادی بودن ${p.title}`}
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            p.isSuggested ? 'text-gold-500' : 'text-ink-200'
          }`}
        >
          <Star className={`h-4.5 w-4.5 ${p.isSuggested ? 'fill-gold-400' : ''}`} aria-hidden />
        </button>
        {/* حذف محصول — فاز حذف/اضافه؛ API آماده بود (۴۰۹ در صورت داشتن سفارش) */}
        <DeleteButton
          path={`/api/admin/products/${p.id}`}
          confirmText={`محصول «${p.title}» برای همیشه حذف شود؟`}
          onDeleted={onDeleted}
          icon={Trash2}
          className="h-9 shrink-0 justify-center px-2"
          label=""
        />
      </div>
    </div>
  );
}

function ProductRow({
  p,
  onEdit,
  onToggle,
  onDeleted,
}: {
  p: AdminProduct;
  onEdit: () => void;
  onToggle: (p: AdminProduct, f: 'isActive' | 'isSuggested') => void;
  onDeleted: () => void;
}) {
  const totalStock = p.variants.filter((v) => !v.isWholesale).reduce((s, v) => s + v.stock, 0);
  const prices = p.variants.filter((v) => !v.isWholesale).map((v) => v.priceToman);
  const priceLabel =
    prices.length > 0
      ? prices.length > 1 && Math.min(...prices) !== Math.max(...prices)
        ? `${formatPrice(Math.min(...prices))} – ${formatPrice(Math.max(...prices))}`
        : formatPrice(prices[0])
      : '—';

  return (
    <tr className="border-b border-cream-100 last:border-0 hover:bg-cream-50/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          {p.images[0]?.url ? (
             
            <img
              src={p.images[0].url}
              alt={p.images[0].alt ?? `تصویر ${p.title}`}
              className="h-10 w-10 rounded-xl object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cream-100 text-ink-300">
              <ImageIcon className="h-4 w-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-black text-ink-900">{p.title}</p>
            <p dir="ltr" className="text-right text-[10px] text-ink-400">
              /{p.slug}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-[11.5px] text-ink-600">{p.category.title}</td>
      <td className="px-3 py-3">
        <p className="text-[11.5px] font-bold text-ink-700">{toFaDigits(p.variants.length)} وزن</p>
        <p className="text-[10.5px] text-ink-400">{priceLabel} تومان</p>
      </td>
      <td className="px-3 py-3">
        <span className={totalStock === 0 ? 'text-[12px] font-black text-red-600' : 'text-[12px] font-bold text-ink-700'}>
          {toFaDigits(totalStock)} بستهٔ عادی
        </span>
      </td>
      <td className="px-3 py-3">
        <Switch checked={p.isActive} onCheckedChange={() => onToggle(p, 'isActive')} aria-label={`فعال بودن ${p.title}`} />
      </td>
      <td className="px-3 py-3">
        <button
          type="button"
          onClick={() => onToggle(p, 'isSuggested')}
          aria-label={`پیشنهادی بودن ${p.title}`}
          className={p.isSuggested ? 'text-gold-500' : 'text-ink-200 hover:text-gold-400'}
        >
          <Star className={`h-4 w-4 ${p.isSuggested ? 'fill-gold-400' : ''}`} aria-hidden />
        </button>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600 hover:bg-cream-200"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            ویرایش
          </button>
          <DeleteButton
            path={`/api/admin/products/${p.id}`}
            confirmText={`محصول «${p.title}» برای همیشه حذف شود؟`}
            onDeleted={onDeleted}
            icon={Trash2}
          />
        </div>
      </td>
    </tr>
  );
}

// ——— فرم ایجاد/ویرایش ———

function ProductFormDialog({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product?: AdminProduct;
  categories: CategoryLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    slug: product?.slug ?? '',
    title: product?.title ?? '',
    categoryId: product?.category.id ?? '',
    shortDescription: product?.shortDescription ?? '',
    description: product?.description ?? '',
    isSuggested: product?.isSuggested ?? false,
    isActive: product?.isActive ?? true,
  });
  const [attrs, setAttrs] = useState<AttrRow[]>(() => parseProductAttributes(product?.attributes));
  const [images, setImages] = useState<ImageRow[]>(
    product?.images.map((i) => ({ url: i.url, alt: i.alt })) ?? []
  );
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.variants.filter((v) => !v.isWholesale).map((v) => ({ ...v })) ?? [
      { weightGrams: 250, priceToman: 0, stock: 0, isActive: true },
    ]
  );
  const [saving, setSaving] = useState(false);
  const initialWholesale = product?.variants.find((variant) => variant.isWholesale && variant.isActive);
  const [wholesaleEnabled, setWholesaleEnabled] = useState(!!initialWholesale);
  const [wholesale, setWholesale] = useState({ weightGrams: initialWholesale?.weightGrams ?? 5000, pricePerKgToman: initialWholesale?.pricePerKgToman ?? 0, stock: initialWholesale?.stock ?? 0 });

  const canSave = useMemo(
    () =>
      form.title.trim().length >= 3 &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) &&
      form.categoryId !== '' &&
      variants.length > 0 &&
      variants.every((v) => v.priceToman >= 1000 && v.weightGrams >= 50) &&
      (!wholesaleEnabled || (wholesale.weightGrams >= 50 && wholesale.pricePerKgToman >= 1000 && wholesale.stock >= 0)),
    [form, variants, wholesaleEnabled, wholesale]
  );

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        shortDescription: form.shortDescription || null,
        description: form.description || null,
        attributes: attrs.filter((a) => a.key.trim() && a.value.trim()),
        images: images.filter((i) => i.url.trim()),
        wholesale: wholesaleEnabled ? { ...wholesale, isActive: true } : null,
        variants: variants.map((v) => ({
          weightGrams: v.weightGrams,
          priceToman: v.priceToman,
          compareAtPriceToman: v.compareAtPriceToman || null,
          sku: v.sku || null,
          stock: v.stock,
          isActive: v.isActive,
        })),
      };
      if (isEdit) {
        await apiPatch(`/api/admin/products/${product.id}`, payload);
        toast.success('محصول به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/products', payload);
        toast.success('محصول جدید ساخته شد');
      }
      onSaved();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-h-[94dvh] max-w-2xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEdit ? `ویرایش «${product.title}»` : 'محصول جدید'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pf-title">عنوان محصول *</Label>
              <Input
                id="pf-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-9 text-[12.5px]"
                placeholder="مثلاً پسته اکبری خوش‌رنگ"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-slug">اسلاگ (لاتین) *</Label>
              <Input
                id="pf-slug"
                dir="ltr"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                className="h-9 text-left font-mono text-[12px]"
                placeholder="pistachio-akbari"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>دسته‌بندی *</Label>
            <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
              <SelectTrigger className="h-9 text-[12px]">
                <SelectValue placeholder="انتخاب دسته" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-short">معرفی کوتاه</Label>
            <Input
              id="pf-short"
              value={form.shortDescription}
              onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
              className="h-9 text-[12.5px]"
              placeholder="یک خط معرفی زیر عنوان"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-desc">توضیحات کامل</Label>
            <Textarea
              id="pf-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="min-h-20 text-[12.5px]"
              rows={3}
            />
          </div>

          {/* ——— واریانت‌های وزنی ——— */}
          <section className="rounded-2xl border border-cream-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-black text-ink-800">واریانت‌های وزنی *</p>
              <button
                type="button"
                onClick={() =>
                  setVariants([...variants, { weightGrams: 500, priceToman: 0, stock: 0, isActive: true }])
                }
                className="flex h-7 items-center gap-1 rounded-lg bg-brand-50 px-2 text-[10.5px] font-black text-brand-700 hover:bg-brand-100"
              >
                <PlusCircle className="h-3 w-3" aria-hidden />
                افزودن وزن
              </button>
            </div>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-cream-50 p-2.5 sm:rounded-none sm:bg-transparent sm:p-0"
                >
                  <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1.2fr_1fr_1fr_auto]">
                    <div>
                      <Label className="text-[10px] text-ink-400">وزن (گرم)</Label>
                      <Input
                        type="number"
                        value={v.weightGrams}
                        onChange={(e) =>
                          setVariants(variants.map((x, j) => (j === i ? { ...x, weightGrams: Number(e.target.value) } : x)))
                        }
                        className="h-9 text-[12px] sm:h-8"
                        min={50}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-ink-400">قیمت (تومان)</Label>
                      <Input
                        type="number"
                        value={v.priceToman}
                        onChange={(e) =>
                          setVariants(variants.map((x, j) => (j === i ? { ...x, priceToman: Number(e.target.value) } : x)))
                        }
                        className="h-9 text-[12px] sm:h-8"
                        min={0}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-ink-400">موجودی</Label>
                      <Input
                        type="number"
                        value={v.stock}
                        onChange={(e) =>
                          setVariants(variants.map((x, j) => (j === i ? { ...x, stock: Number(e.target.value) } : x)))
                        }
                        className="h-9 text-[12px] sm:h-8"
                        min={0}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-ink-400">قبل تخفیف</Label>
                      <Input
                        type="number"
                        value={v.compareAtPriceToman ?? ''}
                        onChange={(e) =>
                          setVariants(
                            variants.map((x, j) =>
                              j === i ? { ...x, compareAtPriceToman: e.target.value ? Number(e.target.value) : null } : x
                            )
                          )
                        }
                        className="h-9 text-[12px] sm:h-8"
                        min={0}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                      disabled={variants.length <= 1}
                      className="col-span-2 mt-0.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-30 sm:col-span-1 sm:mb-0.5 sm:mt-0 sm:h-8 sm:w-8"
                      aria-label="حذف واریانت"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      حذف واریانت
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-3">
            <label className="flex min-h-11 items-center gap-2 text-xs font-black text-brand-800">
              <input type="checkbox" checked={wholesaleEnabled} onChange={(event) => setWholesaleEnabled(event.target.checked)} className="h-4 w-4 accent-brand-600" />
              فعال‌سازی خرید عمده برای همکاران
            </label>
            <p className="text-[11px] leading-6 text-ink-600">همکار وزن دلخواه را از حداقل تعیین‌شده به بالا انتخاب می‌کند. مبلغ = وزن به کیلو × قیمت هر کیلو. موجودی عمده جدا از بسته‌های عادی است.</p>
            {wholesaleEnabled && <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div><label htmlFor="wholesale-weight" className="text-xs font-bold">حداقل وزن خرید (کیلوگرم)</label><Input id="wholesale-weight" type="number" min={0.05} max={1000} step={0.001} value={wholesale.weightGrams / 1000} onChange={(event) => setWholesale({ ...wholesale, weightGrams: Math.round(Number(event.target.value) * 1000) })} /></div>
              <div><label htmlFor="wholesale-price" className="text-xs font-bold">قیمت هر کیلو (تومان)</label><Input id="wholesale-price" type="number" min={1000} max={100000000} step={1} value={wholesale.pricePerKgToman} onChange={(event) => setWholesale({ ...wholesale, pricePerKgToman: Number(event.target.value) })} /></div>
              <div><label htmlFor="wholesale-stock" className="text-xs font-bold">موجودی عمده (کیلوگرم)</label><Input id="wholesale-stock" type="number" min={0} max={1000} step={0.001} value={wholesale.stock / 1000} onChange={(event) => setWholesale({ ...wholesale, stock: Math.round(Number(event.target.value) * 1000) })} /></div>
            </div>}
          </section>
          {/* ——— تصاویر ——— */}
          <section className="rounded-2xl border border-cream-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-black text-ink-800">تصاویر (آپلود + alt فارسی)</p>
              <button
                type="button"
                onClick={() => setImages([...images, { url: '', alt: '' }])}
                className="flex h-7 items-center gap-1 rounded-lg bg-brand-50 px-2 text-[10.5px] font-black text-brand-700 hover:bg-brand-100"
              >
                <PlusCircle className="h-3 w-3" aria-hidden />
                افزودن تصویر
              </button>
            </div>
            <div className="space-y-2">
              {images.length === 0 && (
                <p className="text-[11px] text-ink-400">بدون تصویر — آیکون پیش‌فرض نمایش داده می‌شود</p>
              )}
              {images.map((img, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-cream-50 p-2.5 sm:rounded-none sm:bg-transparent sm:p-0"
                >
                  <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[128px_1.4fr_auto]">
                    {/* آپلود تصویر — کشیدن/کلیک؛ ذخیره در storage/media/products/ */}
                    <div className="w-full sm:w-32">
                      <MediaUploadField
                        value={img.url}
                        onChange={(url) =>
                          setImages(images.map((x, j) => (j === i ? { ...x, url } : x)))
                        }
                        ariaLabel={`تصویر ${i + 1} محصول`}
                        kind="products"
                        aspect="square"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-ink-400">متن alt</Label>
                      <Input
                        value={img.alt ?? ''}
                        onChange={(e) => setImages(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
                        className="h-9 text-[12px] sm:h-8"
                        placeholder="توضیح تصویر برای سئو"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setImages(images.filter((_, j) => j !== i))}
                      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold text-red-500 transition-colors hover:bg-red-50 sm:mb-0.5 sm:h-8 sm:w-8"
                      aria-label="حذف تصویر"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      حذف تصویر
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ——— ویژگی‌ها ——— */}
          <section className="rounded-2xl border border-cream-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-black text-ink-800">ویژگی‌ها (جدول مشخصات)</p>
              <button
                type="button"
                onClick={() => setAttrs([...attrs, { key: '', value: '' }])}
                className="flex h-7 items-center gap-1 rounded-lg bg-brand-50 px-2 text-[10.5px] font-black text-brand-700 hover:bg-brand-100"
              >
                <PlusCircle className="h-3 w-3" aria-hidden />
                افزودن ویژگی
              </button>
            </div>
            <div className="space-y-2">
              {attrs.map((a, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-cream-50 p-2.5 sm:rounded-none sm:bg-transparent sm:p-0"
                >
                  <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                    <Input
                      value={a.key}
                      onChange={(e) => setAttrs(attrs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                      className="h-9 text-[12px] sm:h-8"
                      placeholder="ویژگی (مثلاً منشأ)"
                    />
                    <Input
                      value={a.value}
                      onChange={(e) => setAttrs(attrs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      className="h-9 text-[12px] sm:h-8"
                      placeholder="مقدار (مثلاً رفسنجان)"
                    />
                    <button
                      type="button"
                      onClick={() => setAttrs(attrs.filter((_, j) => j !== i))}
                      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold text-red-500 transition-colors hover:bg-red-50 sm:mb-0.5 sm:h-8 sm:w-8"
                      aria-label="حذف ویژگی"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      حذف ویژگی
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-[12px] font-bold text-ink-700">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              فعال در فروشگاه
            </label>
            <label className="flex items-center gap-2 text-[12px] font-bold text-ink-700">
              <Switch checked={form.isSuggested} onCheckedChange={(v) => setForm({ ...form, isSuggested: v })} />
              پیشنهاد پارس
            </label>
          </div>

          {isEdit && (
            <p className="text-[10.5px] text-ink-400">
              نکته: واریانت با سفارش ثبت‌شده حذف نمی‌شود و فقط غیرفعال می‌گردد (حفظ تاریخ سفارش‌ها)
            </p>
          )}
        </div>

        <DialogFooter className="flex-row-reverse gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-5 text-[12.5px] font-black text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {isEdit ? 'ذخیره تغییرات' : 'ایجاد محصول'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-cream-200 px-4 text-[12px] font-bold text-ink-600 hover:bg-cream-100"
          >
            انصراف
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
