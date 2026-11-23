/**
 * ثبت مختصات آزمایشی نقشه فروشگاه + راستی‌آزمایی تنظیمات عمومی
 * اجرا: bun scripts/set-store-map.ts [lat] [lng]
 */
const BASE = 'http://localhost:3000';
const PHONE = '09120000000';

const lat = process.argv[2] ?? '35.689200';
const lng = process.argv[3] ?? '51.389000';

async function otpLogin(): Promise<string> {
  const req = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  });
  const rb = await req.json();
  if (!rb?.data?.devCode) throw new Error(JSON.stringify(rb));
  const verify = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, code: rb.data.devCode }),
  });
  const vb = await verify.json();
  if (!vb?.data?.sessionToken) throw new Error(JSON.stringify(vb));
  return vb.data.sessionToken;
}

async function main() {
  const token = await otpLogin();
  console.log('✅ login');

  // ذخیره مختصات
  const put = await fetch(`${BASE}/api/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-pars-session': token },
    body: JSON.stringify({ values: { 'store.mapLat': lat, 'store.mapLng': lng } }),
  });
  const pb = await put.json();
  console.log('PUT:', put.status, JSON.stringify(pb?.data ?? pb?.error ?? pb).slice(0, 150));

  // اعتبارسنجی مقدار نامعتبر → باید 400 بدهد
  const bad = await fetch(`${BASE}/api/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-pars-session': token },
    body: JSON.stringify({ values: { 'store.mapLat': '1234' } }),
  });
  console.log('مقدار نامعتبر (باید 400):', bad.status);

  // تنظیمات عمومی
  const pub = await fetch(`${BASE}/api/settings`).then((r) => r.json());
  console.log(
    'public mapLat/mapLng:',
    pub?.data?.['store.mapLat'],
    '/',
    pub?.data?.['store.mapLng']
  );
}

main().catch((e) => {
  console.error('خطا:', e);
  process.exit(1);
});
