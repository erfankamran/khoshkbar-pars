/**
 * تست انتها-به-انتهای مرکز اعلان‌ها (زنگوله) — جریان کامل:
 * ورود مشتری با OTP → افزودن اولین کالا به سبد (رویداد CART_NEW برای مدیر)
 * → ثبت سفارش COD (رویداد ORDER_NEW برای مشتری و مدیرها)
 * → خواندن خوراک هر دو → علامت‌گذاری خوانده‌شده
 *
 * اجرا: bun scripts/test-notification-center.ts
 */
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:3000';
const CUSTOMER_PHONE = '09124445566';
const ADMIN_PHONE = '09121111111';
const MASTER_CODE = '123456';

const db = new PrismaClient();

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  token?: string
): Promise<Envelope<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'x-pars-session': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as Envelope<T>;
}

async function login(phone: string, code: string): Promise<string> {
  const req = await call<{ devCode?: string }>('POST', '/api/auth/otp/request', { phone });
  if (!req.ok) throw new Error(`otp/request: ${JSON.stringify(req.error)}`);
  const useCode = req.data?.devCode ?? code;
  const verify = await call<{ user: { id: string }; sessionToken: string }>(
    'POST',
    '/api/auth/otp/verify',
    { phone, code: useCode }
  );
  if (!verify.ok || !verify.data?.sessionToken)
    throw new Error(`otp/verify: ${JSON.stringify(verify.error)}`);
  console.log(`✓ ورود ${phone} (کد ${useCode})`);
  return verify.data.sessionToken;
}

async function main() {
  // ——— ۱) ورود مشتری ———
  const customerToken = await login(CUSTOMER_PHONE, MASTER_CODE);

  // ——— ۲) اولین کالای سبد → رویداد CART_NEW برای مدیرها ———
  const variant = await db.productVariant.findFirst({
    where: { isActive: true, stock: { gt: 0 } },
    select: { id: true, productId: true, product: { select: { title: true } } },
  });
  if (!variant) throw new Error('واریانت فعال یافت نشد');
  const add = await call('POST', '/api/cart/items', {
    productId: variant.productId,
    variantId: variant.id,
    quantity: 1,
  }, customerToken);
  if (!add.ok) throw new Error(`cart/items: ${JSON.stringify(add.error)}`);
  console.log(`✓ کالا به سبد اضافه شد: ${variant.product.title}`);

  // ——— ۳) ثبت سفارش COD → ORDER_NEW برای مشتری + مدیرها ———
  const order = await call<{ code: string }>('POST', '/api/orders', {
    address: {
      receiverName: 'تستر اعلان‌ها',
      receiverPhone: CUSTOMER_PHONE,
      province: 'تهران',
      city: 'تهران',
      fullAddress: 'خیابان تست، پلاک ۱، واحد ۲ — تست خودکار مرکز اعلان‌ها',
    },
    paymentMethod: 'COD',
  }, customerToken);
  if (!order.ok) throw new Error(`orders: ${JSON.stringify(order.error)}`);
  console.log(`✓ سفارش ثبت شد: ${order.data?.code}`);

  // ——— ۴) خوراک مشتری ———
  const customerFeed = await call<{
    items: Array<{ id: string; type: string; title: string; isRead: boolean; url: string | null }>;
    unread: number;
  }>('GET', '/api/notifications', undefined, customerToken);
  if (!customerFeed.ok) throw new Error(`GET notifications: ${JSON.stringify(customerFeed.error)}`);
  console.log(
    `✓ خوراک مشتری → unread=${customerFeed.data?.unread} | انواع: ${customerFeed.data?.items
      .slice(0, 6)
      .map((i) => `${i.type}${i.isRead ? '(خوانده)' : '(قرمز)'}`)
      .join('، ')}`
  );

  // ——— ۵) ورود مدیر و خوراک او ———
  const adminToken = await login(ADMIN_PHONE, MASTER_CODE);
  const adminFeed = await call<{
    items: Array<{ id: string; type: string; title: string; isRead: boolean; url: string | null }>;
    unread: number;
  }>('GET', '/api/notifications', undefined, adminToken);
  if (!adminFeed.ok) throw new Error(`GET admin notifications: ${JSON.stringify(adminFeed.error)}`);
  console.log(
    `✓ خوراک مدیر → unread=${adminFeed.data?.unread} | انواع: ${adminFeed.data?.items
      .slice(0, 6)
      .map((i) => `${i.type}${i.url ? `→${i.url}` : ''}`)
      .join('، ')}`
  );

  // ——— ۶) علامت‌گذاری تک و همه ———
  const firstUnread = adminFeed.data?.items.find((i) => !i.isRead);
  if (firstUnread) {
    const one = await call<{ updated: number; unread: number }>(
      'POST',
      '/api/notifications/read',
      { id: firstUnread.id },
      adminToken
    );
    console.log(`✓ خواندن تکی → updated=${one.data?.updated} unread=${one.data?.unread}`);
  }
  const all = await call<{ updated: number; unread: number }>(
    'POST',
    '/api/notifications/read',
    { all: true },
    adminToken
  );
  console.log(`✓ خواندن همه → updated=${all.data?.updated} unread=${all.data?.unread}`);

  // ——— ۷) پاکسازی سبد تست برای اجرای بعدی ———
  const cart = await db.cart.findUnique({ where: { userId: (await db.user.findUnique({ where: { phone: CUSTOMER_PHONE } }))!.id }, select: { id: true } });
  if (cart) await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  console.log('✓ سبد مشتری تستی خالی شد (برای اجرای بعدی رویداد CART_NEW)');

  console.log('\n=== نتیجه: همهٔ مراحل زنگوله موفق ===');
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error('✗ خطا:', e instanceof Error ? e.message : e);
  await db.$disconnect();
  process.exit(1);
});
