# پرامپت کامل: دیپلوی فروشگاه «پارس» روی cPanel

> این پرامپت را می‌توانید به هر عامل هوشمند (دستیار کدنویسی، ترمینال سرور با دسترسی SSH، یا دستیار این گفتگو) بدهید، یا خودتان به‌عنوان چک‌لیست گام‌به‌گام استفاده کنید.
>
> **قبل از استفاده، این ۴ متغیر را در کل متن جایگزین کنید:**
> - `[DOMAIN]` → دامنه یا زیردامنهٔ فروشگاه (مثلاً `pars-shop.ir`)
> - `[CPANEL_USER]` → نام کاربری cPanel (در بالای صفحهٔ سی‌پنل دیده می‌شود)
> - `[APP_DIR]` → نام پوشهٔ اپلیکیشن روی هاست (پیشنهاد: `pars-app`)
> - `[DB_MODE]` → `fresh` (دیتابیس خالی جدید) یا `transfer` (انتقال دیتابیس فعلی از محیط توسعه)

---

## نقش تو (عاملِ اجرا)

شما یک مهندس استقرار (DevOps) هستید که باید پروژهٔ «پارس» — یک فروشگاه اینترنتی خشکبار ساخته‌شده با Next.js — را روی هاست اشتراکی cPanel مستقر کنید. مرحله‌به‌مرحله جلو کنید، بعد از هر مرحله نتیجه را گزارش کنید، و در صورت خطا قبل از ادامه عیب‌یابی کنید. هیچ‌وقت برای سبز شدن نتیجه، تنظیمات امنیتی را خاموش نکنید.

## زمینهٔ فنی پروژه (تغییر ندهید — فقط بخوانید)

| مورد | مقدار | نتیجه برای دیپلوی |
|---|---|---|
| فریم‌ورک | Next.js 16.4.5 (App Router) + React 19 | نیاز به Node **≥ 20.9** دارد |
| پیکربندی build | `output: "standalone"` در `next.config.ts` از قبل فعال است | خروجی `.next/standalone` با `node server.js` اجرا می‌شود |
| اسکریپت build | `next build` + کپی خودکار `.next/static` و `public` داخل standalone | باندل کامل و قابل‌حمل |
| دیتابیس | Prisma 6 + **SQLite** (`provider = "sqlite"`) | هیچ MySQL لازم نیست؛ فقط فایل `db/custom.db` با **مسیر مطلق** |
| فایل‌های آپلودی | `MEDIA_STORAGE_DIR` (پیش‌فرض `storage/media`)، سرو با `/api/media/[...path]` | باید بیرون `public_html` و قابل‌نوشتن باشد |
| realtime | هیچ WebSocket وجود ندارد (نوتیفیکیشن‌ها polling + Web Push) | با Passenger سازگار است |
| وب‌پوش | کلیدهای `VAPID_*` به‌صورت lazy خوانده می‌شوند | بدون آن‌ها هم اپ بالا می‌آید؛ فقط Push غیرفعال است |
| گارد CSRF | `src/proxy.ts` — در production فقط هاست‌های `X-Forwarded-Host`، `Host` و `NEXT_PUBLIC_SITE_URL` را می‌پذیرد | حتماً `NEXT_PUBLIC_SITE_URL` را ست کنید وگرنه عملیات تغییردهنده 403 می‌خورد |
| `allowedDevOrigins: ["*.space-z.ai"]` | فقط برای محیط dev پلتفرم است | در production بی‌اثر است — کاری لازم نیست |

**⛔ سه متغیر هرگز نباید در production ست شوند** (بک‌دور ورود توسعه‌ای): `NEXT_PUBLIC_DEV_MODE`، `OTP_MASTER_CODE`، `OTP_DEV_CODE_EXPOSE` — در بیلد production این کلیدها اصلاً درون باندل قرار نمی‌گیرند، ولی مطمئن شوید در env هاست ست نشده‌اند.

