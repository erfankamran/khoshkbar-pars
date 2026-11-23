#!/bin/sh
# ============================================================
# فروشگاه پارس — اسکریپت استارت کانتینر
#   ۱) بار اول: بذرگذاری دیتابیس از snapshot همراه ایمیج
#   ۲) همگام‌سازی اسکیمای Prisma (idempotent — هر بار اجرا بی‌خطر است)
#   ۳) اجرای سرور Next.js standalone
# ============================================================
set -e

DB_FILE="${DATABASE_URL#file:}"
DB_SEED="/app/db/custom.db"

mkdir -p "$(dirname "$DB_FILE")" /app/storage/media

# ---------- ۱) بذرگذاری دیتابیس (فقط وقتی volume خالی است) ----------
if [ ! -f "$DB_FILE" ] && [ -f "$DB_SEED" ]; then
  echo "==> بذرگذاری دیتابیس از snapshot ایمیج: $DB_SEED -> $DB_FILE"
  cp "$DB_SEED" "$DB_FILE"
fi

# ---------- ۲) همگام‌سازی اسکیما ----------
# اگر تغییر اسکیما به حذف داده نیاز دارد، prisma بدون پرچم خطا می‌دهد
# تا داده‌ها محافظت شوند. در آن صورت موقتاً این را تنظیم کنید:
#   PRISMA_ACCEPT_DATA_LOSS=1
if [ "${PRISMA_ACCEPT_DATA_LOSS:-0}" = "1" ]; then
  echo "==> prisma db push (با پذیرش تغییرات مخرب داده)"
  npx prisma db push --skip-generate --accept-data-loss
else
  echo "==> prisma db push"
  npx prisma db push --skip-generate
fi

# ---------- ۳) سرور ----------
echo "==> اجرای سرور روی پورت ${PORT:-3000}"
exec node server.js
