#!/bin/bash
# تست E2E مرکز اعلان‌ها — جریان کامل: سبد مهمان → ورود مشتری → ثبت سفارش →
# علامت‌گذاری → اقدام ادمین → اعلان وضعیت
BASE="http://localhost:3000"
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
TOK() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data'].get('sessionToken','') or '')"; }

step() { echo; echo "━━━ $1 ━━━"; }

# ── ۰) مهمان: شمارش خوانده‌نشده (باید 0 باشد) ──
step "0) GET unread-count مهمان"
curl -s "$BASE/api/notifications/unread-count" | head -c 200; echo

# ── ۱) ورود ادمین ──
step "1) ورود ادمین 09120000000"
DEV=$(curl -s -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d '{"phone":"09120000000"}' | J "['data'].get('devCode')")
echo "devCode=$DEV"
VERIFY=$(curl -s -X POST "$BASE/api/auth/otp/verify" -H 'Content-Type: application/json' -d "{\"phone\":\"09120000000\",\"code\":\"$DEV\"}")
ADMIN_TOKEN=$(echo "$VERIFY" | TOK)
echo "admin token: ${ADMIN_TOKEN:0:12}…"

# ── ۲) فید اعلان ادمین (قبل از رویدادها) ──
step "2) GET /api/notifications ادمین (قبل)"
curl -s "$BASE/api/notifications" -H "x-pars-session: $ADMIN_TOKEN" | head -c 300; echo

# ── ۳) مهمان: افزودن اولین کالا → رویداد سبد جدید برای مدیرها ──
step "3) مهمان → POST /api/cart/items (سبد جدید)"
DEVICE="11111111-2222-3333-4444-555555555555"
curl -s -X POST "$BASE/api/cart/items" \
  -H 'Content-Type: application/json' -H "x-pars-device: $DEVICE" \
  -d '{"productId":"cmw62qf4u000cr38zazvmzk04","variantId":"cmw62qf4y000gr38z4j1x8609","quantity":1}' | head -c 120; echo
sleep 1
step "3-b) اعلان ادمین بعد از سبد جدید"
curl -s "$BASE/api/notifications" -H "x-pars-session: $ADMIN_TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('unread:',d['unread'])
for i in d['items'][:3]: print(' -',i['type'],'|',i['title'],'|',i['body'])
"

# ── ۴) ورود مشتری و ثبت سفارش ──
step "4) ورود مشتری 09121234567"
CDEV=$(curl -s -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d '{"phone":"09121234567"}' | J "['data'].get('devCode')")
CV=$(curl -s -X POST "$BASE/api/auth/otp/verify" -H 'Content-Type: application/json' -d "{\"phone\":\"09121234567\",\"code\":\"$CDEV\"}")
CUST_TOKEN=$(echo "$CV" | TOK)
echo "customer token: ${CUST_TOKEN:0:12}…"
curl -s -X POST "$BASE/api/cart/items" \
  -H 'Content-Type: application/json' -H "x-pars-device: $CDEV" -H "x-pars-session: $CUST_TOKEN" \
  -d '{"productId":"cmw62qf4u000cr38zazvmzk04","variantId":"cmw62qf4y000gr38z4j1x8609","quantity":1}' > /dev/null
step "4-b) POST /api/orders (COD)"
ORDER=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' -H "x-pars-session: $CUST_TOKEN" \
  -d '{"paymentMethod":"COD","address":{"receiverName":"مشتری تستی","receiverPhone":"09121234567","province":"تهران","city":"تهران","postalCode":"1234567890","fullAddress":"خیابان تست، پلاک ۱، واحد ۲"}}')
CODE=$(echo "$ORDER" | J "['data'].get('code')")
echo "order code: $CODE"
sleep 1

# ── ۵) اعلان مشتری + اعلان ادمین بعد از ثبت سفارش ──
step "5) اعلان مشتری بعد از ثبت سفارش"
curl -s "$BASE/api/notifications" -H "x-pars-session: $CUST_TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('unread:',d['unread'])
for i in d['items'][:4]: print(' -',i['type'],'|',i['title'],'|',i['url'])
"
step "5-b) اعلان ادمین بعد از ثبت سفارش"
curl -s "$BASE/api/notifications" -H "x-pars-session: $ADMIN_TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('unread:',d['unread'])
for i in d['items'][:4]: print(' -',i['type'],'|',i['title'],'|',i['url'])
"

# ── ۶) علامت‌گذاری همه برای مشتری ──
step "6) POST read {all:true} مشتری"
curl -s -X POST "$BASE/api/notifications/read" -H 'Content-Type: application/json' -H "x-pars-session: $CUST_TOKEN" -d '{"all":true}'; echo
curl -s "$BASE/api/notifications/unread-count" -H "x-pars-session: $CUST_TOKEN"; echo

# ── ۷) اقدام ادمین: MARK_PAID → اعلان وضعیت برای مشتری ──
step "7) ادمین: MARK_PAID روی سفارش"
OID=$(curl -s "$BASE/api/admin/orders?q=$CODE" -H "x-pars-session: $ADMIN_TOKEN" | J "['data']['items'][0].get('id')")
echo "orderId=$OID"
curl -s -X PATCH "$BASE/api/admin/orders/$OID" -H 'Content-Type: application/json' -H "x-pars-session: $ADMIN_TOKEN" \
  -d '{"action":"MARK_PAID"}' | head -c 100; echo
step "7-b) ادمین: START_PROCESSING"
curl -s -X PATCH "$BASE/api/admin/orders/$OID" -H 'Content-Type: application/json' -H "x-pars-session: $ADMIN_TOKEN" \
  -d '{"action":"START_PROCESSING"}' | head -c 100; echo
step "7-c) ادمین: SHIP با کد رهگیری"
curl -s -X PATCH "$BASE/api/admin/orders/$OID" -H 'Content-Type: application/json' -H "x-pars-session: $ADMIN_TOKEN" \
  -d '{"action":"SHIP","trackingCode":"12345678901"}' | head -c 100; echo
sleep 1
step "7-d) اعلان مشتری بعد از گذار وضعیت"
curl -s "$BASE/api/notifications" -H "x-pars-session: $CUST_TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('unread:',d['unread'])
for i in d['items'][:4]: print(' -',i['type'],'|',i['title'],'|',i['body'][:60],'|',i['url'])
"

echo; echo "✅ تست کامل شد"
