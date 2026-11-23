'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Clapperboard,
  FileStack,
  FileText,
  FolderTree,
  Image,
  Images,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Newspaper,
  Package,
  Rss,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/lib/api-client';
import { useApi } from '@/hooks/use-api';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { useAuthStore } from '@/stores/auth-store';

/**
 * پوسته پنل مدیریت (فاز ۱۱.۱ + فاز ۱۴ + موبایل) — Sidebar راست (RTL) + نوار بالا چسبان
 *
 * - گیت احراز هویت: /api/auth/me → نقش ADMIN لازم است؛ در غیر این صورت
 *   ریدایرکت به /admin/login (کنترل واقعی مجوز در requireAdmin سمت سرور)
 * - فاز ۱۴: همه ماژول‌ها فعال شدند — محصولات، سفارش‌ها، دسته‌ها، بنرها،
 *   استوری‌ها، تخفیف، نظرات، کاربران، اعلان‌ها و تنظیمات
 * - موبایل: نوار بالا sticky است و با ورود به هر بخش، چیپ فعال به‌صورت خودکار
 *   به وسط نوار ناوبری اسکرول می‌شود تا همیشه در دید باشد
 */

interface MeResponse {
  user: {
    id: string;
    fullName: string | null;
    phone: string;
    role: string;
    avatarUrl?: string | null;
  } | null;
}

/**
 * ترتیب بخش‌ها طبق درخواست مدیر: داشبورد، سفارش‌ها، محصولات، دسته‌بندی،
 * کد تخفیف، کاربران، نظرات، استوری‌ها، بنرها، اعلان، فید و سئو، تنظیمات
 * به‌روزرسانی فاز آواتار: بخش «محتوا» (FAQ/تماس/نمادها/فوتر) به انتهای لیست
 * منتقل شد تا ترتیب دقیقاً همان ۱۲ بخش مورد تأیید مدیر باشد.
 * گروه‌بندی جدید (درخواست مدیر): بخش‌های مرتبط کنار هم — فروشگاهی، محتوایی
 * و سئو، تنظیمات و اطلاع‌رسانی؛ داشبورد بدون عنوان گروه، بالای فهرست.
 * در موبایل هم مرز گروه‌ها با یک نقطه‌ی کوچک بین چیپ‌ها حفظ می‌شود.
 */
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  ready: boolean;
};

