# ============================================================
# فروشگاه پارس — ایمیج تولیدی
# Next.js 16 (standalone) + Prisma 6 + SQLite — پایه: node:22-alpine
#
#   ساخت:  docker build -t pars-shop .
#   اجرا:  docker run -d -p 3000:3000 pars-shop
#   ساده‌تر:  docker compose up -d --build
# ============================================================

# ---------- مرحله ۱: نصب وابستگی‌ها ----------
FROM node:22-alpine AS deps
# libc6-compat و openssl برای سازگاری باینری‌های Prisma روی Alpine
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
# schema.prisma قبل از npm ci کپی می‌شود تا postinstall (prisma generate) کار کند
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- مرحله ۲: بیلد اپلیکیشن ----------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# کد master ورود در باندل کلاینت — باید با OTP_MASTER_CODE سمت سرور یکی باشد
# NEXT_PUBLIC_DEV_MODE: روی سرور تست برای دسترسی کد مادر و نمایش devCode آن را
# از compose با "true" بدهید؛ پیش‌فرض تولیدی false است
ARG NEXT_PUBLIC_OTP_MASTER_CODE=123456
ARG NEXT_PUBLIC_DEV_MODE=false
ENV NEXT_PUBLIC_OTP_MASTER_CODE=$NEXT_PUBLIC_OTP_MASTER_CODE \
    NEXT_PUBLIC_DEV_MODE=$NEXT_PUBLIC_DEV_MODE \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/app/db/build.db

# دیتابیس موقت بیلد (برای prerender) — اسکیمای خالی کافی است
# npm run build خودش static و public را داخل standalone کپی می‌کند
RUN mkdir -p db storage/media \
    && npx prisma db push --skip-generate \
    && npm run build \
    && rm -f db/build.db

# ---------- مرحله ۳: ایمیج نهایی اجرا ----------
FROM node:22-alpine AS runner
# tini برای مدیریت صحیح سیگنال‌ها (توقف تمیز کانتینر)
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/data/pars.db \
    MEDIA_STORAGE_DIR=/app/storage/media \
    NODE_OPTIONS=--max-old-space-size=1024

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# سرور standalone (خروجی بیلد شامل .next/static و public هم هست)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Prisma: اسکیما + CLI + موتورها + کلاینت تولیدشده — برای همگام‌سازی
# اسکیما هنگام استارت (prisma db push) استفاده می‌شود
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin

# Snapshot دیتابیس و رسانه‌های آپلودیِ موجود در پروژه — اولین اجرا
# با داده‌های کامل بالا می‌آید (اگر پوشه‌ها در build context باشند)
COPY --from=builder --chown=nextjs:nodejs /app/db ./db
COPY --from=builder --chown=nextjs:nodejs /app/storage ./storage

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
    && mkdir -p /app/data /app/storage/media \
    && chown -R nextjs:nodejs /app/data /app/storage

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./docker-entrypoint.sh"]
