#!/bin/bash
# اندازه‌گیری واقعی تعداد کوئری Prisma برای هر endpoint (فاز ۵)
# روش: علامت‌گذاری dev.log → درخواست → شمارش خطوط prisma:query پس از علامت
LOG=/home/z/my-project/dev.log
BASE=http://localhost:3000

measure() {
  local name="$1"; local url="$2"
  local before after count
  before=$(wc -l < "$LOG")
  curl -s -o /dev/null "${BASE}${url}"
  after=$(wc -l < "$LOG")
  count=$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")
  printf "%-22s %-52s → %s query\n" "$name" "$url" "$count"
}

sleep 1
echo "=== Query count measurement ($(date +%H:%M:%S)) ==="
measure "home-aggregate"   "/api/home"
measure "categories"      "/api/categories"
measure "bestseller"      "/api/products?section=bestseller&limit=3"
measure "new-section"     "/api/products?section=new&limit=3"
measure "discounted"      "/api/products?section=discounted&limit=3"
measure "sort-cheap"      "/api/products?sort=cheap&limit=3"
measure "sort-expensive"  "/api/products?sort=expensive&limit=3"
measure "category-page"   "/api/products?category=pistachio&sort=popular&limit=6"
measure "detail"          "/api/products/pistachio-akbari"
measure "reviews"         "/api/products/pistachio-akbari/reviews?limit=20"

