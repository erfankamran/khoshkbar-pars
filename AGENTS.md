# شناسنامه پروژه پارس — راهنمای کامل برای AI Agent

> **به هر هوش مصنوعی که این فایل را می‌خواند:** این سند «تک‌منبع حقیقت» شناخت پروژه است. قبل از نوشتن یا تغییر هر خط کد، کل این فایل را بخوان. اگر بین این سند و کد تناقض دیدی، کد را مرجع بگیر و همین فایل را به‌روز کن. هیچ فرضی بدون مطالعه این سند انجام نده.

- **آخرین به‌روزرسانی سند:** ۲۰۲۶-۱۱-۲۴
- **کامیت مرجع:** `74c7848051b6bac92f86fcf9e6d156e18316bba7` (شاخه `main`)
- **نگهدارنده:** @erfankamran

---

## ۱) پروژه چیست؟

**فروشگاه پارس** — فروشگاه اینترنتی خشکبار، آجیل و مغزهای تازه («از مزرعه تا سفره شما»). یک اپلیکیشن وب کامل وProduction-ready با پنل مدیریت، وبلاگ، پرداخت آنلاین، پشتیبانی از PWA و اعلان‌های Push.

- **زبان رابط کاربری:** فارسی، کامل **RTL**
- **واحد پول:** تومان (عدد صحیح، بدون اعشار)
- **موبایل‌فرست:** طراحی اصلی برای موبایل (فروشگاه شبیه اپ موبایل با استوری، نوار پایین، ...) + پنل ادمین ریسپانسیو
- **دو روحیه در یک اپ:** بخش فروشگاهی مشتری (`/`) و پنل مدیریت (`/admin`)

## ۲) استک فنی (دقیق و بدون حدود)

| لایه | تکنولوژی | نسخه |
|---|---|---|
| فریم‌ورک | Next.js (App Router، output: standalone) | **16.4.5** |
| زبان | TypeScript (strict — خطای تایپ بیلد را می‌شکند) | 5 |
| UI | React | 19 |
| استایل | Tailwind CSS + tw-animate-css | 4 |
| کامپوننت | shadcn/ui (پوشه `src/components/ui`) + lucide-react | — |
| دیتابیس | SQLite با Prisma ORM | Prisma 6.19.3 |
| State سمت کلاینت | Zustand (`src/stores`) | 5 |
| انیمیشن | framer-motion | 12 |
| نقشه | leaflet (انتخاب موقعیت ادمین + نقشه گزارش‌ها) | 1.9.4 |
| نوتیفیکیشن Push | web-push (VAPID) | 4 |
| Passkey | @simplewebauthn/browser + @simplewebauthn/server | 14 |
| اعتبارسنجی | zod (همه ورودی‌ها در `src/server/validators`) | 4 |
| Toast | sonner | 2 |
| پردازش تصویر | sharp | — |
| هوش مصنوعی | z-ai-web-dev-sdk (فقط بک‌اند!) | — |
| Runtime / پکیج‌منیجر | bun (پروژه هم bun.lock و هم package-lock.json دارد) | 1.3+ |

## ۳) قوانین طلایی کدنویسی (مخالفت با این‌ها = باگ)

