#!/usr/bin/env bash
# ============================================================
# نگهبان سرور پارس — لایهٔ دفاعی دوم
# هر ۲۰ ثانیه سلامت پورت ۳۰۰۰ را می‌سنجد؛ اگر سرور پاسخ ندهد
# (کرش، OOM یا کشته‌شدن بی‌صدا) به‌صورت خودکار دوباره بالا می‌آورد.
# اجرا: setsid nohup bash scripts/server-watchdog.sh >/dev/null 2>&1 &
# ============================================================
cd /home/z/my-project || exit 1
LOG=watchdog.log

while true; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 http://localhost:3000/ 2>/dev/null)

  if [ "$code" != "200" ]; then
    echo "$(date '+%F %T') DOWN (code=$code) → restarting server..." >> "$LOG"
    # پاک‌سازی هر پروسهٔ جامانده روی پورت
    ( kill -9 $(lsof -ti:3000) 2>/dev/null; true )
    sleep 1
    setsid nohup bun run start >> server.log 2>&1 < /dev/null &
    # فرصت استارت
    sleep 10
    code2=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 http://localhost:3000/ 2>/dev/null)
    echo "$(date '+%F %T') restart result: $code2" >> "$LOG"
  fi

  sleep 20
done