# ——— سبد خرید: کویری ثابت مستقل از تعداد اقلام (فاز ۸) ———
# خواندن = ۵ دستور (تنظیمات + ردیف‌ها + واریانت‌های IN + محصولات IN + تصاویر IN)
# + ۵ دستور ثابت تراکنش upsert سبد — مستقل از تعداد ردیف‌ها
CJAR=$(mktemp)
IDS=$(curl -s "${BASE}/api/products/pistachio-akbari" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']['product']
vs = {v['weightGrams']: v['id'] for v in d['variants']}
print(d['id'], vs.get(250, ''), vs.get(500, ''), vs.get(1000, ''))")
read -r PID VID VID2 VID3 <<< "$IDS"
add_item() { curl -s -b "$CJAR" -c "$CJAR" -o /dev/null -X POST -H "Content-Type: application/json" -d "{\"productId\":\"$PID\",\"variantId\":\"$1\",\"quantity\":1}" "${BASE}/api/cart/items"; }
if [ -n "$PID" ] && [ -n "$VID" ]; then
  add_item "$VID"
  before=$(wc -l < "$LOG"); curl -s -b "$CJAR" -o /dev/null "${BASE}/api/cart"; after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query (۱ کالا)\n" "cart-get" "GET /api/cart" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
  if [ -n "$VID2" ]; then
    add_item "$VID2"
    before=$(wc -l < "$LOG"); curl -s -b "$CJAR" -o /dev/null "${BASE}/api/cart"; after=$(wc -l < "$LOG")
    printf "%-22s %-52s → %s query (۲ کالا — ثابت)\n" "cart-get" "GET /api/cart" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
  fi
fi
rm -f "$CJAR"

# ——— نوشتن‌های سبد: POST/PATCH/DELETE (فاز ۸) ———
# همه روی یک سبد تازه (کوکی دستگاه جدا) تا حالت خالی اندازه‌گیری شود
WJAR=$(mktemp)
if [ -n "$PID" ] && [ -n "$VID3" ]; then
  before=$(wc -l < "$LOG")
  curl -s -b "$WJAR" -c "$WJAR" -o /tmp/cart-add.json -X POST -H "Content-Type: application/json" \
    -d "{\"productId\":\"$PID\",\"variantId\":\"$VID3\",\"quantity\":1}" "${BASE}/api/cart/items"
  after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query\n" "cart-post" "POST /api/cart/items" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"

  ITEMID=$(python3 -c "import json; print(json.load(open('/tmp/cart-add.json'))['data']['items'][0]['id'])" 2>/dev/null)

  before=$(wc -l < "$LOG")
  curl -s -b "$WJAR" -o /dev/null -X PATCH -H "Content-Type: application/json" \
    -d '{"quantity":2}' "${BASE}/api/cart/items/$ITEMID"
  after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query\n" "cart-patch" "PATCH /api/cart/items/:id" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"

  before=$(wc -l < "$LOG")
  curl -s -b "$WJAR" -o /dev/null -X DELETE "${BASE}/api/cart/items/$ITEMID"
  after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query\n" "cart-delete" "DELETE /api/cart/items/:id" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
fi
rm -f "$WJAR" /tmp/cart-add.json
# ——— احراز هویت + سفارش (فاز ۹) ———
# ورود OTP شبیه‌سازی‌شده (devCode در sandbox) → ثبت سفارش → اندازه‌گیری خواندن‌ها
AJAR=$(mktemp)
APHONE=$(python3 -c "import random; print('0937'+str(random.randint(1000000, 9999999)))")
ACODE=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"phone\":\"$APHONE\"}" \
  "$BASE/api/auth/otp/request" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'].get('devCode',''))" 2>/dev/null)
if [ -n "$ACODE" ]; then
  curl -s -b "$AJAR" -c "$AJAR" -o /dev/null -X POST -H "Content-Type: application/json" \
    -d "{\"phone\":\"$APHONE\",\"code\":\"$ACODE\"}" "$BASE/api/auth/otp/verify"
  before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /dev/null "$BASE/api/auth/me"; after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query\n" "auth-me" "GET /api/auth/me (نشست معتبر)" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"

  # سفارش واقعی برای اندازه‌گیری فهرست/جزئیات با آیتم
  curl -s -b "$AJAR" -c "$AJAR" -o /dev/null -X POST -H "Content-Type: application/json" \
    -d "{\"productId\":\"$PID\",\"variantId\":\"$VID3\",\"quantity\":1}" "$BASE/api/cart/items" 2>/dev/null
  curl -s -b "$AJAR" -o /tmp/order.json -X POST -H "Content-Type: application/json" \
    -d '{"address":{"receiverName":"تست اندازه‌گیری","receiverPhone":"09370000000","province":"تهران","city":"تهران","fullAddress":"خیابان تست، پلاک ۱"},"paymentMethod":"COD"}' \
    "$BASE/api/orders" 2>/dev/null
  OCODE=$(python3 -c "import json; print(json.load(open('/tmp/order.json'))['data']['code'])" 2>/dev/null)

  # اعلان سفارش fire-and-forget است — کوئری‌هایش با تأخیر flush می‌شوند.
  # درخواست بدون کوئری (vapid) فلاش را تحریک می‌کند تا پنجره بعدی تمیز باشد.
  sleep 1
  curl -s -o /dev/null "$BASE/api/push/vapid"
  sleep 1
  curl -s -o /dev/null "$BASE/api/push/vapid"

  if [ -n "$OCODE" ]; then
    before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /dev/null "$BASE/api/orders"; after=$(wc -l < "$LOG")
    printf "%-22s %-52s → %s query (۱ سفارش)\n" "orders-list" "GET /api/orders" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
    before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /dev/null "$BASE/api/orders/$OCODE"; after=$(wc -l < "$LOG")
    printf "%-22s %-52s → %s query\n" "orders-detail" "GET /api/orders/:code" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
  fi
  # بازگردانی موجودی واریانت مصرف‌شده توسط سفارش اندازه‌گیری (ثابت نگه داشتن داده تست)
  python3 - "$VID3" << 'PY'
import sqlite3, sys
c = sqlite3.connect('/home/z/my-project/db/custom.db')
c.execute("UPDATE ProductVariant SET stock=3 WHERE id=?", (sys.argv[1],))
c.commit()
PY
  rm -f /tmp/order.json
fi

# ——— اعلان‌ها و Push (فاز ۱۰) ———
if [ -s "$AJAR" ]; then
  before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /dev/null "$BASE/api/notifications/preferences"; after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query\n" "notif-prefs" "GET /api/notifications/preferences" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
  before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /dev/null -X PUT -H "Content-Type: application/json" \
    -d '{"pushEnabled":true,"orderUpdates":true,"promotions":false,"newProducts":false}' "$BASE/api/notifications/preferences"; after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query\n" "notif-prefs-put" "PUT /api/notifications/preferences" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
  before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /dev/null "$BASE/api/notifications"; after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query\n" "notif-feed" "GET /api/notifications" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
  before=$(wc -l < "$LOG"); curl -s -o /dev/null "$BASE/api/push/vapid"; after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query\n" "push-vapid" "GET /api/push/vapid" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
fi

# ——— دفترچه آدرس (فاز ۱۰) — خواندن/نوشتن روی کاربر اندازه‌گیری ———
if [ -s "$AJAR" ]; then
  before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /dev/null "$BASE/api/addresses"; after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query (خالی)\n" "addr-list" "GET /api/addresses" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
  before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /tmp/addr.json -X POST -H "Content-Type: application/json" \
    -d '{"title":"خانه","receiverName":"تست اندازه‌گیری","receiverPhone":"09370000000","province":"تهران","city":"تهران","fullAddress":"خیابان تست اندازه‌گیری پلاک ۱"}' \
    "$BASE/api/addresses"; after=$(wc -l < "$LOG")
  printf "%-22s %-52s → %s query\n" "addr-post" "POST /api/addresses" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
  AID=$(python3 -c "import json; print(json.load(open('/tmp/addr.json'))['data']['id'])" 2>/dev/null)
  if [ -n "$AID" ]; then
    before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /dev/null "$BASE/api/addresses"; after=$(wc -l < "$LOG")
    printf "%-22s %-52s → %s query (۱ آدرس)\n" "addr-list" "GET /api/addresses" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
    before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /dev/null -X PUT -H "Content-Type: application/json" \
      -d '{"title":"خانه","receiverName":"تست اندازه‌گیری","receiverPhone":"09370000000","province":"تهران","city":"تهران","fullAddress":"خیابان تست اندازه‌گیری پلاک ۱","isDefault":true}' \
      "$BASE/api/addresses/$AID"; after=$(wc -l < "$LOG")
    printf "%-22s %-52s → %s query\n" "addr-put" "PUT /api/addresses/:id" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
    before=$(wc -l < "$LOG"); curl -s -b "$AJAR" -o /dev/null -X DELETE "$BASE/api/addresses/$AID"; after=$(wc -l < "$LOG")
    printf "%-22s %-52s → %s query\n" "addr-delete" "DELETE /api/addresses/:id" "$(sed -n "${before},${after}p" "$LOG" | grep -c "prisma:query")"
  fi
  rm -f /tmp/addr.json
fi
rm -f "$AJAR"
measure "search-hits"     "/api/search?q=%D9%BE%D8%B3%D8%AA%D9%87"
measure "search-empty"    "/api/search?q="
measure "banners"         "/api/banners"
measure "stories"         "/api/stories"
measure "settings"        "/api/settings"
echo "=== done ==="

# === آزمون N+1: تعداد دستور SQL نباید با رشد limit رشد کند ===
echo "=== N+1 scaling test ==="
measure "bestseller l=1"  "/api/products?section=bestseller&limit=1"
measure "bestseller l=12" "/api/products?section=bestseller&limit=12"
measure "bestseller l=24" "/api/products?section=bestseller&limit=24"
measure "search l=5"      "/api/search?q=%D9%BE%D8%B3%D8%AA%D9%87&limit=5"
measure "search l=20"     "/api/search?q=%D9%BE%D8%B3%D8%AA%D9%87&limit=20"
