/**
 * بررسی نمایش کد OTP در رابط ورود (محیط تست)
 *
 * - /admin/login → شماره مدیر → کلیک دریافت کد → باید جعبه «محیط تست — کد» دیده شود
 * - /login       → شماره مشتری → همان بررسی
 * - پاسخ شبکهٔ /api/auth/otp/request هم ثبت می‌شود تا رسیدن devCode به مرورگر ثابت شود
 *
 * اجرا: bun scripts/reset-otp.ts && bun scripts/check-otp-hint.ts
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

async function checkFlow(
  page: import('playwright').Page,
  url: string,
  phoneInputId: string,
  phone: string,
  label: string,
  skipGoto = false,
): Promise<void> {
  const responses: string[] = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/auth/otp/request')) {
      responses.push(await res.text().catch(() => '<بدون بدنه>'));
    }
  });

  if (!skipGoto) {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(2500); // اطمینان از hydrate شدن React در dev
  await page.fill(`#${phoneInputId}`, phone);
  await page.click('button[type=submit]');
  try {
    await page.getByText('محیط تست').waitFor({ timeout: 15000 });
  } catch (e) {
    const alert = await page
      .locator('[role=alert]')
      .textContent()
      .catch(() => null);
    const otpSlots = await page.locator('[data-slot=input-otp-slot], input[data-slot]').count();
    console.error(`✗ ${label}: جعبه کد پیدا نشد — خطای صفحه: «${alert?.trim() ?? 'هیچ'}»، اسلات‌های کد: ${otpSlots}`);
    await page.screenshot({ path: `/tmp/render/otp-hint-fail-${phoneInputId}.png` }).catch(() => undefined);
    throw e;
  }
  const boxText = (await page.getByText('محیط تست').textContent()) ?? '';
  console.log(`✓ ${label}: جعبه کد نمایش داده شد → «${boxText.trim().slice(0, 40)}…»`);
  for (const body of responses) {
    const hasCode = /"devCode":"\d{6}"/.test(body);
    console.log(`  پاسخ شبکه: devCode ${hasCode ? '✓ موجود' : '✗ گم‌شده!'}`);
  }
}

async function adminMasterLogin(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.fill('#admin-phone', '09121111111');
  // کد مادر — بدون درخواست پیامک، از همان مرحلهٔ شماره
  await page.getByText('ورود سریع با کد مادر').click();
  await page.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  console.log('✓ ورود سریع با کد مادر ۱۲۳۴۵۶ (بدون پیامک) → نشست روی /admin برقرار شد');
}

async function adminFullLogin(page: import('playwright').Page): Promise<void> {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.fill('#admin-phone', '09121111111');
  await page.click('button[type=submit]');
  await page.getByText('محیط تست').waitFor({ timeout: 15000 });
  await page.getByText('پر کردن خودکار کد').click();
  await page.getByText('ورود به پنل').click();
  await page.waitForURL(`${BASE}/admin`, { timeout: 15000 });
  console.log('✓ ورود کامل ادمین با پرکردن خودکار کد → نشست روی /admin برقرار شد');
}

async function main() {
  const browser = await chromium.launch();

  // ۱) ورود ادمین با کد مادر — بدون هیچ درخواست پیامک
  const masterCtx = await browser.newContext();
  await adminMasterLogin(await masterCtx.newPage());
  await masterCtx.close();

  // ۲) ورود کامل ادمین: نمایش جعبه کد + پرکردن خودکار + تأیید → /admin
  const adminCtx = await browser.newContext();
  await adminFullLogin(await adminCtx.newPage());
  await adminCtx.close();

  // ۲) نمایش کد در ورود مشتری: / → تب حساب → «ورود | ثبت‌نام»
  const custCtx = await browser.newContext();
  const custPage = await custCtx.newPage();
  await custPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await custPage.waitForTimeout(2500);
  await custPage.click('[aria-label="حساب"]');
  await custPage.getByText('ورود | ثبت‌نام').first().click();
  await checkFlow(custPage, '/', 'login-phone', '09121234567', 'ورود مشتری', true);
  await custCtx.close();

  await browser.close();
  console.log('✅ کد OTP در ورود ادمین و مشتری نمایش داده و با یک کلیک پر می‌شود');
}

main().catch((e) => {
  console.error('CHECK FAILED:', e);
  process.exit(1);
});
