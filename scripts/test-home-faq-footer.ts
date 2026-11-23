/** تست بازگشت FAQ (۴ سوال ثابت) + فوتر به انتهای صفحهٔ اصلی */
import { chromium } from 'playwright-core';

const EXE =
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';

const EXPECTED_QUESTIONS = [
  'هزینه و زمان ارسال چقدر است؟',
  'محصولات چقدر تازه هستند؟',
  'اگر محصول راضی‌کننده نبود چه؟',
  'پرداخت در محل دارید؟',
];

async function main() {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)));
  await page.addInitScript(() => {
    window.sessionStorage.setItem('pars:splash-shown', '1');
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });

  const faq = page.locator('section[aria-label="پرسش‌های متداول"]');
  await faq.waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForTimeout(600);

  // ۱) تعداد و متن سوال‌ها
  const triggers = faq.locator('button[aria-expanded]');
  const count = await triggers.count();
  const questions = await triggers.allTextContents();
  console.log('FAQ_COUNT =', count);
  questions.forEach((q, i) => console.log(`  Q${i + 1}:`, q.trim().slice(0, 50)));
  const questionsOk =
    count === 4 &&
    EXPECTED_QUESTIONS.every((eq) => questions.some((q) => q.includes(eq)));

  // ۲) آکاردئون باز می‌شود؟
  await triggers.first().click();
  await page.waitForTimeout(400);
  const answerVisible = await faq
    .getByText('پست پیشتاز رایگان')
    .isVisible()
    .catch(() => false);
  console.log('ACCORDION_OPENS =', answerVisible);

  // ۳) فوتر بعد از FAQ و در انتهای صفحه
  const footer = page.locator('footer');
  const footerCount = await footer.count();
  const orderOk = await page.evaluate(() => {
    const f = document.querySelector('section[aria-label="پرسش‌های متداول"]');
    const ft = document.querySelector('footer');
    if (!f || !ft) return false;
    return !!(f.compareDocumentPosition(ft) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  await footer.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const footerVisible = await footer.first().isVisible().catch(() => false);
  const footerText = (await footer.first().textContent().catch(() => '')) ?? '';
  const hasBrand = footerText.includes('پارس');
  console.log(
    'FOOTER count =',
    footerCount,
    '| afterFAQ =',
    orderOk,
    '| visible =',
    footerVisible,
    '| hasBrand =',
    hasBrand
  );

  // اسکرین‌شات انتهای صفحه برای بازبینی بصری
  await page.screenshot({ path: '/tmp/render/home-faq-footer.png' });

  await browser.close();

  const pass = questionsOk && answerVisible && footerCount >= 1 && orderOk && footerVisible && hasBrand;
  console.log(pass ? 'FAQ_FOOTER_TEST_PASS ✅' : 'FAQ_FOOTER_TEST_FAIL ❌');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
