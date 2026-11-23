# داکرایز کردن فروشگاه پارس 🐳

فروشگاه پارس با یک ایمیج داکر مستقل و سبک (~۳۰۰ مگابایت) اجرا می‌شود: Next.js 16 به‌صورت standalone، دیتابیس SQLite با ماندگاری در volume و رسانه‌های آپلودی در volume جدا. حتی دیتابیس و رسانه‌های فعلی پروژه داخل ایمیج قرار می‌گیرند تا **اولین اجرا با داده‌های کامل** بالا بیاید.

---

## ۱. پیش‌نیازها

- **ویندوز:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (موتور WSL2) — کافی است نصب باشد و اجرا شود
- **لینوکس/سرور:** Docker Engine به‌همراه پلاگین compose (`docker compose version` برای بررسی)

## ۲. اجرای سریع (روش توصیه‌شده)

در ریشه پروژه:

```bash
docker compose up -d --build
```

همین! فروشگاه روی **http://localhost:3000** بالا می‌آید.

| دستور | کار |
|---|---|
| `docker compose logs -f app` | مشاهده زنده لاگ |
| `docker compose ps` | وضعیت و سلامت کانتینر |
| `docker compose down` | توقف (داده‌ها در volume باقی می‌مانند) |
| `docker compose up -d --build` | اجرای دوباره بعد از تغییر کد |

> بار اول بیلد چند دقیقه طول می‌کشد (نصب وابستگی‌ها + بیلد Next.js). اجراهای بعدی به‌خاطر کش لایه‌ها سریع‌اند.

## ۳. اجرای دستی بدون Compose (اختیاری)

```bash
# ساخت ایمیج
docker build -t pars-shop .

# ساخت volume ها
docker volume create pars-db
docker volume create pars-media

# اجرا
docker run -d --name pars-shop \
  -p 3000:3000 \
  -e OTP_MASTER_CODE=123456 \
  -e OTP_DEV_CODE_EXPOSE=1 \
  -v pars-db:/app/data \
  -v pars-media:/app/storage/media \
  pars-shop
```

## ۴. داده‌ها کجا ذخیره می‌شوند؟

| محتوا | مسیر داخل کانتینر | volume پیش‌فرض compose |
|---|---|---|
| دیتابیس SQLite | `/app/data/pars.db` | `pars-shop_db_data` |
| رسانه‌های آپلودی | `/app/storage/media` | `pars-shop_media_data` |

- **بار اول:** اگر volume خالی باشد، از snapshot داخل ایمیج (`db/custom.db` و محتوای `storage/media`) بذر می‌شود؛ یعنی همان محصولات، بنرها و تنظیماتی که الان در پیش‌نمایش می‌بینید.
- **بعد از آن:** هر تغییری (محصول جدید، سفارش، آپلود تصویر) در volume ذخیره می‌شود و با حذف/ساخت مجدد کانتینر از بین نمی‌رود.
- مسیر واقعی volume روی هارد (برای بکاپ‌گیری مستقیم): `docker volume inspect pars-shop_db_data`

### بکاپ‌گیری و انتقال داده‌ها

```bash
# بکاپ دیتابیس (در هر سیستمی کار می‌کند، از جمله ویندوز/پاورشل)
docker cp pars-shop:/app/data/pars.db ./backup-pars.db

# بکاپ رسانه‌ها
docker cp pars-shop:/app/storage/media ./media-backup

# بازگردانی: فایل را داخل کانتینر کپی و کانتینر را ری‌استارت کنید
docker cp ./backup-pars.db pars-shop:/app/data/pars.db
docker compose restart app
```

## ۵. به‌روزرسانی نسخه

```bash
git pull                 # آخرین تغییرات کد
docker compose up -d --build
```

هنگام استارت، `docker-entrypoint.sh` به‌صورت خودکار `prisma db push` اجرا می‌کند؛ یعنی اگر اسکیمای دیتابیس در نسخه جدید تغییر کرده باشد، روی همان volume اعمال می‌شود و داده‌ها حفظ می‌شوند.

**استثنا:** اگر تغییری در اسکیما نیاز به حذف داده داشته باشد، استارت با خطا متوقف می‌شود (برای محافظت از داده‌ها). در آن صورت موقتاً به سرویس `environment` این را اضافه کنید، یک‌بار اجرا کنید و بعد حذفش کنید:

```yaml
PRISMA_ACCEPT_DATA_LOSS: "1"
```

## ۶. تنظیمات (متغیرهای محیطی)

