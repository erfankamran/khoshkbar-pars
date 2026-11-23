'use client';

import dynamic from 'next/dynamic';
import type { Variants } from 'framer-motion';
import type { AppRoute } from '@/stores/router-store';
import { HomeView } from './HomeView';

/**
 * انیمیشن انتقال بین نماها — جهت‌دار و مطابق RTL:
 * push: نمای جدید از چپ وارد می‌شود (جهت پیشروی در رابط فارسی)
 * pop:  نمای فعلی به چپ خارج و نمای قبلی از راست برمی‌گردد
 * tab:  تغییر محو و ظریف (بدون اسلاید — مانند تغییر تب اپ بومی)
 */
export const viewVariants: Variants = {
  enter: (dir: number) => {
    if (dir === 1) return { x: '-100%', opacity: 1 };
    if (dir === -1) return { x: '28%', opacity: 0.6 };
    return { x: '0%', opacity: 0, scale: 0.985 };
  },
  center: { x: '0%', opacity: 1, scale: 1 },
  exit: (dir: number) => {
    if (dir === 1) return { x: '28%', opacity: 0 };
    if (dir === -1) return { x: '-100%', opacity: 1 };
    return { x: '0%', opacity: 0, scale: 0.985 };
  },
};

/**
 * جای‌نگهدار سبک هنگام بارگیری chunk هر نما — فقط بار اول هر نما.
 * عمداً بدون کتابخانه تا خودش باری به باندل اضافه نکند.
 */
function ViewChunkLoading() {
  return <div aria-hidden className="min-h-[60vh] w-full animate-pulse bg-transparent" />;
}

/**
 * رجیستری نماها — هر صفحه فروشگاه یک View است.
 * Home eager است (نمای پیش‌فرض)؛ بقیه با dynamic از باندل اولیه خارج شده‌اند
 * تا صفحه اصلی بدون کد سبد/پرداخت/Passkey/سفارش‌ها hydrate شود (بازبینی پرفورمنس).
 * نمای‌های product در فاز ۷، cart/checkout/orders در فازهای ۸ و ۹ به این
 * رجیستری اضافه شدند؛ آدرس‌ها و تنظیمات اعلان‌ها در فازهای بعدی.
 */
const CategoryView = dynamic(() => import('./CategoryView').then((m) => m.CategoryView), { loading: ViewChunkLoading });
const CategoriesView = dynamic(() => import('./CategoriesView').then((m) => m.CategoriesView), { loading: ViewChunkLoading });
const ProductView = dynamic(() => import('./ProductView').then((m) => m.ProductView), { loading: ViewChunkLoading });
const SearchView = dynamic(() => import('./SearchView').then((m) => m.SearchView), { loading: ViewChunkLoading });
const FavoritesView = dynamic(() => import('./FavoritesView').then((m) => m.FavoritesView), { loading: ViewChunkLoading });
const CartView = dynamic(() => import('./CartView').then((m) => m.CartView), { loading: ViewChunkLoading });
const CheckoutView = dynamic(() => import('./CheckoutView').then((m) => m.CheckoutView), { loading: ViewChunkLoading });
const OrdersView = dynamic(() => import('./OrdersView').then((m) => m.OrdersView), { loading: ViewChunkLoading });
const OrderDetailView = dynamic(() => import('./OrderDetailView').then((m) => m.OrderDetailView), { loading: ViewChunkLoading });
const AccountView = dynamic(() => import('./AccountView').then((m) => m.AccountView), { loading: ViewChunkLoading });
const LoginView = dynamic(() => import('./LoginView').then((m) => m.LoginView), { loading: ViewChunkLoading });
const NotificationSettingsView = dynamic(() => import('./NotificationSettingsView').then((m) => m.NotificationSettingsView), { loading: ViewChunkLoading });
const AddressesView = dynamic(() => import('./AddressesView').then((m) => m.AddressesView), { loading: ViewChunkLoading });
const AboutView = dynamic(() => import('./AboutView').then((m) => m.AboutView), { loading: ViewChunkLoading });
const FaqView = dynamic(() => import('./FaqView').then((m) => m.FaqView), { loading: ViewChunkLoading });
const PageView = dynamic(() => import('./PageView').then((m) => m.PageView), { loading: ViewChunkLoading });
const BlogView = dynamic(() => import('./BlogView').then((m) => m.BlogView), { loading: ViewChunkLoading });
const BlogPostView = dynamic(() => import('./BlogPostView').then((m) => m.BlogPostView), { loading: ViewChunkLoading });
const ProfileView = dynamic(() => import('./ProfileView').then((m) => m.ProfileView), { loading: ViewChunkLoading });
const SecurityView = dynamic(() => import('./SecurityView').then((m) => m.SecurityView), { loading: ViewChunkLoading });

export function ViewRenderer({ route }: { route: AppRoute }) {
  switch (route.view) {
    case 'home':
      return <HomeView />;
    case 'categories':
      return <CategoriesView />;
    case 'category':
      return <CategoryView slug={route.params?.slug} />;
    case 'product':
      return <ProductView slug={route.params?.slug} />;
    case 'search':
      return <SearchView />;
    case 'favorites':
      return <FavoritesView />;
    case 'cart':
      return <CartView />;
    case 'checkout':
      return <CheckoutView />;
    case 'orders':
      return <OrdersView />;
    case 'orderDetail':
      return (
        <OrderDetailView
          code={route.params?.code}
          justCreated={route.params?.justCreated === '1'}
        />
      );
    case 'account':
      return <AccountView />;
    case 'login':
      return <LoginView redirect={route.params?.redirect} />;
    case 'notificationSettings':
      return <NotificationSettingsView />;
    case 'addresses':
      return <AddressesView />;
    case 'about':
      return <AboutView />;
    case 'faq':
      return <FaqView />;
    case 'page':
      // صفحهٔ اختصاصی با slug — قوانین و شرایط و ... (درخواست کاربر)
      return <PageView slug={route.params?.slug ?? ''} />;
    case 'blog':
      // وبلاگ (درخواست کاربر — تب منوی پایین جایگزین علاقه‌مندی)
      return <BlogView />;
    case 'blogPost':
      // نوشتهٔ وبلاگ با slug
      return <BlogPostView slug={route.params?.slug ?? ''} />;
    case 'profile':
      return <ProfileView />;
    case 'security':
      return <SecurityView />;
    default:
      return <HomeView />;
  }
}
