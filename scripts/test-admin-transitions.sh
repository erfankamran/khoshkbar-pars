#!/bin/bash
# تست صحیح با شمای واقعی PATCH ادمین: {status, trackingCode, adminNote}
BASE="http://localhost:3000"
OID="$1"

login() {
  local phone="$1" dev
  for i in 1 2 3 4 5 6; do
    dev=$(curl -s -X POST "$BASE/api/auth/otp/request" -H 'Content-Type: application/json' -d "{\"phone\":\"$phone\"}" \
      | python3 -c "import sys,json
d=json.load(sys.stdin)
print(d['data'].get('devCode','') if d.get('ok') else 'RETRY:'+d['error']['code'])")
    case "$dev" in
      RETRY:*) echo "  [login] $dev — 20s صبر…" >&2; sleep 20 ;;
      *) break ;;
    esac
  done
  sleep 1
  curl -s -X POST "$BASE/api/auth/otp/verify" -H 'Content-Type: application/json' -d "{\"phone\":\"$phone\",\"code\":\"$dev\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['sessionToken'])"
}

TOKEN=$(login 09121111111)

echo "== {status:PAID} =="
curl -s -X PATCH "$BASE/api/admin/orders/$OID" -H 'Content-Type: application/json' -H "x-pars-session: $TOKEN" \
  -d '{"status":"PAID"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('ok'), d.get('data',{}).get('order',{}).get('status') if d.get('ok') else d['error']['message'])"

echo "== {status:PROCESSING} =="
curl -s -X PATCH "$BASE/api/admin/orders/$OID" -H 'Content-Type: application/json' -H "x-pars-session: $TOKEN" \
  -d '{"status":"PROCESSING"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('ok'), d.get('data',{}).get('order',{}).get('status') if d.get('ok') else d['error']['message'])"

echo "== {status:SHIPPED} =="
curl -s -X PATCH "$BASE/api/admin/orders/$OID" -H 'Content-Type: application/json' -H "x-pars-session: $TOKEN" \
  -d '{"status":"SHIPPED"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('ok'), d.get('data',{}).get('order',{}).get('status') if d.get('ok') else d['error']['message'])"

sleep 1
CTOKEN=$(login 09121234567)
echo "== اعلان‌های مشتری =="
curl -s "$BASE/api/notifications" -H "x-pars-session: $CTOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('unread:',d['unread'])
for i in d['items'][:6]: print(' -',i['type'],'|',i['title'],'|',i['body'][:70],'|',i['url'],'| read:',i['isRead'])
"

echo "== تغییر کد رهگیری بدون تغییر وضعیت =="
curl -s -X PATCH "$BASE/api/admin/orders/$OID" -H 'Content-Type: application/json' -H "x-pars-session: $TOKEN" \
  -d '{"trackingCode":"98765432100"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('ok'))"
sleep 1
echo "== اعلان‌های مشتری (بعد از کد رهگیری) =="
curl -s "$BASE/api/notifications" -H "x-pars-session: $CTOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
print('unread:',d['unread'])
for i in d['items'][:6]: print(' -',i['type'],'|',i['title'],'|',i['body'][:70])
"
