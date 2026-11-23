#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  ساخت بستهٔ قابل دانلود پروژه فروشگاه پارس
#  خروجی: download/pars-shop-project.zip
#  مستثنی‌ها: node_modules/.next/.git/لاگ‌ها/پوشه‌های محیطی سندباکس/
#            فایل‌های .env محرمانه
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SRC="/home/z/my-project"
STAGE="/tmp/pars-stage"
OUT="$SRC/download/pars-shop-project.zip"

echo "[1/5] کپی تمیز پروژه به staging ..."
rm -rf "$STAGE"
mkdir -p "$STAGE"
rsync -a \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude 'dev.log' \
  --exclude 'server.log' \
  --exclude 'skills' \
  --exclude 'download' \
  --exclude 'upload' \
  --exclude 'agent-ctx' \
  --exclude 'mini-services' \
  --exclude 'storage' \
  --exclude '.env' \
  --exclude '.env.production' \
  "$SRC/" "$STAGE/"

echo "[2/5] پاک‌سازی package.json (حذف کلیدهای هاردکد از اسکریپت start) ..."
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('/tmp/pars-stage/package.json')
d = json.loads(p.read_text(encoding='utf-8'))
d['scripts']['start'] = ("NODE_ENV=production NODE_OPTIONS=--max-old-space-size=1024 "
                         "node .next/standalone/server.js 2>&1 | tee server.log")
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding='utf-8')
print("  OK -> start دیگر کلید ندارد؛ مقادیر از .env.production / متغیرهای cPanel خوانده می‌شود")
PY

echo "[3/5] کپی مستندات استقرار ..."
mkdir -p "$STAGE/docs"
if [ -f "$SRC/download/cpanel-deploy-prompt.md" ]; then
  cp "$SRC/download/cpanel-deploy-prompt.md" "$STAGE/docs/"
  echo "  OK -> docs/cpanel-deploy-prompt.md"
fi

echo "[4/5] نوشتن DOWNLOAD-GUIDE.md ..."
cat > "$STAGE/DOWNLOAD-GUIDE.md" <<'MD'
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
MD

echo "[5/5] ساخت فایل zip ..."
rm -f "$OUT"
( cd "$STAGE" && zip -rq "$OUT" . )

echo ""
echo "================ RESULT ================"
du -h "$OUT" | cut -f1 | xargs echo "حجم بسته:"
unzip -t "$OUT" | tail -1
echo "تعداد فایل‌ها: $(unzip -l "$OUT" | tail -1 | awk '{print $2}')"
echo ""
echo "-- فایل‌های کلیدی --"
unzip -l "$OUT" | awk '{print $4}' | grep -E "^(package.json|next.config.ts|prisma/schema.prisma|db/custom.db|deploy/cpanel/server.js|docs/|DOWNLOAD-GUIDE.md|src/proxy.ts)$" | head -20
echo ""
echo "-- کنترل اینکه .env واقعی داخل بسته نیست --"
if unzip -l "$OUT" | awk '{print $4}' | grep -qE "^\.env(\.production)?$"; then echo "!! فایل محرمانه داخل بسته است"; else echo "OK - بدون .env / .env.production"; fi