1. **پول همیشه `Int` تومان است** — فیلدها با پسوند `*Toman` (مثل `priceToman`، `totalToman`). هیچ‌جا Float یا ریال استفاده نکن.
2. **Snapshot در سفارش الزامی است** — `OrderItem` قیمت/نام محصول را در لحظه ثبت کپی می‌کند تا حذف محصول بعداً سفارش تاریخی را نشکند (onDelete: Restrict از سمت OrderItem به Product).
3. **SQLite enum ندارد** — وضعیت‌ها `String` هستند و مقادیر مجاز فقط با zod در لایه سرویس/validator کنترل می‌شوند. مقادیر مجاز هر فیلد در کامنت اسکیما (`prisma/schema.prisma`) نوشته شده.
4. **محاسبه مالی فقط سمت سرور** — در `orderService`/`cartService`. قیمت سمت کلاینت هرگز مرجع نیست؛ قیمت ویژه مشتری‌ها از `src/server/lib/customer-pricing.ts` می‌آید.
5. **API پاسخ استاندارد دارد** — `{"ok": true, "data": ...}` یا `{"ok": false, "error": ...}`. کلاینت با `src/lib/api-client.ts` و هوک `use-api` کار می‌کند.
6. **امنیت OTP:** فقط هش کد ذخیره می‌شود (`OtpCode.codeHash`)، ۵ دقیقه اعتبار، حداکثر ۵ تلاش، rate-limit با لاگ در `SecurityLog`. نشست = کوکی HttpOnly که فقط شناسه خام دارد؛ در DB هش آن (`Session.tokenHash`).
7. **اسرار سمت کلاینت نمی‌روند** — `AUTH_SECRET` و `VAPID_*` هرگز در `next.config.ts` inline نمی‌شوند. فقط مقادیر عمومی (کد مادر OTP در حالت دمو) در باندل می‌روند.
8. **نسخه Next.js جدید است و breaking changes دارد** — قبل از کدنویسی مستندات داخل `node_modules/next/dist/docs/` را چک کن (بلوک انتهای همین فایل را هم ببین).
9. **فارسی‌سازی نرمال:** متن جستجوی محصول با `normalizePersian` (ی/ي، ک/ك، آ/ا، ارقام فارسی/عربی) نرمال می‌شود — `src/lib/fa.ts` و فیلد `Product.searchText`.
10. **تاریخ شمسی:** تمام تاریخ‌های نمایشی با `src/lib/jalali.ts` تبدیل می‌شوند. کد سفارش به فرمت `PARS-14040315-XXXX` (سال/ماه/روز جلالی) است.

## ۴) نقشه پوشه‌ها

```
src/
├── app/                    # روت‌های App Router
│   ├── page.tsx            # صفحه اصلی فروشگاه (استوری، بنر، دسته‌ها، ...)
│   ├── layout.tsx          # لایه ریشه — RTL، فونت، theme
│   ├── manifest.ts         # مانیفست PWA
│   ├── admin/              # پنل مدیریت (layout خودش را دارد)
│   │   ├── page.tsx        # داشبورد (~۲۶KB، آمار و نمودارها)
│   │   └── products|orders|users|discounts|blog|banners|stories|
│   │       categories|content|pages|partners|reports|reviews|settings|
│   │       notifications|feeds|gallery|login/...
│   ├── api/                # Route Handlers بک‌اند (گروه‌ها ↓ جدول ۵)
│   ├── blog/[slug]         # نوشته‌های وبلاگ (مارک‌داون امن + سئو)
│   ├── c/[slug]            # صفحه دسته‌بندی (slug انگلیسی: pistachio, almond, ...)
│   ├── p/[slug]            # صفحه محصول + صفحات محتوایی /p/<slug> (ContentPage)
│   ├── faq                 # سوالات متداول (FaqItem)
│   ├── invoice/[code]      # فاکتور سفارش
│   ├── payment/callback    # بازگشت از درگاه پرداخت
│   ├── shipping-label/[code] # برچسب پستی (A5 PDF)
│   ├── feeds/blog.xml      # RSS وبلاگ
│   ├── feeds/emalls.xml    # فید قیمت برای ایمالز/ترب
│   ├── robots.txt/ + sitemap.xml/ + llms.txt/   # سئو (route handler هستند، فایل static نیستند!)
├── components/
│   ├── ui/                 # shadcn/ui (برای ساخت UI جدید اول اینجا را بگرد)
│   ├── layout/             # AppShell، هدر، نوار پایین موبایل
│   ├── home/ product/ cart/ account/ admin/ views/ pwa/ seo/ shared/
├── hooks/                  # use-api، use-notification-center، use-paginated-products، use-drag-scroll، ...
├── lib/                    # کلاینت‌ساید + مشترک: api-client، db (Prisma singleton)، fa، jalali،
│   │                       # markdown (پارسر امن)، page-blocks، site، theme، push-client، webauthn-client
├── server/
│   ├── lib/                # auth، rbac، webauthn، api (پاسخ‌دهنده استاندارد)، customer-pricing، cache-tags
│   ├── services/           # منطق تجاری (↓ جدول ۶) — همه کوئری/قواعد اینجاست
│   └── validators/         # zod schema ها (auth، cart، order، catalog، admin/...)
├── stores/                 # Zustand: auth، cart، delivery، pwa، router، settings
└── proxy.ts                # پیکربندی پروکسی
prisma/                     # schema.prisma (۳۲ مدل) + seed.ts (داده اولیه کامل) + seed-blog.ts + verify.ts
db/                         # فایل‌های SQLite کامیت‌شده (↓ بخش ۷)
public/                     # sw.js (Service Worker)، offline.html، لوگو، images/، icons/، avatars/
scripts/                    # ~۱۲۰ اسکریپت تست/ابزاری (api-tests.ts، admin-*-tests، e2e-*، shot-*) —
                            # با playwright-core و bun اجرا می‌شوند؛ run-all-tests.sh همه را می‌چرخاند
.zscripts/                  # اسکریپت‌های بیلد/استارت پلتفرم (build.sh، dev.sh، start.sh، ...)
deploy/cpanel/              # server.js برای استقرار روی هاست اشتراکی cPanel
Dockerfile + docker-compose.yml + docker-entrypoint.sh + Caddyfile
```

