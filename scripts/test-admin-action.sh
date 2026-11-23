#!/bin/bash
# تست گام ۷ — اقدام ادمین روی سفارش + بررسی اعلان مشتری
BASE="http://localhost:3000"

# login <phone> — با صبر روی cooldown؛ echo توکن
login() {
  local phone="$1" dev
  for i in 1 2 3 4 5 6; do
    dev=$(curl -s -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d "{\"phone\":\"$phone\"}" \
      | python3 -c "import sys,json
d=json.load(sys.stdin)
print(d['data'].get('devCode','') if d.get('ok') else 'RETRY:'+d['error']['code'])")
    case "$dev" in
      RETRY:*)
        echo "  [login] تلاش $i: $dev — 20 ثانیه صبر…" >&2
        sleep 20
        ;;
      *)
        break
        ;;
    esac
  done
  sleep 1
  curl -s -X POST "$BASE/api/auth/otp/verify" -H 'Content-Type: application/json' -d "{\"phone\":\"$phone\",\"code\":\"$dev\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['sessionToken'])"
}

OID="$1"
echo "orderId=$OID"

echo "== ورود ادمین (09121111111) =="
TOKEN=$(login 09121111111)
echo "token: ${TOKEN:0:12}…"

for ACTION in MARK_PAID START_PROCESSING; do
  echo "== $ACTION =="
  curl -s -X PATCH "$BASE/api/admin/orders/$OID" -H 'Content-Type: application/json' -H "x-pars-session: $TOKEN" \
    -d "{\"action\":\"$ACTION\"}" | head -c 80
  echo
done
echo "== SHIP با کد رهگیری =="
curl -s -X PATCH "$BASE/api/admin/orders/$OID" -H 'Content-Type: application/json' -H "x-pars-session: $TOKEN" \
  -d '{"action":"SHIP","trackingCode":"12345678901"}' | head -c 80
echo

echo "== ورود مشتری (09121234567) =="
CTOKEN=$(login 09121234567)
echo "== اعلان‌های مشتری بعد از گذار وضعیت =="
curl -s "$BASE/api/notifications" -H "x-pars-session: $CTOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('unread:',d['unread'])
for i in d['items'][:5]: print(' -',i['type'],'|',i['title'],'|',i['body'][:70],'|',i['url'])
"
