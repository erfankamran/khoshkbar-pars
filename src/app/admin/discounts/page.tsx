'use client';

import { useState } from 'react';
import { Pencil, Plus, RefreshCw, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import {
  DeleteButton,
  EmptyState,
  PageHeader,
  Pill,
  Toolbar,
  mutationError,
} from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { apiPatch, apiPost } from '@/lib/api-client';
import { formatPrice, toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * مدیریت کدهای تخفیف (فاز ۱۴) — ایجاد/ویرایش/حذف با آمار مصرف
 */

interface AdminDiscount {
  id: string;
  code: string;
  type: string;
  value: number;
  minSubtotalToman: number | null;
  maxDiscountToman: number | null;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

export default function AdminDiscountsPage() {
  return (
    <AdminShell>
      <DiscountsContent />
    </AdminShell>
  );
}

function DiscountsContent() {
  const { data, loading, error, reload } = useApi<{
    discounts: AdminDiscount[];
    total: number;
  }>('/api/admin/discounts?page=1&pageSize=50');
  const [editing, setEditing] = useState<AdminDiscount | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleActive = async (d: AdminDiscount) => {
    try {
      await apiPatch(`/api/admin/discounts/${d.id}`, { isActive: !d.isActive });
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  const valueLabel = (d: AdminDiscount) =>
    d.type === 'PERCENT' ? `${toFaDigits(d.value)}٪` : `${formatPrice(d.value)} تومان`;

  return (
    <div>
      <PageHeader
        title="کدهای تخفیف"
        desc="ساخت و مدیریت کدهای تخفیف درصدی یا مبلغ ثابت"
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            کد جدید
          </button>
        }
      />

      {loading ? (
        <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={Tag} title="دریافت کدها ناموفق بود" hint={error ?? undefined} />
      ) : data.discounts.length === 0 ? (
        <EmptyState icon={Tag} title="کد تخفیفی ثبت نشده است" hint="اولین کد را بسازید" />
      ) : (
        <>
          {/* موبایل — کارت‌های کد تخفیف */}
          <div className="space-y-2.5 md:hidden">
            {data.discounts.map((d) => {
              const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
              return (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(d)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setEditing(d);
                  }}
                  aria-label={`ویرایش کد ${d.code}`}
                  className="cursor-pointer rounded-2xl border border-cream-200 bg-white p-3.5 transition-colors active:bg-cream-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p dir="ltr" className="font-mono text-[12.5px] font-black text-ink-900">
                      {d.code}
                    </p>
                    <span className="text-[12px] font-black text-brand-700">{valueLabel(d)}</span>
                  </div>
                  {d.maxDiscountToman ? (
                    <p className="mt-0.5 text-[10px] text-ink-400">سقف: {formatPrice(d.maxDiscountToman)}</p>
                  ) : null}
                  <div
                    className="mt-2.5 flex items-center gap-2 border-t border-cream-100 pt-2.5"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Pill tone={d.usageLimit && d.usedCount >= d.usageLimit ? 'gold' : 'ink'}>
                      {toFaDigits(d.usedCount)}
                      {d.usageLimit ? ` / ${toFaDigits(d.usageLimit)}` : ''}
                    </Pill>
                    {expired ? (
                      <Pill tone="red">منقضی</Pill>
                    ) : (
                      <span className="text-[10.5px] text-ink-400">
                        {d.expiresAt ? `تا ${formatJalaliDate(d.expiresAt)}` : 'بدون انقضا'}
                      </span>
                    )}
                    <span className="ms-auto flex items-center gap-1">
                      <Switch
                        checked={d.isActive}
                        onCheckedChange={() => void toggleActive(d)}
                        aria-label={`فعال بودن ${d.code}`}
                      />
                      <button
                        type="button"
                        onClick={() => setEditing(d)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-cream-100 text-ink-600"
                        aria-label={`ویرایش کد ${d.code}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <DeleteButton
                        path={`/api/admin/discounts/${d.id}`}
                        confirmText={`کد «${d.code}» حذف شود؟`}
                        onDeleted={reload}
                        className="h-9 w-9 justify-center px-0"
                      />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* دسکتاپ — جدول کامل */}
          <div className="hidden overflow-hidden rounded-3xl border border-cream-200 bg-white md:block">
            <table className="w-full text-right">
            <thead>
              <tr className="border-b border-cream-200 bg-cream-50/70 text-[10.5px] text-ink-400">
                <th className="px-4 py-3 font-bold">کد</th>
                <th className="px-3 py-3 font-bold">مقدار</th>
                <th className="px-3 py-3 font-bold">مصرف</th>
                <th className="px-3 py-3 font-bold">اعتبار</th>
                <th className="px-3 py-3 font-bold">فعال</th>
                <th className="px-3 py-3 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {data.discounts.map((d) => {
                const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
                return (
                  <tr key={d.id} className="border-b border-cream-100 last:border-0 hover:bg-cream-50/50">
                    <td className="px-4 py-3">
                      <p dir="ltr" className="text-right font-mono text-[12px] font-black text-ink-900">
                        {d.code}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-[12px] font-bold text-ink-700">
                      {valueLabel(d)}
                      {d.maxDiscountToman ? (
                        <span className="block text-[10px] text-ink-400">
                          سقف: {formatPrice(d.maxDiscountToman)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone={d.usageLimit && d.usedCount >= d.usageLimit ? 'gold' : 'ink'}>
                        {toFaDigits(d.usedCount)}
                        {d.usageLimit ? ` / ${toFaDigits(d.usageLimit)}` : ''}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-[10.5px] text-ink-400">
                      {expired ? (
                        <Pill tone="red">منقضی</Pill>
                      ) : d.expiresAt ? (
                        `تا ${formatJalaliDate(d.expiresAt)}`
                      ) : (
                        'بدون انقضا'
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Switch checked={d.isActive} onCheckedChange={() => void toggleActive(d)} aria-label={`فعال بودن ${d.code}`} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(d)}
                          className="flex h-8 items-center gap-1 rounded-lg bg-cream-100 px-2.5 text-[11px] font-bold text-ink-600 hover:bg-cream-200"
                        >
                          <Pencil className="h-3 w-3" aria-hidden />
                          ویرایش
                        </button>
                        <DeleteButton
                          path={`/api/admin/discounts/${d.id}`}
                          confirmText={`کد «${d.code}» حذف شود؟`}
                          onDeleted={reload}
                          className="px-2"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {(creating || editing) && (
        <DiscountFormDialog
          discount={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function DiscountFormDialog({
  discount,
  onClose,
  onSaved,
}: {
  discount?: AdminDiscount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!discount;
  const [form, setForm] = useState({
    code: discount?.code ?? '',
    type: discount?.type ?? 'PERCENT',
    value: discount?.value ?? 10,
    minSubtotalToman: discount?.minSubtotalToman ?? 0,
    maxDiscountToman: discount?.maxDiscountToman ?? 0,
    usageLimit: discount?.usageLimit ?? 0,
    startsAt: discount?.startsAt ? discount.startsAt.slice(0, 10) : '',
    expiresAt: discount?.expiresAt ? discount.expiresAt.slice(0, 10) : '',
    isActive: discount?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const canSave =
    /^[A-Za-z0-9-]{3,24}$/.test(form.code) &&
    form.value >= 1 &&
    (form.type !== 'PERCENT' || form.value <= 100);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...(isEdit ? {} : { code: form.code.toUpperCase() }),
        type: form.type as 'PERCENT' | 'FIXED',
        value: form.value,
        minSubtotalToman: form.minSubtotalToman > 0 ? form.minSubtotalToman : null,
        maxDiscountToman: form.maxDiscountToman > 0 ? form.maxDiscountToman : null,
        usageLimit: form.usageLimit > 0 ? form.usageLimit : null,
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00+03:30`).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59+03:30`).toISOString() : null,
        isActive: form.isActive,
      };
      if (isEdit) {
        await apiPatch(`/api/admin/discounts/${discount.id}`, payload);
        toast.success('کد تخفیف به‌روزرسانی شد');
      } else {
        await apiPost('/api/admin/discounts', payload);
        toast.success('کد تخفیف ساخته شد');
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
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEdit ? `ویرایش کد ${discount.code}` : 'کد تخفیف جدید'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="df-code">کد (لاتین، حروف بزرگ) *</Label>
              <Input
                id="df-code"
                dir="ltr"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="h-9 text-left font-mono text-[13px]"
                placeholder="PARS-YALDA"
              />
            </div>
          )}
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نوع</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">درصدی</SelectItem>
                  <SelectItem value="FIXED">مبلغ ثابت</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="df-value">
                {form.type === 'PERCENT' ? 'درصد (۱ تا ۱۰۰) *' : 'مبلغ (تومان) *'}
              </Label>
              <Input
                id="df-value"
                type="number"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                className="h-9 text-[12px]"
                min={1}
                max={form.type === 'PERCENT' ? 100 : undefined}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="df-min">حداقل مبلغ سبد (تومان)</Label>
              <Input
                id="df-min"
                type="number"
                value={form.minSubtotalToman}
                onChange={(e) => setForm({ ...form, minSubtotalToman: Number(e.target.value) })}
                className="h-9 text-[12px]"
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="df-max">سقف تخفیف (تومان)</Label>
              <Input
                id="df-max"
                type="number"
                value={form.maxDiscountToman}
                onChange={(e) => setForm({ ...form, maxDiscountToman: Number(e.target.value) })}
                className="h-9 text-[12px]"
                min={0}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="df-limit">سقف مصرف</Label>
              <Input
                id="df-limit"
                type="number"
                value={form.usageLimit}
                onChange={(e) => setForm({ ...form, usageLimit: Number(e.target.value) })}
                className="h-9 text-[12px]"
                min={0}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="df-start">شروع</Label>
              <Input
                id="df-start"
                type="date"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className="h-9 text-[11px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="df-exp">انقضا</Label>
              <Input
                id="df-exp"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="h-9 text-[11px]"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] font-bold text-ink-700">
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            فعال
          </label>
        </div>
        <DialogFooter className="flex-row-reverse gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-5 text-[12.5px] font-black text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {isEdit ? 'ذخیره' : 'ایجاد کد'}
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
