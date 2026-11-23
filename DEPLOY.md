# راهنمای استقرار فروشگاه پارس — تولید (فاز ۱۲)

## ۱. پیش‌نیازها

| نیازمندی | توضیح |
|---|---|
| Node/Bun | Bun 1.1+ (یا Node 20+ با npm) |
| دیتابیس | SQLite (پیش‌فرض) — فایل `db/custom.db` |
| متغیرهای محیطی | `.env` (نمونه در بخش ۲) |

## ۲. متغیرهای محیطی (`.env`)

```env
DATABASE_URL=file:/home/z/my-project/db/custom.db

# Web Push (فاز ۱۰) — با npx web-push generate-vapid-keys بسازید
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com

# آدرس عمومی سایت — مبنای متادیتای OG و لینک‌های مطلق
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# لینک‌های بیرونی فوتر — خالی = نمایش داده نمی‌شود (فقط http(s) معتبر)
SHOP_ENAMAD_URL=https://trustseal.enamad.ir/?id=…&Code=…
SHOP_SAMANDAHI_URL=
SHOP_TOROB_URL=https://torob.com/shop/…
SHOP_EMALLS_URL=https://emalls.ir/…

# سرویس پیامک از env (ملی‌پیامک) — هر چهار مقدار کامل → مقدم بر تنظیمات پنل
SMS_PROVIDER=melipayamak
SMS_USERNAME=...
SMS_PASSWORD=...
SMS_SENDER=50004000123456
```

## ۳. استقرار بدون Docker (سرور خود)

```bash
bun install --frozen-lockfile
bunx prisma db push          # ایجاد/به‌روزرسانی اسکیما
bunx prisma db seed          # داده اولیه (دسته‌ها، محصولات نمونه، ادمین)
bun run build                # بیلد با چک نوع سخت‌گیرانه
bun run start                # سرور standalone روی :3000
```

پشت Nginx/Caddy با TLS و پروکسی به `:3000` قرار دهید (نمونه `Caddyfile` در ریشه پروژه هست).

## ۴. استقرار با Docker

```bash
# ساخت
docker build -t pars-shop .

# مهاجرت + داده اولیه (یک‌بار — تصویر builder که CLI پرisma دارد)
docker build --target builder -t pars-builder .
docker run --rm -v pars_db:/app/db \
  -e DATABASE_URL=file:/app/db/custom.db pars-builder \
  bunx prisma db push
docker run --rm -v pars_db:/app/db \
  -e DATABASE_URL=file:/app/db/custom.db pars-builder \
  bunx prisma db seed

# اجرا
docker run -d --name pars -p 3000:3000 \
  --env-file .env.production \
  -v pars_db:/app/db \
  -v pars_uploads:/app/uploads \
  pars-shop
```

> فایل‌های آپلودی مدیر در `uploads/` (خارج از `public/`) ذخیره و از طریق
> هندلر `/api/uploads/[file]` با اعتبارسنجی نام سرو می‌شوند — در Docker
> حتماً volume پایا برای آن ببندید.

## ۵. ورود مدیر پنل

- پنل: `https://your-domain.com/admin`
- ورود با OTP؛ اولین مدیر را seed می‌سازد. برای ارتقای شماره دلخواه:

```bash
bun scripts/set-admin.ts 0912XXXXXXX
```

- نکته محیطی: در حالت dev کد OTP در پاسخ (`devCode`) برمی‌گردد؛ در تولید
  ارسال پیامک باید به درگاه واقعی وصل شود (سرویس `auth.service.ts`).

## ۶. سلامت و نگهداری

- سلامت سرویس: `GET /api/settings` باید ۲۰۰ برگرداند
- لاگ امنیتی/حسابرسی در جدول `SecurityLog` (رویدادهای FORBIDDEN، ADMIN_ACTION، OTP_*)
- بکاپ SQLite: `sqlite3 db/custom.db ".backup backup-$(date +%F).db"` در cron شبانه
- رگرسیون کامل پیش از هر انتشار: `bash scripts/run-all-tests.sh` (۱۰ سوئیت)

## ۷. ساختار پروژه (خلاصه)

```
src/app/api/**        REST API (عمومی + admin با requireAdmin)
src/app/admin/**      پنل مدیریت (۱۱.۱ تا ۱۱.۶)
src/server/services/** منطق کسب‌وکار (سبد، سفارش، تخفیف، محتوا، …)
src/server/validators/** Zod schema هر endpoint
src/proxy.ts          گارد نشست /admin
prisma/               اسکیما، seed، verify
scripts/              ۱۰ سوئیت رگرسیون + ابزارهای dev
```
