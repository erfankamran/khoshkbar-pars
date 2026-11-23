/**
 * تأیید URL واقعی صفحات اختصاصی فروشگاه — /p/[slug] (درخواست کاربر)
 * سناریوها:
 *  ۱. GET /p/terms → 200 + عنوان قوانین + متن بخش‌ها + متادیتای سئو
 *  ۲. GET صفحهٔ محصول هنوز سالم (اولویت ContentPage آسیب نزند)
 *  ۳. GET /p/nonexistent → 404
 *  ۴. GET /sitemap.xml شامل /p/terms
 *  ۵. GET /api/pages/terms → متن کامل (نمای SPA)
 *  ۶. صفحهٔ غیرفعال → 404 (تست با toggle موقت در DB)
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const BASE = 'http://localhost:3000';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  // ——— ۱. صفحهٔ قوانین در URL واقعی ———
  const res = await fetch(`${BASE}/p/terms`);
  const html = await res.text();
  check('GET /p/terms → 200', res.status === 200, `status=${res.status}`);
  check('عنوان «قوانین و شرایط استفاده» در HTML', html.includes('قوانین و شرایط استفاده'));
  check('تیتر بخش «تعریف کاربر» رندر شده', html.includes('تعریف کاربر'));
  check('متن پاراگراف رندر شده', html.includes('ثبت سفارش'));
  check('متا title صفحه', html.includes('<title>قوانین و شرایط استفاده'));
  check('canonical /p/terms', html.includes('/p/terms') && html.includes('rel="canonical"'));
  check('بدون JSON-LD محصول در صفحهٔ محتوا', !html.includes('"@type":"Product"'));

  // ——— ۲. صفحهٔ محصول هنوز سالم ———
  const resP = await fetch(`${BASE}/p/pistachio-akbari`);
  const htmlP = await resP.text();
  check('GET /p/pistachio-akbari → 200 (محصول)', resP.status === 200, `status=${resP.status}`);
  check('JSON-LD Product در صفحهٔ محصول', htmlP.includes('"@type":"Product"'));

  // ——— ۳. slug ناموجود → 404 ———
  const res404 = await fetch(`${BASE}/p/does-not-exist`);
  check('GET /p/does-not-exist → 404', res404.status === 404, `status=${res404.status}`);

  // ——— ۴. sitemap شامل صفحهٔ محتوا ———
  const resS = await fetch(`${BASE}/sitemap.xml`);
  const xml = await resS.text();
  check('GET /sitemap.xml → 200', resS.status === 200);
  check('sitemap شامل /p/terms', xml.includes('/p/terms'));
  check('sitemap شامل محصولات', xml.includes('/p/pistachio-akbari'));

  // ——— ۵. API متن کامل صفحه (نمای SPA) ———
  const resA = await fetch(`${BASE}/api/pages/terms`);
  const api = (await resA.json()) as { data?: { body?: string; title?: string } | null };
  check('GET /api/pages/terms → 200', resA.status === 200);
  check('API بدنهٔ کامل دارد', (api.data?.body?.length ?? 0) > 3000, `len=${api.data?.body?.length}`);
  check('API عنوان درست', api.data?.title === 'قوانین و شرایط استفاده');

  // ——— ۶. صفحهٔ غیرفعال → 404 ———
  await db.contentPage.update({ where: { slug: 'terms' }, data: { isActive: false } });
  const resOff = await fetch(`${BASE}/p/terms`);
  check('صفحهٔ غیرفعال → 404', resOff.status === 404, `status=${resOff.status}`);
  const resApiOff = await fetch(`${BASE}/api/pages/terms`);
  const apiOff = (await resApiOff.json()) as { data?: unknown };
  check('API صفحهٔ غیرفعال → data:null', resApiOff.status === 200 && apiOff.data === null);
  await db.contentPage.update({ where: { slug: 'terms' }, data: { isActive: true } });
  const resBack = await fetch(`${BASE}/p/terms`);
  check('فعال‌سازی دوباره → 200', resBack.status === 200, `status=${resBack.status}`);

  console.log(`\nنتیجه: ${pass} موفق / ${fail} ناموفق`);
  if (fail > 0) process.exit(1);
  await db.$disconnect();
}

main().catch((e) => {
  console.error('خطای اسکریپت:', e);
  process.exit(1);
});
