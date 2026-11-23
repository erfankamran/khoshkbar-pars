#!/usr/bin/env bash
# ============================================================
# اجرای یکجای رگرسیون فروشگاه پارس (فاز ۱۳)
# استفاده: bash scripts/run-all-tests.sh [baseUrl]
#
# - پیش از هر مجموعه، کدهای OTP پاک می‌شوند (limiter تست آزاد بماند)
# - لاگ هر مجموعه: .zscripts/test-logs/<name>.log
# - فقط وقتی همه سبز باشند exit 0 می‌دهد (برای CI)
# - اجرا روی بیلد تولیدی هم ممکن است: سرور باید با OTP_DEV_CODE_EXPOSE=1
#   بالا آمده باشد تا devCode در پاسخ OTP برگردد (پیش‌فرض production خاموش است)
# ============================================================
set -u

BASE="${1:?نشانی سرور آزمایشی را صریح وارد کنید}"
: "${PARS_TEST_DATABASE_URL:?دیتابیس آزمایشی را در PARS_TEST_DATABASE_URL مشخص کنید}"
export DATABASE_URL="$PARS_TEST_DATABASE_URL"
LOG_DIR=".zscripts/test-logs"
mkdir -p "$LOG_DIR"

SUITES=(
  api-tests
  cart-regression
  order-auth-regression
  admin-tests
  admin-full-tests
  seo-feed-tests
  phase15-tests
  phase16-tests
  media-brand-tests
  content-tests
  profile-tests
  review-reply-tests
)

FAILED=()
for s in "${SUITES[@]}"; do
  echo "—— مجموعه: $s ——"
  bun scripts/reset-otp.ts >/dev/null 2>&1 || true
  if bun "scripts/$s.ts" "$BASE" >"$LOG_DIR/$s.log" 2>&1; then
    CHECKS="$(grep -c '✅' "$LOG_DIR/$s.log" 2>/dev/null || echo 0)"
    echo "  ✅ PASS — ${CHECKS} بررسی"
  else
    echo "  ❌ FAIL — لاگ: $LOG_DIR/$s.log"
    FAILED+=("$s")
    tail -15 "$LOG_DIR/$s.log"
  fi
done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "ALL GREEN — ${#SUITES[@]}/${#SUITES[@]} مجموعه سبز ✅"
  exit 0
fi

echo "مجموعه‌های قرمز: ${FAILED[*]}"
exit 1