## ۵) گروه‌های API (`src/app/api/`)

`addresses` | `admin` (پنل) | `auth` (OTP، ورود، passkey) | `banners` | `cart` | `categories` | `content` | `discounts` | `feeds` | `home` | `invoice` | `media` (آپلود/سرو تصویر) | `notifications` | `orders` | `pages` | `payments` | `posts` | `products` | `push` (اشتراک وب‌پوش) | `search` | `settings` | `shipping-label` | `stories` | `uploads` | `user` (پروفایل، آواتار)

نمونه واقعی: `GET /api/categories` → `{"ok":true,"data":{"items":[{...slug:"pistachio", productCount:3}]}}`

## ۶) لایه سرویس (`src/server/services/`)

منطق تجاری فقط اینجاست — Route Handler ها نازک هستند و فقط صدا می‌زنند:

- **فروشگاه:** catalog، search، home، cart، order (محاسبه نهایی)، discount، review، address، shipping (روش‌ها/هزینه/آستانه ارسال رایگان از `Setting`)، payment (درگاه زیبال — `paymentTrackId`) + payment-verify، invoice، shipping-label
- **کاربر:** auth (OTP + نشست)، session، user، passkey (WebAuthn کامل با signCount و backup state)، partner (درخواست همکاری → تایید ادمین)، sms (ملی‌پیامک — از env یا تنظیمات پنل)
- **محتوا:** content، blog، media (ذخیره در `MEDIA_STORAGE_DIR`)، feed (RSS/emalls)
- **اعلان:** notification (وب‌پوش VAPID)، notification-center (زنگوله داخل‌اپ)، fan-out به همه ادمین‌ها برای رویدادهای `CART_NEW | ORDER_NEW | ORDER_STATUS | PAYMENT | BROADCAST | SYSTEM`
- **ادمین:** زیرپوشه `admin/` — products، orders، users، categories، banners، stories، discounts، blog، content، reviews، settings، stats، reports، notifications

## ۷) دیتابیس

