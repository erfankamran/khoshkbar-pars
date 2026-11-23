/* eslint-disable @typescript-eslint/no-require-imports */
// تأیید چاپ A5 — @page سایز کاغذ را قفل می‌کند؟ (preferCSSPageSize)
const path = require('path');
(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const token = process.env.PARS_TOKEN;
  if (!token) throw new Error('PARS_TOKEN env required');
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: 'pars_session', value: token, domain: 'localhost', path: '/' },
  ]);
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/invoice/PARS-14050902-PXGM', { waitUntil: 'networkidle' });
  await page.waitForSelector('.inv-sheet', { timeout: 15000 });
  await page.waitForTimeout(800);
  const out = '/tmp/render/invoice-a5-true.pdf';
  await page.pdf({
    path: out,
    preferCSSPageSize: true, // مرورگر واقعی هم همین رفتار را با کاغذ Default دارد
    printBackground: true,
  });
  await browser.close();
  console.log('PDF written:', out);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
