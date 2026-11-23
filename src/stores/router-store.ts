import { create } from 'zustand';

/**
 * روتر داخلی اپلیکیشن پارس
 *
 * چرا روتر داخلی؟
 * 1) تجربه اپلیکیشن موبایل: انتقال نرم بین نماها (push/pop) بدون رفرش و بدون
 *    از دست رفتن وضعیت سبد و اسکرول — دقیقاً مانند اپ‌های بومی.
 * 2) پشتیبانی از دکمه Back موبایل/مرورگر از طریق history API.
 * 3) تمام صفحات فروشگاه روی مسیر «/» سرو می‌شوند (الزام محیط پیش‌نمایش) و
 *    ناوبری کاملاً سمت کلاینت مدیریت می‌شود.
 */

export type ViewName =
  | 'home'
  | 'categories'
  | 'category'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'favorites'
  | 'account'
  | 'login'
  | 'search'
  | 'orders'
  | 'orderDetail'
  | 'addresses'
  | 'notificationSettings'
  | 'about'
  | 'faq'
  | 'profile'
  | 'security'
  | 'page' // صفحهٔ اختصاصی با slug (درخواست کاربر) — params: { slug }
  | 'blog' // وبلاگ (درخواست کاربر — جایگزین علاقه‌مندی در منوی پایین)
  | 'blogPost'; // نوشتهٔ وبلاگ — params: { slug }

export interface AppRoute {
  view: ViewName;
  params?: Record<string, string>;
  /** کلید یکتای نمونه نما — برای حفظ اسکرول و انیمیشن (مثلاً product:slug) */
  key?: string;
}

/** 1 = ورود به صفحه جدید، -1 = بازگشت، 0 = تعویض تب/جایگزینی */
export type NavigationDirection = 1 | -1 | 0;

interface RouterState {
  stack: AppRoute[];
  direction: NavigationDirection;
  /** ورود به نمای جدید (مثل جزئیات محصول) */
  push: (route: AppRoute) => void;
  /** جایگزینی نمای فعلی (مثل رفتن از تسویه به نتیجه سفارش) */
  replace: (route: AppRoute) => void;
  /** تعویض تب ریشه در Bottom Navigation */
  reset: (route: AppRoute) => void;
  /** حذف نمای فعلی از پشته (فراخوانی داخلی توسط handler مربوط به popstate) */
  pop: () => void;
  /** بازگشت با دکمه UI — از history مرورگر استفاده می‌کند تا popstate اجرا شود */
  back: () => void;
  /** بازگشت به تب ریشه با لمس مجدد همان تب */
  popToRoot: () => void;
  /** بازیابی پشته پس از refresh */
  hydrate: (stack: AppRoute[]) => void;
  /** موقعیت اسکرول هر نما برای حفظ موقعیت هنگام بازگشت */
  scrollMap: Record<string, number>;
  saveScroll: (key: string, top: number) => void;
}

export function routeKey(route: AppRoute): string {
  return route.key ?? route.view;
}

const STACK_STORAGE_KEY = 'pars:view-stack';

function loadPersistedStack(): AppRoute[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STACK_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const valid = parsed.filter(
      (r): r is AppRoute =>
        !!r && typeof r === 'object' && typeof (r as AppRoute).view === 'string'
    );
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

function persistStack(stack: AppRoute[]) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STACK_STORAGE_KEY, JSON.stringify(stack));
  } catch {
    /* حافظه session در دسترس نیست — ناوبری همچنان کار می‌کند */
  }
}

export const useRouterStore = create<RouterState>((set, get) => ({
  stack: [{ view: 'home' }],
  direction: 0,
  scrollMap: {},

  push: (route) => {
    const stack = [...get().stack, route];
    persistStack(stack);
    set({ stack, direction: 1 });
  },

  replace: (route) => {
    const stack = [...get().stack.slice(0, -1), route];
    persistStack(stack);
    set({ stack, direction: 0 });
  },

  reset: (route) => {
    const stack = [route];
    persistStack(stack);
    set({ stack, direction: 0 });
  },

  pop: () => {
    const { stack } = get();
    if (stack.length <= 1) return;
    const next = stack.slice(0, -1);
    persistStack(next);
    set({ stack: next, direction: -1 });
  },

  /**
   * بازگشت با دکمه UI — فقط pop منطقی انجام می‌دهد، بدون history.back().
   * چرا؟ اگر پشته پس از refresh از sessionStorage بازیابی شده باشد، ممکن است
   * ورودی sentinel در history موجود نباشد و history.back() کاربر را از اپ
   * خارج کند. Back سخت‌افزاری/مرورگر همچنان از طریق popstate (در AppShell)
   * به همین pop متصل است.
   */
  back: () => {
    const { stack } = get();
    if (stack.length > 1) {
      get().pop();
      return;
    }
    // پشته تک‌عضوی (مثلاً پس از بازیابی نشست روی یک نمای غیر خانه) → خانه
    if (stack[0]?.view !== 'home') {
      get().reset({ view: 'home' });
    }
  },

  popToRoot: () => {
    const stack = get().stack.slice(0, 1);
    persistStack(stack);
    set({ stack, direction: 0 });
  },

  hydrate: (stack) => {
    persistStack(stack);
    set({ stack, direction: 0 });
  },

  saveScroll: (key, top) => {
    const map = get().scrollMap;
    if (map[key] === top) return;
    set({ scrollMap: { ...map, [key]: top } });
  },
}));

export { loadPersistedStack };