- **موتور:** SQLite — تنها گزینه sandbox؛ اسکیما آماده مهاجرت به MySQL/Postgres است.
- **مدل‌ها (۳۲):** `User` (role: USER|PARTNER|ADMIN)، `PartnerRequest`، `Address`، `OtpCode`، `Session`، `WebAuthnChallenge`، `PasskeyCredential`، `Category` (درختی با parentId)، `Product` (+searchText، salesCount، isSuggested)، `ProductImage`، `ProductVariant` (وزنی 250/500/750/1000 گرم + `isWholesale` با `pricePerKgToman` و stock به‌جای گرم)، `Review` (فقط خریدار سفارش تحویل‌شده + پاسخ ادمین)، `Banner`، `Story` (گروهی، با انقضا)، `Favorite`، `Cart` (مهمان با deviceId در کوکی «پارس‌دووِیس»، ادغام بعد از ورود)، `CartItem`، `Order` (کد `PARS-...`، snapshot آدرس، وضعیت: PENDING_PAYMENT|PAID|PROCESSING|SHIPPED|DELIVERED|CANCELED)، `OrderItem` (snapshot کامل)، `DiscountCode`، `NotificationPreference`، `PushSubscription`، `Notification`، `NotificationLog`، `Setting`، `FaqItem`، `ContactNumber`، `TrustBadge`، `FooterLink`، `ContentPage` (مارک‌داون یا بلوکی)، `Post` (وبلاگ)، `SecurityLog`.
- **داده اولیه:** `bun run db:seed` (`prisma/seed.ts`) — فروشگاه کامل می‌سازد؛ `db:verify` صحت را چک می‌کند.
- **⚠️ دو فایل DB در ریپو هست:** `db/custom.db` (مرجع پلتفرم/سندباکس) و `db/pars-shop-partners.db` (محیط ویندوزی توسعه‌دهنده). محتوایشان عملاً یکسان است. در سندباکس، متغیر محیطی `DATABASE_URL` از پلتفرم روی `custom.db` است و **روی مقدار `.env` اولویت دارد**.
- **⚠️ فایل `.env` کامیت شده** (عمداً — «تک‌منبع حقیقت بیلد پلتفرم»). مسیر آن در کامیت فعلی ویندوزی (`D:/codex-skills/...`) است؛ در هر محیط غیر ویندوزی باید به `file:../db/custom.db` اصلاح شود. اسرار واقعی تولیدی نباید به این فایل اضافه شوند.

## ۸) متغیرهای محیطی (مستند کامل در `.env.example`)