const NAV_GROUPS: Array<{ title: string | null; items: NavItem[] }> = [
  {
    title: null,
    items: [{ href: '/admin', label: 'داشبورد', icon: LayoutDashboard, ready: true }],
  },
  {
    // ——— بخش‌های فروشگاهی: چرخه کامل فروش از سفارش تا مشتری ———
    title: 'فروشگاه',
    items: [
      { href: '/admin/orders', label: 'سفارش‌ها', icon: ShoppingBag, ready: true },
      { href: '/admin/products', label: 'محصولات', icon: Package, ready: true },
      { href: '/admin/categories', label: 'دسته‌بندی‌ها', icon: FolderTree, ready: true },
      { href: '/admin/discounts', label: 'کدهای تخفیف', icon: Tag, ready: true },
      { href: '/admin/users', label: 'کاربران', icon: Users, ready: true },
      { href: '/admin/partners', label: 'درخواست همکاری', icon: Users, ready: true },
      { href: '/admin/reviews', label: 'نظرات', icon: MessageSquareText, ready: true },
    ],
  },
  {
    // ——— بخش‌های محتوایی: رسانه، صفحه‌سازی و سئو (وبلاگ + گالری درخواست کاربر) ———
    title: 'محتوا و سئو',
    items: [
      { href: '/admin/blog', label: 'وبلاگ', icon: Newspaper, ready: true },
      { href: '/admin/gallery', label: 'گالری', icon: Images, ready: true },
      { href: '/admin/stories', label: 'استوری‌ها', icon: Clapperboard, ready: true },
      { href: '/admin/banners', label: 'بنرها', icon: Image, ready: true },
      { href: '/admin/pages', label: 'صفحات', icon: FileStack, ready: true },
      { href: '/admin/content', label: 'محتوا', icon: FileText, ready: true },
      { href: '/admin/feeds', label: 'فید و سئو', icon: Rss, ready: true },
    ],
  },
  {
    // ——— تنظیمات و اطلاع‌رسانی ———
    title: 'تنظیمات و اطلاع‌رسانی',
    items: [
      { href: '/admin/notifications', label: 'اعلان‌ها', icon: Bell, ready: true },
      { href: '/admin/settings', label: 'تنظیمات', icon: Settings, ready: true },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me, loading } = useApi<MeResponse>('/api/auth/me');

  const isAdmin = me?.user?.role === 'ADMIN';

  // همگام‌سازی هویت مدیر با auth-store مشترک — زنگولهٔ اعلان‌ها از همین
  // store تغذیه می‌شود و در /admin (بدون AppShell فروشگاه) باید hydrate شود
  useEffect(() => {
    if (me?.user) {
      useAuthStore.getState().setUser({
        id: me.user.id,
        phone: me.user.phone,
        fullName: me.user.fullName,
        role: me.user.role,
        avatarUrl: me.user.avatarUrl ?? null,
      });
    }
  }, [me]);

  // چیپ فعال موبایل — با تغییر بخش یا بعد از گیت احراز هویت، خودکار به وسط
  // نوار اسکرول می‌شود تا همیشه در دید باشد (در بارگذاری مستقیم هم کار می‌کند)
  const chipRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  useEffect(() => {
    if (loading || !isAdmin) return;
    const id = window.setTimeout(() => {
      chipRefs.current[pathname]?.scrollIntoView({
        inline: 'center',
        block: 'nearest',
        behavior: 'smooth',
      });
    }, 80);
    return () => window.clearTimeout(id);
  }, [pathname, loading, isAdmin]);

  // گیت — پس از مشخص شدن وضعیت؛ بدون حلقه (فقط یک‌بار ریدایرکت)
  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/admin/login');
    }
  }, [loading, isAdmin, router]);

  const handleLogout = async () => {
    try {
      await apiPost('/api/auth/logout');
    } finally {
      toast.success('از پنل مدیریت خارج شدید');
      router.replace('/admin/login');
    }
  };

  // ——— وضعیت نشست هنوز نامشخص ———
  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-50">
        <div className="flex flex-col items-center gap-3">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" aria-label="در حال بارگذاری" />
          <p className="text-xs font-bold text-ink-400">بررسی دسترسی مدیر…</p>
        </div>
      </div>
    );
  }

  const user = me!.user!;

  return (
    <div className="flex min-h-screen">
      {/* ——— Sidebar (راست در RTL) ——— */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-brand-950 md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-400/15 text-lg font-black text-gold-300">
            پ
          </span>
          <div>
            <p className="text-sm font-black text-white">پنل پارس</p>
            <p className="text-[10px] text-brand-300">مدیریت فروشگاه</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="ناوبری مدیریت">
          {NAV_GROUPS.map((group) => {
            const items = group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              if (!item.ready) {
                return (
                  <span
                    key={item.href}
                    aria-disabled="true"
                    className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-bold text-brand-500/60"
                    title="در زیرفازهای بعدی فعال می‌شود"
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {item.label}
                    <span className="mr-auto rounded-full bg-brand-900/60 px-1.5 py-0.5 text-[9px] font-black text-brand-400">
                      به‌زودی
                    </span>
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-bold transition-colors ${
                    active
                      ? 'bg-brand-600 text-white shadow-card'
                      : 'text-brand-200 hover:bg-brand-900 hover:text-white'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              );
            });
            return (
              <div key={group.title ?? 'داشبورد'} className={group.title ? 'mt-3' : undefined}>
                {group.title && (
                  <p className="px-3 pb-1 pt-1.5 text-[9.5px] font-black tracking-wide text-brand-400">
                    {group.title}
                  </p>
                )}
                <div className="space-y-0.5">{items}</div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-brand-900 px-3 py-3">
          <a
            href="/"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-bold text-brand-200 transition-colors hover:bg-brand-900 hover:text-white"
          >
            <Store className="h-4 w-4" aria-hidden />
            مشاهده فروشگاه
          </a>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-bold text-red-300/90 transition-colors hover:bg-brand-900"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            خروج از پنل
          </button>
        </div>
      </aside>

      {/* ——— محتوا ——— */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* نوار بالا — موبایل: ناوبری افقی */}
        <header className="sticky top-0 z-30 border-b border-cream-200 bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 md:px-6">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-950 text-sm font-black text-gold-300 md:hidden">
              پ
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-black text-ink-900">
                {user.fullName ?? 'مدیر فروشگاه'}
              </p>
              <p dir="ltr" className="text-right text-[10px] text-ink-400">
                {user.phone}
              </p>
            </div>
            {/* زنگوله اعلان‌ها — رویدادهای سبد/سفارش/پرداخت + دایرهٔ قرمز خوانده‌نشده */}
            <NotificationBell variant="admin" />
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="mr-auto flex h-9 items-center gap-1.5 rounded-xl border border-cream-200 px-3 text-[11px] font-bold text-ink-600 transition-colors hover:bg-cream-100 md:hidden"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              خروج
            </button>
          </div>
          {/* ناوبری افقی موبایل — چسبان زیر نوار بالا؛ چیپ فعال همیشه در دید؛
              مرز گروه‌ها با نقطه‌ی کوچک بین چیپ‌ها نشان داده می‌شود */}
          <nav
            className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2.5 md:hidden"
            aria-label="ناوبری مدیریت"
          >
            {NAV_GROUPS.flatMap((group, groupIndex) => {
              const chips = group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    ref={(el) => {
                      chipRefs.current[item.href] = el;
                    }}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[11.5px] font-black transition-colors ${
                      active
                        ? 'bg-brand-600 text-white shadow-card'
                        : 'bg-cream-100 text-ink-600'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {item.label}
                  </Link>
                );
              });
              return groupIndex === 0
                ? chips
                : [
                    <span
                      key={`group-sep-${group.title ?? groupIndex}`}
                      aria-hidden
                      className="mx-0.5 h-1 w-1 shrink-0 self-center rounded-full bg-cream-300"
                    />,
                    ...chips,
                  ];
            })}
          </nav>
        </header>

        <main className="flex-1 px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  );
}
