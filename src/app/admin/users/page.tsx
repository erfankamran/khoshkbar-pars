'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapPin, RefreshCw, Search, ShieldAlert, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { IranProvinceMap } from '@/components/admin/IranProvinceMap';
import { UserDetailDialog } from '@/components/admin/UserDetailDialog';
import { EmptyState, PageHeader, Pill, Toolbar, mutationError } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { apiPatch } from '@/lib/api-client';
import { toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

/**
 * مدیریت کاربران (فاز ۱۴ + فیلتر جغرافیایی استان/شهر + نقشهٔ ایران — درخواست کاربر)
 * — فهرست، مسدودسازی (با ابطال نشست‌ها)، تغییر نقش، فیلتر استان/شهر
 * — نقشهٔ وکتوری پراکندگی مشتریان با اینپوت رنگی و کلید فعال/غیرفعال
 * گاردها سمت سرور: ویرایش خود → 400؛ حذف آخرین مدیر → 409
 */

interface AdminUserRow {
  id: string;
  phone: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  avatarUrl: string | null;
  _count: { orders: number; addresses: number };
  /** موقعیت کاربر از آدرس‌ها + snapshot سفارش‌ها — مرتب بر تکرار */
  locations: { provinces: string[]; cities: string[] };
}

interface UsersResp {
  users: AdminUserRow[];
  total: number;
}

interface UsersGeoResp {
  provinces: Array<{ name: string; users: number; cities: string[] }>;
  cities: Array<{ name: string; province: string; users: number }>;
}

interface MeResp {
  user: { id: string } | null;
}

const FILTERS = [
  { key: 'all', label: 'همه' },
  { key: 'active', label: 'فعال' },
  { key: 'blocked', label: 'مسدود' },
  { key: 'admins', label: 'مدیران' },
  { key: 'partners', label: 'همکاران' },
];

/** مقدار نگه‌دارندهٔ «همه» برای Select رادیکس (مقدار خالی مجاز نیست) */
const ALL = '__all__';

export default function AdminUsersPage() {
  return (
    <AdminShell>
      <UsersContent />
    </AdminShell>
  );
}

function UsersContent() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [detail, setDetail] = useState<string | null>(null);

  // ——— فیلتر جغرافیایی از URL (لینک نقشهٔ داشبورد: /admin/users?province=…&city=…) ———
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get('province');
    const c = sp.get('city');
    if (p) setProvince(p);
    if (c) setCity(c);
  }, []);

  const query = useMemo(() => {
    const sp = new URLSearchParams({ page: '1', pageSize: '50', filter });
    if (q.trim()) sp.set('q', q.trim());
    if (province) sp.set('province', province);
    if (city) sp.set('city', city);
    return `/api/admin/users?${sp.toString()}`;
  }, [q, filter, province, city]);

  const { data, loading, error, reload } = useApi<UsersResp>(query);
  const { data: geoData } = useApi<UsersGeoResp>('/api/admin/users/geo');
  const { data: me } = useApi<MeResp>('/api/auth/me');
  const selfId = me?.user?.id ?? null;

  // شهرهای استان انتخاب‌شده (وقتی استان خالی است، همهٔ شهرها)
  const cityOptions = useMemo(
    () => (geoData?.cities ?? []).filter((c) => !province || c.province === province),
    [geoData, province]
  );

  const changeProvince = (name: string) => {
    setProvince(name);
    // شهر منتخب ممکن است به استان جدید تعلق نداشته باشد → ریست
    setCity('');
  };

  const hasGeoFilter = !!(province || city);

  const patch = async (u: AdminUserRow, body: { isActive?: boolean; role?: string }) => {
    try {
      await apiPatch(`/api/admin/users/${u.id}`, body);
      toast.success('کاربر به‌روزرسانی شد');
      reload();
    } catch (e) {
      toast.error(mutationError(e));
      reload();
    }
  };

  return (
    <div>
      <PageHeader title="کاربران" desc="مدیریت دسترسی، مسدودسازی و نقش کاربران فروشگاه" />

      <Toolbar>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`h-8 rounded-full px-3 text-[11px] font-black ${
                filter === f.key ? 'bg-brand-600 text-white' : 'bg-cream-100 text-ink-500 hover:bg-cream-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-52 flex-1">
          <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی شماره یا نام…"
            className="h-9 border-0 bg-cream-50 pr-9 text-[12px]"
          />
        </div>
        <button
          type="button"
          onClick={reload}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg bg-cream-100 text-ink-500 hover:bg-cream-200"
          aria-label="بازخوانی"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>

        {/* ——— فیلتر استان / شهر (درخواست کاربر) ——— */}
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-cream-100 pt-2.5">
          <span className="sr-only">فیلتر جغرافیایی مشتریان</span>
          <span className="flex items-center gap-1 text-[10.5px] font-bold text-ink-400">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            موقعیت:
          </span>
          <Select value={province || ALL} onValueChange={(v) => changeProvince(v === ALL ? '' : v)}>
            <SelectTrigger className="h-8 w-44 border-0 bg-cream-50 text-[11.5px]" aria-label="فیلتر استان">
              <SelectValue placeholder="همهٔ استان‌ها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>همهٔ استان‌ها</SelectItem>
              {(geoData?.provinces ?? []).map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name} ({toFaDigits(p.users)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={city || ALL} onValueChange={(v) => setCity(v === ALL ? '' : v)}>
            <SelectTrigger className="h-8 w-44 border-0 bg-cream-50 text-[11.5px]" aria-label="فیلتر شهر">
              <SelectValue placeholder="همهٔ شهرها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>همهٔ شهرها</SelectItem>
              {cityOptions.map((c) => (
                <SelectItem key={`${c.province}-${c.name}`} value={c.name}>
                  {c.name} ({toFaDigits(c.users)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasGeoFilter && (
            <button
              type="button"
              onClick={() => {
                setProvince('');
                setCity('');
              }}
              className="flex h-8 items-center gap-1 rounded-full bg-red-50 px-2.5 text-[10.5px] font-black text-red-600 transition-colors hover:bg-red-100"
            >
              <X className="h-3 w-3" aria-hidden />
              پاک‌کردن فیلتر موقعیت
            </button>
          )}
        </div>
      </Toolbar>

      {/* ——— نقشهٔ وکتوری پراکندگی مشتریان به تفکیک استان (درخواست کاربر) ———
          کلیک روی استان ← فعال‌سازی فیلتر استان در جدول پایین؛ کلیک مجدد ← پاک‌کردن ——— */}
      <IranProvinceMap
        title="پراکندگی مشتریان — نقشهٔ ایران"
        storageKey="pars-admin-map-users"
        defaultColor="#17754b"
        unitLabel="مشتری"
        provinces={(geoData?.provinces ?? []).map((p) => ({
          name: p.name,
          value: p.users,
          cities: p.cities,
        }))}
        selectedProvince={province || null}
        onSelectProvince={(name) => changeProvince(name ?? '')}
        emptyText="هنوز مشتری با آدرس مشخص ثبت نشده است"
      />

      {loading ? (
        <div className="shimmer h-96 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={Users} title="دریافت کاربران ناموفق بود" hint={error ?? undefined} />
      ) : data.users.length === 0 ? (
        <EmptyState icon={Users} title="کاربری یافت نشد" />
      ) : (
        <>
          {/* موبایل — کارت‌های کاربر */}
          <div className="space-y-2.5 md:hidden">
            {data.users.map((u) => {
              const isSelf = u.id === selfId;
              return (
                <div
                  key={u.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetail(u.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setDetail(u.id);
                  }}
                  aria-label={`مشاهده جزئیات ${u.fullName?.trim() || u.phone}`}
                  className="cursor-pointer rounded-2xl border border-cream-200 bg-white p-3.5 transition-colors active:bg-cream-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {u.avatarUrl ? (
                         
                        <img
                          src={u.avatarUrl}
                          alt="آواتار"
                          className="h-9 w-9 shrink-0 rounded-full border border-cream-200 bg-cream-50 object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-100 text-[11px] font-black text-ink-400">
                          {(u.fullName ?? u.phone).trim().charAt(0)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-black text-ink-900">
                          {u.fullName?.trim() || 'مشتری پارس'}
                          {isSelf && <span className="mr-1.5 text-[10px] text-brand-600">(شما)</span>}
                        </p>
                        <p dir="ltr" className="text-right text-[10.5px] text-ink-400">
                          {u.phone}
                        </p>
                      </div>
                    </div>
                    {isSelf ? (
                      <Pill tone="green">مدیر</Pill>
                    ) : (
                      <Select value={u.role} onValueChange={(v) => void patch(u, { role: v })}>
                        <SelectTrigger
                          className="h-8 w-28 border-0 bg-cream-50 text-[11.5px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USER">مشتری</SelectItem>
                          <SelectItem value="PARTNER">همکار</SelectItem>
                          <SelectItem value="ADMIN">مدیر</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 border-t border-cream-100 pt-2.5">
                    <span className="text-[10.5px] text-ink-400">
                      {toFaDigits(u._count.orders)} سفارش — عضویت {formatJalaliDate(u.createdAt)}
                    </span>
                    {(u.locations.provinces.length > 0 || u.locations.cities.length > 0) && (
                      <span className="flex min-w-0 items-center gap-1 text-[10.5px] font-bold text-ink-500">
                        <MapPin className="h-3 w-3 shrink-0 text-brand-600" aria-hidden />
                        <span className="truncate">
                          {[u.locations.provinces[0], u.locations.cities[0]].filter(Boolean).join('، ')}
                          {u.locations.provinces.length > 1 &&
                            ` +${toFaDigits(u.locations.provinces.length - 1)} استان`}
                        </span>
                      </span>
                    )}
                    <span
                      className="ms-auto flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isSelf ? (
                        <span title="حساب خودتان قابل مسدودسازی نیست" className="inline-flex">
                          <ShieldAlert className="h-4 w-4 text-ink-300" aria-hidden />
                        </span>
                      ) : (
                        <Switch
                          checked={u.isActive}
                          onCheckedChange={(v) => void patch(u, { isActive: v })}
                          aria-label={`فعال بودن ${u.phone}`}
                        />
                      )}
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
                  <th className="px-4 py-3 font-bold">کاربر</th>
                  <th className="px-3 py-3 font-bold">استان / شهر</th>
                  <th className="px-3 py-3 font-bold">نقش</th>
                  <th className="px-3 py-3 font-bold">سفارش‌ها</th>
                  <th className="px-3 py-3 font-bold">عضویت</th>
                  <th className="px-3 py-3 font-bold">فعال</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => {
                  const isSelf = u.id === selfId;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setDetail(u.id)}
                      className="cursor-pointer border-b border-cream-100 last:border-0 hover:bg-cream-50/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {u.avatarUrl ? (
                             
                            <img
                              src={u.avatarUrl}
                              alt="آواتار"
                              className="h-9 w-9 shrink-0 rounded-full border border-cream-200 bg-cream-50 object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-100 text-[11px] font-black text-ink-400">
                              {(u.fullName ?? u.phone).trim().charAt(0)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-black text-ink-900">
                              {u.fullName?.trim() || 'مشتری پارس'}
                              {isSelf && <span className="mr-1.5 text-[10px] text-brand-600">(شما)</span>}
                            </p>
                            <p dir="ltr" className="text-right text-[10.5px] text-ink-400">
                              {u.phone}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <LocationCell locations={u.locations} />
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {isSelf ? (
                          <Pill tone="green">مدیر</Pill>
                        ) : (
                          <Select value={u.role} onValueChange={(v) => void patch(u, { role: v })}>
                            <SelectTrigger
                              className="h-8 w-28 border-0 bg-cream-50 text-[11.5px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USER">مشتری</SelectItem>
                              <SelectItem value="PARTNER">همکار</SelectItem>
                              <SelectItem value="ADMIN">مدیر</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[12px] font-bold text-ink-700">
                        {toFaDigits(u._count.orders)}
                      </td>
                      <td className="px-3 py-3 text-[10.5px] text-ink-400">
                        {formatJalaliDate(u.createdAt)}
                        {u.lastLoginAt && (
                          <span className="block">آخرین ورود: {formatJalaliDate(u.lastLoginAt)}</span>
                        )}
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {isSelf ? (
                          <span title="حساب خودتان قابل مسدودسازی نیست" className="inline-flex">
                            <ShieldAlert className="h-4 w-4 text-ink-300" aria-hidden />
                          </span>
                        ) : (
                          <Switch
                            checked={u.isActive}
                            onCheckedChange={(v) => void patch(u, { isActive: v })}
                            aria-label={`فعال بودن ${u.phone}`}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail && <UserDetailDialog id={detail} onClose={() => setDetail(null)} onChanged={reload} />}
    </div>
  );
}

// جزئیات کاربر به کامپوننت مشترک منتقل شد:
// src/components/admin/UserDetailDialog.tsx — هم داشبورد هم این صفحه از آن استفاده می‌کنند

/** سلول موقعیت — استان اول + شهرها (از آدرس‌ها و snapshot سفارش‌ها) */
function LocationCell({ locations }: { locations: AdminUserRow['locations'] }) {
  if (locations.provinces.length === 0 && locations.cities.length === 0) {
    return <span className="text-[10.5px] text-ink-300">—</span>;
  }
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[11.5px] font-black text-ink-700">
        <MapPin className="h-3 w-3 shrink-0 text-brand-600" aria-hidden />
        {locations.provinces[0] ?? '—'}
        {locations.provinces.length > 1 && (
          <span className="text-[9.5px] font-bold text-ink-300">
            +{toFaDigits(locations.provinces.length - 1)} استان
          </span>
        )}
      </p>
      {locations.cities.length > 0 && (
        <p className="mt-0.5 truncate text-[10px] text-ink-400">
          {locations.cities.slice(0, 2).join('، ')}
          {locations.cities.length > 2 &&
            ` و ${toFaDigits(locations.cities.length - 2)} شهر دیگر`}
        </p>
      )}
    </div>
  );
}
