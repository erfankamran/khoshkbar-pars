# راهنمای اجرای پروژه پس از دانلود

این بسته شامل کد کامل «فروشگاه پارس» است — بدون `node_modules`، بدون فایل‌های
`.env` محرمانه و بدون پوشهٔ build (`.next`). پس از استخراج، چند دستور کافی است.

## محتوای بسته

| مسیر | توضیح |
| --- | --- |
| `src/` | کد اپلیکیشن (Next.js 16 + React 19 + Prisma) |
| `prisma/` | اسکیمای دیتابیس + فایل seed |
| `db/custom.db` | دیتابیس SQLite با داده‌های فعلی فروشگاه |
| `public/` | تصاویر محصولات، بنرها، آیکون‌های PWA |
| `deploy/cpanel/` | فایل `server.js` مخصوص Passenger در cPanel |
| `docs/cpanel-deploy-prompt.md` | راهنمای گام‌به‌گام استقرار در cPanel (۵ فاز + عیب‌یابی) |
| `DEPLOY.md` و `DOCKER.md` | راهنمای استقرار عمومی و Docker |
| `scripts/` | اسکریپت‌های تست و ابزار توسعه |

## اجرا در حالت توسعه (لوکال)

```bash
# پیش‌نیاز: Node.js نسخهٔ 20.9 یا بالاتر
npm install          # پس از نصب، prisma generate خودکار اجرا می‌شود
cp .env.example .env # سپس مقادیر را تنظیم کنید
npm run dev          # → http://localhost:3000
```

مقادیر ضروری `.env`:

- `DATABASE_URL=file:./db/custom.db`
- `AUTH_SECRET` → یک رشتهٔ تصادفی: `openssl rand -hex 32`
- `NEXT_PUBLIC_SITE_URL` → آدرس سایت شما

> برای تست لاگین در حالت توسعه می‌توانید `NEXT_PUBLIC_DEV_MODE=true` بگذارید،
> اما در تولید هرگز آن را true نکنید (به‌همراه `OTP_MASTER_CODE`).

## استقرار در cPanel (تولید)

راهنمای کامل و مفصل در `docs/cpanel-deploy-prompt.md` است. خلاصهٔ ۵ فاز:

1. **آپلود و استخراج** — zip را در پوشهٔ خارج از `public_html` استخراج کنید.
2. **نصب وابستگی‌ها** — در ترمینال cPanel: `npm install`
3. **بیلد** — `npm run build` (خروجی standalone ساخته می‌شود)
4. **راه‌اندازی Node.js App** — Startup File را روی `deploy/cpanel/server.js`
   بگذارید و متغیرهای محیطی را در پنل تنظیم کنید.
5. **اتصال دامنه + HTTPS** — HTTPS الزامی است (کوکی‌های SameSite=None و Passkey).

## نکات امنیتی مهم

- فایل‌های `.env` و `.env.production` **عمداً** در این بسته قرار نگرفته‌اند،
  چون کلیدهای امنیتی واقعی داخلشان بود. مقادیر را خودتان بسازید:
  - `AUTH_SECRET` → `openssl rand -hex 32`
  - کلیدهای Web Push → `npx web-push generate-vapid-keys`
  - تغییر این کلیدها یعنی نشست‌های فعلی و اشتراک‌های پوشِ قبلی باطل می‌شوند —
    در شروع بهره‌برداری کاملاً طبیعی و مطلوب است.
- اسکریپت `start` در `package.json` به نسخهٔ «بدون کلید» تغییر کرده است؛
  در تولید همهٔ مقادیر باید از متغیرهای محیطی cPanel یا `.env.production` بیاید.
- در تولید این‌ها را تنظیم **نکنید**: `NEXT_PUBLIC_DEV_MODE`،
  `OTP_MASTER_CODE`، `OTP_DEV_CODE_EXPOSE`.

## عیب‌یابی سریع

| مشکل | راه‌حل |
| --- | --- |
| خطای Prisma در اولین اجرا | `npx prisma generate` را دستی اجرا کنید |
| صفحهٔ سفید روی دامنهٔ preview | فقط مخصوص محیط dev است؛ در cPanel موضوع ندارد |
| خطای 403 روی درخواست‌های POST | `deploy/cpanel/server.js` + HTTPS را چک کنید؛ راهنما در `docs/` |
| پوشهٔ `storage/media` | باید بیرون از `public_html` باشد و در `MEDIA_STORAGE_DIR` مسیردهی شود |