| متغیر | نقش |
|---|---|
| `DATABASE_URL` | مسیر فایل SQLite (نسبت به `prisma/`؛ مثلاً `file:../db/custom.db`) |
| `AUTH_SECRET` | کلید امضای نشست (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_SITE_URL` | آدرس سایت |
| `NEXT_PUBLIC_DEV_MODE` | `true` → باکس طلایی کد مادر OTP در لاگین + علت خطاها؛ `false` → حالت تولید. **در زمان build در باندل قفل می‌شود** — تغییرش یعنی ویرایش `.env` + کامیت + بیلد مجدد |
| `OTP_MASTER_CODE` / `NEXT_PUBLIC_OTP_MASTER_CODE` | کد مادر ورود — فقط در حالت dev |
| `OTP_DEV_CODE_EXPOSE` | نمایش devCode در پاسخ OTP (فقط برای تست) |
| `MEDIA_STORAGE_DIR` | مسیر مطلق ذخیره مدیا آپلودی |
| `PRISMA_LOG_QUERIES` | `1` → لاگ کوئری حتی در تولید |
| `SHOP_ENAMAD_URL` / `SHOP_SAMANDAHI_URL` / `SHOP_TOROB_URL` / `SHOP_EMALLS_URL` | نشان‌ها و لینک‌های فوتر (خالی = نمایش داده نمی‌شود) |
| `SMS_PROVIDER` / `SMS_USERNAME` / `SMS_PASSWORD` / `SMS_SENDER` | ملی‌پیامک — اگر هر ۴ کامل باشند بر تنظیمات پنل ادمین مقدم می‌شوند |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | وب‌پوش |

## ۹) اجرا و دستورها

```bash
bun install          # postinstall خودش prisma generate می‌زند
bun run dev          # next dev -p 3000 (فقط پورت ۳۰۰۰!) + tee به dev.log
bun run lint         # eslint — بعد از هر تغییر کد اجرا کن
bun run db:push      # همگام‌سازی اسکیما (--accept-data-loss دارد! با احتیاط)
bun run db:seed      # داده اولیه کامل
bun run db:verify    # صحت دیتابیس
bun run build        # next build + کپی static و public داخل standalone
bun run start        # اجرای نسخه تولید (node .next/standalone/server.js)
```

در محیط sandbox پلتفرم، `.zscripts/dev.sh` همین زنجیره (install → db:push → dev → health check روی `/`) را خودکار اجرا می‌کند. **پیش‌نمایش بیرونی فقط از دامنه‌های `*.space-z.ai` مجاز است** (`allowedDevOrigins` در `next.config.ts` — حذفش یعنی صفحه سفید در پیش‌نمایش).

## ۱۰) استقرار (سه مسیر)

1. **پلتفرم سندباکس (پیش‌فرض توسعه):** `.zscripts/` + گیت‌وی Caddy روی پورت ۸۱؛ روت‌ها به `localhost:3000` می‌روند؛ سرویس‌های جانبی با کوئری `?XTransformPort=<port>`.
2. **Docker:** `Dockerfile` (بیلد standalone + کپی static/public) و `docker-compose.yml`؛ `bun run docker:up`.
3. **cPanel (هاست اشتراکی):** `deploy/cpanel/server.js` + مستندات `DEPLOY.md` و `DOCKER.md`.

## ۱۱) نکات و دام‌های شناخته‌شده (Gotchas)

- `robots.txt`، `sitemap.xml` و `llms.txt` **پوشه/روت هستند نه فایل** — پوشه‌ای با همین نام در `src/app` وجود دارد (route handler)؛ فایل static هم‌نام در `public/` نگذار.
- هشدار شناخته‌شده dev: تصاویر با quality 80 ساخته می‌شوند ولی `images.qualities` فقط 75 است — غیرشکست‌دهنده؛ یا کانفیگ را تکمیل کن یا quality را روی 75 بگذار.
- `reactStrictMode` روشن است — کامپوننت‌ها در dev دوبار رندر می‌شوند (عمدی، برای کشف ناخالصی).
- `typescript.ignoreBuildErrors: false` — خطای تایپ را جدی بگیر؛ بیلد می‌شکند.
- فوتر/صفحات محتوایی از `ContentPage` و `FooterLink` می‌آیند؛ متن برند از `Setting` (کد `brand.description`) — این‌ها را هاردکد نکن.
- دسته ویژه «هدایای سازمانی» با slug ثابت `corporate-gifts` (`GIFT_CATEGORY_SLUG` در `src/lib/config.ts`).
- اسکریپت‌های `scripts/` ابزار تست/دِمو هستند، جزو اپ نیستند؛ بعضی به DB واقعی می‌نویسند — بدون فهم، اجرا نکن (مخصوصاً `reseed-*` و `cleanup-*`).
- سرویس SMS واقعی ندارد مگر env های SMS_* یا تنظیمات پنل تکمیل باشد؛ در sandbox پرداخت شبیه‌سازی‌شده است (برچسب «تستی» در UI).

## ۱۲) چی‌استایل و ادبیات پروژه

- کامنت‌های کد فارسی هستند و به «بند/فاز مشخصات» ارجاع می‌دهند (مثلاً «بخش ۱۵.۲») — همین ادبیات را حفظ کن.
- نام‌گذاری فایل‌ها kebab-case، کامپوننت‌ها PascalCase، متغیرهای پول با پسوند `Toman`، وضعیت‌ها SCREAMING_SNAKE.
- برای UI جدید: اول کامپوننت آماده `src/components/ui` را پیدا کن؛ طراحی موبایل‌فرست با بریک‌پوینت‌های Tailwind؛ رنگ برند سبز تیره پارسی است (تم از `src/lib/theme.ts`).
- بعد از هر تغییر: `bun run lint` → تست مرتبط در `scripts/` → کامیت با پیام شفاف فارسی/انگلیسی.

---

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