تمام تنظیمات فعلاً داخل `docker-compose.yml` (بخش `environment`) آمده است:

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `DATABASE_URL` | `file:/app/data/pars.db` | مسیر دیتابیس — تغییر ندهید |
| `MEDIA_STORAGE_DIR` | `/app/storage/media` | مسیر رسانه‌ها — تغییر ندهید |
| `OTP_MASTER_CODE` | `123456` | کد ورود master (ورود بدون SMS) |
| `OTP_DEV_CODE_EXPOSE` | `1` | نمایش کد OTP در پاسخ API (فقط برای تست!) |
| `NEXT_PUBLIC_OTP_MASTER_CODE` | `123456` | آرگومان **بیلد** — در بخش `build.args` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | کلیدهای تستی | نوتیفیکیشن وب (Web Push) |
| `VAPID_SUBJECT` | `mailto:support@pars-shop.ir` | ایمیل تماس داخل نوتیفیکیشن‌ها |
| `NODE_OPTIONS` | `--max-old-space-size=1024` | سقف حافظه Node (مگابایت) |
| `SHOP_ENAMAD_URL` | خالی | لینک نماد اعتماد (اینماد — معمولاً با id و Code) — خالی = نمایش داده نمی‌شود |
| `SHOP_SAMANDAHI_URL` | خالی | لینک نشان ملی ساماندهی در فوتر |
| `SHOP_TOROB_URL` | خالی | لینک صفحهٔ فروشگاه در ترب — لینک «فروشگاه ما در ترب» در فوتر |
| `SHOP_EMALLS_URL` | خالی | لینک صفحهٔ فروشگاه در ایمالز — لینک «فروشگاه ما در ایمالز» در فوتر |
| `SMS_PROVIDER` | خالی | `melipayamak` = فعال‌سازی پیامک از env (بقیهٔ سه فیلد هم لازم است) |
| `SMS_USERNAME` / `SMS_PASSWORD` / `SMS_SENDER` | خالی | مشخصات ملی‌پیامک — هر چهار مقدار کامل → مقدم بر تنظیمات پنل ادمین |

### ⚠️ چک‌لیست قبل از استقرار واقعی (Production)

1. `OTP_MASTER_CODE` را به کدی قوی و نامعلوم تغییر دهید — و **همان مقدار** را در `build.args` هم (`NEXT_PUBLIC_OTP_MASTER_CODE`) بگذارید و دوباره `--build` بگیرید
2. `OTP_DEV_CODE_EXPOSE` را حذف کنید یا `0` بگذارید
3. کلیدهای VAPID جدید بسازید: `npx web-push generate-vapid-keys`
4. پشت HTTPS قرار دهید (بخش ۷)

## ۷. قرار دادن پشت ریورس‌پراکسی و HTTPS

کانتینر فقط پورت `3000` را لو می‌دهد. برای دامنه واقعی و HTTPS، یک ریورس‌پراکسی جلوی آن بگذارید؛ نمونه با Caddy (گواهی SSL خودکار):

```bash
docker run -d --name caddy --network host \
  -v caddy_data:/data \
  caddy caddy reverse-proxy --from shop.example.ir --to localhost:3000
```

یا با Nginx/Apache موجود خودتان، یک `proxy_pass http://127.0.0.1:3000;` ساده کافی است. (هدرهای `X-Forwarded-*` را بفرستید تا IP واقعی کاربران در لاگ امنیتی ثبت شود.)

## ۸. عیب‌یابی رایج

| مشکل | راه‌حل |
|---|---|
| بیلد وسط کار با `Killed` متوقف شد | رم در دسترس Docker کم است — در Docker Desktop (Settings → Resources) حداقل 4GB رم بدهید و دوباره بیلد بگیرید |
| پورت 3000 اشغال است | خط `ports` را به `"8080:3000"` تغییر دهید (سایت روی 8080 بالا می‌آید) |
| استارت با خطای prisma متوقف شد | یک‌بار با `PRISMA_ACCEPT_DATA_LOSS=1` اجرا کنید (بخش ۵) |
| سایت بالا نمی‌آید ولی کانتینر Up است | `docker compose logs -f app` را ببینید؛ بعد از تغییر زیاد، `docker compose build --no-cache` امتحان کنید |
| می‌خواهم از صفر شروع کنم (بدون داده) | `docker compose down -v` هر دو volume را پاک می‌کند؛ اجرای بعدی دیتابیس خالی می‌سازد |

## ۹. نقش فایل‌های داکر این پروژه

| فایل | نقش |
|---|---|
| `Dockerfile` | بیلد سه‌مرحله‌ای (deps → build → runner) روی Alpine؛ ایمیج نهایی فقط سرور standalone و Prisma را دارد و با کاربر غیر ریشه (`nextjs`) اجرا می‌شود |
| `.dockerignore` | جلوگیری از ورود `node_modules`، `.next`، فایل‌های سندباکس و لاگ‌ها به build context |
| `docker-entrypoint.sh` | بذرگذاری دیتابیس در اولین اجرا + `prisma db push` خودکار + اجرای سرور (با tini برای توقف تمیز) |
| `docker-compose.yml` | همه تنظیمات یک‌جا: پورت، env، volume، healthcheck و ری‌استارت خودکار |
