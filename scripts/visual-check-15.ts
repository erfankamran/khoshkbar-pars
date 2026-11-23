/**
 * بررسی بصری فاز ۱۵ — ارسال پستی، وضعیت ارسال مشتری، درگاه پرداخت
 *
 * اسکرین‌شات‌ها در /tmp/render:
 *  15-admin-settings.png   — پنل تنظیمات با سه بخش (فروش / ارسال پستی / درگاه پرداخت)
 *  15-checkout.png         — تسویه حساب مشتری: روش‌های ارسال + روش پرداخت
 *  15-order-detail.png     — جزئیات سفارش: خط زمان وضعیت ارسال + کد رهگیری
 *
 * اجرا: bun scripts/visual-check-15.ts
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT = '/tmp/render';
const ADMIN_PHONE = '09120000000';
const USER_PHONE = '09121111111';

interface ApiResp<T> {
  ok: boolean;
  data?: T;
}

async function otpToken(phone: string): Promise<{ token: string; cookie: string }> {
  const reqRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const reqBody = (await reqRes.json()) as ApiResp<{ devCode?: string }>;
  if (!reqBody.data?.devCode) throw new Error(`OTP نگرفت: ${phone}`);
  const verRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: reqBody.data.devCode }),
  });
  const verBody = (await verRes.json()) as ApiResp<{ sessionToken?: string }>;
  const token = verBody.data?.sessionToken;
  if (!token) throw new Error('توکن نشست نگرفت');
  const setCookie = verRes.headers.get('set-cookie') ?? '';
  const m = setCookie.match(/pars_session=([a-f0-9]+)/);
  return { token, cookie: m?.[1] ?? token };
}

async function postJson(
  path: string,
  body: unknown,
  token: string
): Promise<ApiResp<Record<string, unknown>> & { status: number }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pars-session': token },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as ApiResp<Record<string, unknown>>;
  return { ...json, status: res.status };
}

const ADDRESS = {
  receiverName: 'سارا محمدی',
  receiverPhone: '09121111111',
  province: 'تهران',
  city: 'تهران',
  postalCode: '1234567890',
  fullAddress: 'خیابان ولیعصر، کوچه بهار، پلاک ۱۲، واحد ۳',
};

const browser = await chromium.launch();
try {
  const admin = await otpToken(ADMIN_PHONE);
  const user = await otpToken(USER_PHONE);

  // ——— داده: پرکردن سبد + یک سفارش با روش ارسال «پست سفارشی» ———
  const prodRes = await fetch(`${BASE}/api/products?page=1&pageSize=1`);
  const prodBody = (await prodRes.json()) as {
    data: { items: { id: string; variants: { id: string; priceToman: number }[] }[] };
  };
  const product = prodBody.data.items[0];
  const variant = product.variants[0];
  const qty = Math.max(1, Math.ceil(300_000 / Math.max(variant.priceToman, 1)));

  // همیشه ابتدا سبد را پر می‌کنیم (حالت idempotent: چندبار اضافه‌شدن فقط تعداد را زیاد می‌کند)
  const add = await postJson(
    '/api/cart/items',
    { productId: product.id, variantId: variant.id, quantity: qty },
    user.token
  );
  if (add.status !== 200) throw new Error(`افزودن به سبد شکست: ${JSON.stringify(add)}`);
  const order2 = await postJson(
    '/api/orders',
    { address: ADDRESS, paymentMethod: 'COD', shippingMethodId: 'sepordeh' },
    user.token
  );
  if (order2.status !== 200) throw new Error(`ثبت سفارش شکست: ${JSON.stringify(order2)}`);
  const orderCode = order2.data?.code as string;
  console.log(`سفارش تست: ${orderCode}`);

  // آیتم دوم برای نمای تسویه حساب
  const add2 = await postJson(
    '/api/cart/items',
    { productId: product.id, variantId: variant.id, quantity: qty },
    user.token
  );
  if (add2.status !== 200) throw new Error('سبد دوم برای تسویه پر نشد');

  // ——— ۱) پنل: تنظیمات — دسکتاپ — تمام‌صفحه ———
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await adminCtx.addCookies([
    {
      name: 'pars_session',
      value: admin.cookie,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(600);
  await adminPage.screenshot({ path: `${OUT}/15-admin-settings.png`, fullPage: true });
  console.log('✅ 15-admin-settings.png');
  await adminPage.close();
  await adminCtx.close();

  // ——— مشتری: موبایل ———
  const userCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await userCtx.addCookies([
    {
      name: 'pars_session',
      value: user.cookie,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  // ۲) تسویه حساب — روش‌های ارسال + روش پرداخت
  const checkoutPage = await userCtx.newPage();
  await checkoutPage.addInitScript((stack) => {
    sessionStorage.setItem('pars:view-stack', JSON.stringify(stack));
  }, [
    { view: 'home' },
    { view: 'checkout', key: 'checkout' },
  ]);
  await checkoutPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await checkoutPage.waitForTimeout(1500);
  // شل PWA داخل یک کانتینر اسکرول می‌شود؛ چیدمان پس از بارگذاری آدرس‌ها جابه‌جا می‌شود —
  // اسکرول را می‌گذاریم و پایداری‌اش را بررسی می‌کنیم
  const scrollTo = async (top: number) => {
    for (let i = 0; i < 4; i++) {
      await checkoutPage.evaluate((t) => {
        const el = document.querySelector(
          '.absolute.inset-0.overflow-y-auto'
        ) as HTMLElement | null;
        if (el) el.scrollTop = t;
      }, top);
      await checkoutPage.waitForTimeout(250);
      const now = await checkoutPage.evaluate(
        () =>
          (document.querySelector('.absolute.inset-0.overflow-y-auto') as HTMLElement | null)
            ?.scrollTop ?? -1
      );
      if (Math.abs(now - top) <= 2) return true;
    }
    return false;
  };
  await scrollTo(430);
  await checkoutPage.screenshot({ path: `${OUT}/15-checkout-shipping.png` });
  await scrollTo(1500);
  await checkoutPage.screenshot({ path: `${OUT}/15-checkout-payment.png` });
  console.log('✅ 15-checkout-shipping.png + 15-checkout-payment.png');
  await checkoutPage.close();

  // ۳) جزئیات سفارش — خط زمان وضعیت ارسال
  const detailPage = await userCtx.newPage();
  await detailPage.addInitScript((stack) => {
    sessionStorage.setItem('pars:view-stack', JSON.stringify(stack));
  }, [
    { view: 'home' },
    { view: 'orderDetail', params: { code: orderCode, justCreated: '1' }, key: `order:${orderCode}` },
  ]);
  await detailPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await detailPage.waitForTimeout(900);
  await detailPage.screenshot({ path: `${OUT}/15-order-detail.png`, fullPage: true });
  console.log('✅ 15-order-detail.png');
  await detailPage.close();

  await userCtx.close();
  console.log('تمام شد — اسکرین‌شات‌ها در /tmp/render');
} finally {
  await browser.close();
}
