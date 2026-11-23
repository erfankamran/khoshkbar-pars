/**
 * بازبینی بصری مدیریت کاتالوگ — فاز ۱۱.۲
 * اسکرین‌شات: لیست محصولات، فرم جدید، ویرایش محصول، دسته‌بندی‌ها (+ موبایل لیست)
 * اجرا: bun scripts/admin-catalog-visual.ts [baseUrl]
 */

import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const db = new PrismaClient();

interface ApiResp<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function otpLogin(phone: string): Promise<string> {
  const req = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const reqBody = (await req.json()) as ApiResp<{ devCode?: string }>;
  if (!reqBody.data?.devCode) throw new Error(`OTP request failed: ${JSON.stringify(reqBody.error)}`);
  const verify = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: reqBody.data.devCode }),
  });
  const verifyBody = (await verify.json()) as ApiResp<{ sessionToken?: string }>;
  if (!verifyBody.data?.sessionToken) throw new Error('OTP verify failed');
  return verifyBody.data.sessionToken;
}

async function main() {
  // ادمین تصادفی — بدون برخورد با سقف ساعتی OTP شماره‌های ثابت
  const phone = `0912${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  await db.user.upsert({
    where: { phone },
    create: { phone, fullName: 'ادمین بازبینی بصری', role: 'ADMIN', isActive: true },
    update: { role: 'ADMIN' },
  });
  const token = await otpLogin(phone);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addCookies([{ name: 'pars_session', value: token, url: BASE }]);
  const page = await ctx.newPage();

  // ——— ۱) لیست محصولات ———
  await page.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=محصول جدید', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/admin-check/products-list.png', fullPage: true });
  console.log('✓ products-list.png');

  // ——— ۲) ویرایش محصول (اولین محصول لیست) ———
  const firstEdit = page.locator('a[aria-label^="ویرایش"]').first();
  await firstEdit.click();
  await page.waitForSelector('text=واریانت‌های وزنی', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '/tmp/admin-check/product-edit.png', fullPage: true });
  console.log('✓ product-edit.png');

  // ——— ۳) فرم محصول جدید ———
  await page.goto(`${BASE}/admin/products/new`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=محصول جدید', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/admin-check/product-new.png', fullPage: true });
  console.log('✓ product-new.png');

  // ——— ۴) دسته‌بندی‌ها ———
  await page.goto(`${BASE}/admin/categories`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=دسته جدید', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/admin-check/categories.png', fullPage: true });
  console.log('✓ categories.png');

  // ——— ۵) موبایل: لیست محصولات ———
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mctx.addCookies([{ name: 'pars_session', value: token, url: BASE }]);
  const mpage = await mctx.newPage();
  await mpage.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' });
  await mpage.waitForSelector('text=محصول جدید', { timeout: 15000 });
  await mpage.waitForTimeout(800);
  await mpage.screenshot({ path: '/tmp/admin-check/products-mobile.png', fullPage: true });
  console.log('✓ products-mobile.png');

  await browser.close();
  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('VISUAL CHECK FAILED:', e);
  process.exit(1);
});
