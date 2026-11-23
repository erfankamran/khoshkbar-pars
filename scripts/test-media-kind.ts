/**
 * آزمون آپلود دسته‌محور — POST /api/admin/media با kind
 * اجرا: bun scripts/test-media-kind.ts
 */
const BASE = 'http://localhost:3000';
const PHONE = '09120000000';

async function otpLogin(): Promise<string> {
  const req = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  });
  const rb = await req.json();
  if (!rb?.data?.devCode) throw new Error(`OTP request: ${JSON.stringify(rb)}`);
  const verify = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, code: rb.data.devCode }),
  });
  const vb = await verify.json();
  if (!vb?.data?.sessionToken) throw new Error(`verify: ${JSON.stringify(vb)}`);
  return vb.data.sessionToken;
}

/** PNG ۱×۱ سالم با امضای واقعی */
function tinyPng(): Uint8Array {
  // یک PNG قرمز ۱×۱ — بایت‌های استاندارد
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

async function main() {
  const token = await otpLogin();
  console.log('✅ login OK');

  for (const kind of ['products', 'banners']) {
    const form = new FormData();
    const file = new File([tinyPng()], 't.png', { type: 'image/png' });
    form.append('file', file);
    form.append('kind', kind);

    const res = await fetch(`${BASE}/api/admin/media`, {
      method: 'POST',
      headers: { 'x-pars-session': token },
      body: form,
    });
    const body = await res.json();
    const media = body?.data?.media;
    if (!media) {
      console.log(`❌ ${kind}:`, JSON.stringify(body).slice(0, 200));
      continue;
    }
    console.log(`✅ ${kind}: ${media.url}`);

    const serve = await fetch(`${BASE}${media.url}`);
    console.log(
      `   سرو: ${serve.status} (${serve.headers.get('content-type')})`
    );
  }
}

main().catch((e) => {
  console.error('خطا:', e);
  process.exit(1);
});