**⚠️ اسکریپت `npm start` در package.json مقادیر واقعی `AUTH_SECRET` و `VAPID` را هاردکد دارد** — این اسکریپت فقط برای محیط توسعه است؛ روی cPanel هرگز از آن استفاده نکنید و env ها را جداگانه ست کنید.

## پیش‌نیازهای هاست (قبل از هر کاری تأیید کنید)

1. در cPanel این بخش وجود داشته باشد: **Software → Setup Node.js App** (CloudLinux Node Selector). اگر نبود، ادامه ندهید — این هاست Next.js را اجرا نمی‌کند.
2. لیست نسخه‌های Node شامل **20.x یا 22.x** باشد (Next 16 با 18 بالا نمی‌آید).
3. HTTPS برای دامنه فعال‌پذیر باشد (AutoSSL / Let's Encrypt) — کوکی نشست با `SameSite=None` و ورود با Passkey فقط روی HTTPS کار می‌کنند.
4. دسترسی به **File Manager** و **Cron Jobs**.
5. سهمیهٔ دیسک کافی (بستهٔ آپلودی درحدود 150 تا 400 مگابایت).

## فاز ۱ — ساخت بستهٔ دیپلوی (روی ماشین ساخت، نه روی هاست)

دستورات را در ریشهٔ پروژه اجرا کنید:

```bash
# 1) نصب وابستگی‌ها و تولید کلاینت Prisma
npm install

# 2) ساخت باندل production (خروجی standalone + کپی static/public داخل آن)
npm run build

# 3) آماده‌سازی دیتابیس
#    گزینهٔ transfer: فایل فعلی را حفظ کن
cp db/custom.db /tmp/custom.db.keep
#    گزینهٔ fresh: اسکیمای جدید بساز (و اگر دادهٔ نمونه می‌خواهید)
#    npx prisma db push && bun prisma/seed.ts

# 4) ساخت بستهٔ آپلودی
#    شامل: .next/standalone کامل، server.js، prisma/، db/custom.db
tar -czf pars-cpanel.tar.gz \
  -C .next/standalone . \
  -C ../../ deploy/cpanel/server.js \
  -C ../../ prisma \
  -C ../../ db
```

نکات فاز ۱:
- باندل standalone شامل `node_modules` لازم (از جمله باینری Prisma و sharp برای linux-x64/glibc) است — هاست به `npm install` **نیازی ندارد** و نباید اجرا شود (رم کم + احتمال قطعی دانلود بسته‌ها از ایران).
- اگر هاست شما معماری غیر x86_64 یا Alpine است، بسته را باید روی همان معماری بگیرید (برای اکثر cPanel های ایران: x86_64/glibc درست است).
- `AUTH_SECRET` را همین‌جا بسازید و در فاز ۳ استفاده کنید: `openssl rand -hex 32`

## فاز ۲ — ایجاد اپلیکیشن در cPanel

در cPanel → **Setup Node.js App** → Create Application:

- **Node.js version:** 20.x یا 22.x (بالاترین موجود از این دو)
- **Application mode:** Production
- **Application root:** `[APP_DIR]` (مثلاً `pars-app`) — حتماً **خارج از `public_html`**
- **Application URL:** `[DOMAIN]`
- **Application startup file:** `server.js`

Create را بزنید. هنوز Start نکنید.

## فاز ۳ — آپلود بسته و تنظیم متغیرهای محیطی

1. در File Manager وارد `[APP_DIR]` شوید، بستهٔ `pars-cpanel.tar.gz` را آپلود و Extract کنید.
2. مطمئن شوید این‌ها در ریشهٔ `[APP_DIR]` هستند: `server.js`، باندل `.next/standalone/` (شامل `server.js` داخلی خودش)، `db/`، `prisma/`
   - اگر `server.js` داخل مسیر دیگری Extract شد، آن را به ریشهٔ `[APP_DIR]` منتقل کنید.
3. در صفحهٔ Setup Node.js App، بخش **Environment variables** — این‌ها را دقیقاً وارد کنید:

| متغیر | مقدار | اجباری؟ |
|---|---|---|
| `NODE_ENV` | `production` | ✅ |
| `DATABASE_URL` | `file:/home/[CPANEL_USER]/[APP_DIR]/db/custom.db` | ✅ مسیر مطلق |
| `AUTH_SECRET` | خروجی `openssl rand -hex 32` | ✅ اگر خالی بماند کد به مقدار ثابت توسعه برمی‌گردد و کوکی قابل جعل است |
| `NEXT_PUBLIC_SITE_URL` | `https://[DOMAIN]` | ✅ بدون آن گارد CSRF عملیات‌ها را 403 می‌کند |
| `MEDIA_STORAGE_DIR` | `/home/[CPANEL_USER]/[APP_DIR]/storage/media` | ✅ پوشه را بسازید (پرم 755) |
| `VAPID_PUBLIC_KEY` | کلید عمومی web-push | اختیاری — خالی = Push غیرفعال |
| `VAPID_PRIVATE_KEY` | کلید خصوصی web-push | اختیاری |
| `VAPID_SUBJECT` | `mailto:you@[DOMAIN]` | اختیاری |
| `SMS_PROVIDER` / `SMS_USERNAME` / `SMS_PASSWORD` / `SMS_SENDER` | ملی‌پیامک | اختیاری — خالی = تنظیمات پنل ادمین ملاک |
| `SHOP_ENAMAD_URL` و بقیهٔ `SHOP_*` | لینک‌های اعتماد فوتر | اختیاری |

**⛔ مطمئن شوید این سه در لیست نیستند:** `NEXT_PUBLIC_DEV_MODE`، `OTP_MASTER_CODE`، `OTP_DEV_CODE_EXPOSE`

4. **HTTPS:** در cPanel بخش SSL/TLS → AutoSSL یا Let's Encrypt را برای `[DOMAIN]` فعال کنید.
5. حالا در صفحهٔ Node.js App دکمهٔ **Start** را بزنید.

## فاز ۴ — محتوای فایل `server.js` (Startup File)

اگر فایل از بستهٔ آپلودی موجود نیست، این محتوا را دقیقاً در `[APP_DIR]/server.js` ذخیره کنید:

```js
/**
 * فایل راه‌انداز cPanel (Passenger) — «Startup File» در Setup Node.js App
 *
 * نکته‌ها:
 * - Passenger پورت را از env «PORT» می‌دهد؛ standalone خودش process.env.PORT را می‌خواند
 *   (فال‌بک 3000 فقط برای اجرای دستی خارج از Passenger است).
 * - HOSTNAME صراحتاً 0.0.0.0 می‌شود تا اگر Passenger مقدار دیگری ست کرده بود،
 *   سرور روی همهٔ اینترفیس‌ها گوش دهد (بسته‌شدن به hostname اشتباه = خطای 503).
 * - DATABASE_URL و MEDIA_STORAGE_DIR باید «مسیر مطلق» باشند (در envهای cPanel).
 * - ری‌استارت اپ بعد از هر آپدیت: دکمهٔ Restart در صفحهٔ Setup Node.js App
 *   (معادل touch tmp/restart.txt).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.HOSTNAME = '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';

require('./.next/standalone/server.js');
```

## فاز ۵ — راستی‌آزمایی (همه را اجرا کنید و گزارش بدهید)

```bash
# 1) صفحه اصلی
curl -sI https://[DOMAIN]/ | head -3          # انتظار: HTTP/2 200

# 2) سلامت API
curl -s https://[DOMAIN]/api/auth/me          # انتظار: پاسخ JSON (حتی 401 اوکی است — یعنی سرور زنده است)

# 3) ورود با OTP (جریان واقعی کاربر)
curl -s -X POST https://[DOMAIN]/api/auth/otp/request \
  -H "Content-Type: application/json" -H "Origin: https://[DOMAIN]" \
  -d '{"phone":"09120000000"}'                 # انتظار: {"ok":true,...}

# 4) گارد CSRF باید همچنان حملهٔ بین‌سایتی را رد کند
curl -s -X POST https://[DOMAIN]/api/auth/otp/request \
  -H "Content-Type: application/json" -H "Origin: https://evil.example.com" \
  -d '{"phone":"09120000000"}'                 # انتظار: 403 FORBIDDEN

# 5) فایل دیتابیس از وب قابل دانلود نباشد
curl -sI https://[DOMAIN]/db/custom.db | head -1   # انتظار: 404 یا 403 — هرگز 200
```

بعد از curl ها، در مرورگر واقعی: صفحهٔ اصلی، صفحهٔ محصول، افزودن به سبد، ورود با OTP، و پنل ادمین (`[DOMAIN]/admin/login`) را یک‌به‌یک باز کنید.

## معیارهای موفقیت

- همهٔ curl های فاز ۵ نتیجهٔ مورد انتظار را دادند
- ورود OTP در مرورگر کامل شد و کوکی `pars_session` با `Secure; SameSite=None` ست شد
- آپلود تصویر محصول در پنل ادمین کار می‌کند و فایل در `storage/media` ساخته شد
- صفحهٔ سفید یا ارور 502 وجود ندارد

## عیب‌یابی (رایج‌ترین خطاها)

| علامت | علت رایج | راه‌حل |
|---|---|---|
| 502/503 Passenger | startup file غلط، Node قدیمی، یا خطای require | لاگ اپ در صفحهٔ Node.js App؛ `server.js` را از فاز ۴ دوباره چک کنید |
| صفحهٔ سفید بدون استایل | Node < 20.9 یا Extract ناقص بسته | نسخهٔ Node را چک کنید؛ `.next/standalone/.next/static` موجود است؟ |
| 403 «درخواست بین‌سایتی مجاز نیست» | `NEXT_PUBLIC_SITE_URL` ست نشده یا غلط | همان مقدار `https://[DOMAIN]` را دقیق ست کنید و Restart بزنید |
| خطای Prisma / دیتابیس | `DATABASE_URL` مسیر نسبی یا فایل نیست | باید `file:/home/.../db/custom.db` مطلق باشد |
| عکس‌ها 500 می‌دهند | `MEDIA_STORAGE_DIR` نبود یا اجازهٔ نوشتن ندارد | پوشه بسازید، پرم 755، مالک `[CPANEL_USER]` |
| Passkey ورود نمی‌کند | HTTPS فعال نیست | AutoSSL را فعال کنید |
| اولین درخواست هر صفحه کند است | cold start Passenger | طبیعی است؛ چند ثانیه بعد دوباره تست کنید |

## آپدیت‌های بعدی (هر بار تغییر کد)

1. روی ماشین ساخت: `npm run build` + بستهٔ جدید بسازید (فاز ۱ بدون بخش دیتابیس)
2. قبل از آپلود، از دیتابیس بکاپ بگیرید (بند بعدی)
3. در File Manager فایل‌های `.next/standalone` قدیمی را با جدید جایگزین کنید؛ `db/` و `storage/` را **دست نزنید**
4. دکمهٔ **Restart** در صفحهٔ Node.js App (یا `touch [APP_DIR]/tmp/restart.txt`)
5. فاز ۵ را دوباره اجرا کنید

## بکاپ خودکار روزانه (Cron Jobs سی‌پنل)

```
0 3 * * * mkdir -p ~/pars-backups && cp ~/[APP_DIR]/db/custom.db ~/pars-backups/custom-$(date +\%F).db && ls -1t ~/pars-backups/*.db | tail -n +15 | xargs -r rm
```

(هر شب ساعت ۳ بکاپ می‌گیرد و ۱۴ نسخهٔ آخر را نگه می‌دارد)

## گزارش نهایی که باید تحویل بدهید

- نتیجهٔ تک‌تک تست‌های فاز ۵ (کد HTTP و بدنه)
- نسخهٔ Node هاست و مسیر نهایی اپلیکیشن
- وضعیت HTTPS و نوع گواهی
- اگر هر مورد از معیارهای موفقیت برآورده نشد: علت، اقدام انجام‌شده، و آنچه باقی مانده — بدون ادعای «کاملاً بدون مشکل»
