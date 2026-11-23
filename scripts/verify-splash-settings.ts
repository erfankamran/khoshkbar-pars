// ============================================================
// e2e verify splash settings — verify the splash settings chain end to end
//  1) GET admin settings → presence of 6 splash keys
//  2) PUT changing values (color/text/duration) → 200
//  3) GET /api/settings public → new values
//  4) GET /manifest.webmanifest → background_color = new color
//  5) Invalid values must be rejected (duration out of range / bad color)
//  6) Return to default values
// ============================================================
const BASE = 'http://localhost:3000';

interface ApiResp<T> { ok: boolean; data?: T; error?: string }

async function otpLogin(phone: string): Promise<string | null> {
  await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  await new Promise((r) => setTimeout(r, 300));
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code: '123456' }),
  });
  const body = (await verifyRes.json()) as ApiResp<{ sessionToken?: string }>;
  return body.data?.sessionToken ?? null;
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const token = await otpLogin('09120000000');
check('admin login', !!token);

// 1) the admin GET — all 6 keys with default value
const listRes = await fetch(`${BASE}/api/admin/settings`, {
  headers: { 'x-pars-session': token! },
});
const list = (await listRes.json()) as ApiResp<{ settings: Array<{ key: string; value: string }> }>;
const byKey = new Map((list.data?.settings ?? []).map((s) => [s.key, s.value]));
check('admin GET 200', listRes.status === 200);
check('splash.enabled exists (default true)', byKey.get('splash.enabled') === 'true');
check('splash.backgroundColor exists (default #06241a)', byKey.get('splash.backgroundColor') === '#06241a');
check('splash.durationMs exists (default 1900)', byKey.get('splash.durationMs') === '1900');
check('splash.logoUrl default empty', byKey.get('splash.logoUrl') === '');
check('splash.title default empty', byKey.get('splash.title') === '');
check('splash.slogan default empty', byKey.get('splash.slogan') === '');

// 2) save new values
const putRes = await fetch(`${BASE}/api/admin/settings`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', 'x-pars-session': token! },
  body: JSON.stringify({
    values: {
      'splash.backgroundColor': '#2b1a4d',
      'splash.title': 'پارس استور',
      'splash.slogan': 'طعم تازه، هر روز',
      'splash.durationMs': '2500',
    },
  }),
});
check('PUT splash values → 200', putRes.status === 200);

// 3) public API — new values are returned
const pub = (await (await fetch(`${BASE}/api/settings`)).json()) as ApiResp<Record<string, unknown>>;
check('public splash.backgroundColor = #2b1a4d', pub.data?.['splash.backgroundColor'] === '#2b1a4d');
check('public splash.title = پارس استور', pub.data?.['splash.title'] === 'پارس استور');
check('public splash.durationMs = 2500 (number)', pub.data?.['splash.durationMs'] === 2500);
check('public splash.enabled = true (boolean)', pub.data?.['splash.enabled'] === true);

// 4) manifest — background_color matches the setting
const manifest = (await (await fetch(`${BASE}/manifest.webmanifest`)).json()) as Record<string, unknown>;
check('manifest background_color = #2b1a4d', manifest['background_color'] === '#2b1a4d');
check('manifest theme_color = brand default', manifest['theme_color'] === '#1f8f5a');

// 5) invalid values must be rejected
const bad1 = await fetch(`${BASE}/api/admin/settings`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', 'x-pars-session': token! },
  body: JSON.stringify({ values: { 'splash.durationMs': '9000' } }),
});
check('duration 9000 rejected', bad1.status === 400);
const bad2 = await fetch(`${BASE}/api/admin/settings`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', 'x-pars-session': token! },
  body: JSON.stringify({ values: { 'splash.backgroundColor': 'red' } }),
});
check('bad color rejected', bad2.status === 400);

// 6) return to default
const resetRes = await fetch(`${BASE}/api/admin/settings`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', 'x-pars-session': token! },
  body: JSON.stringify({
    values: {
      'splash.backgroundColor': '#06241a',
      'splash.title': '',
      'splash.slogan': '',
      'splash.durationMs': '1900',
    },
  }),
});
check('reset → 200', resetRes.status === 200);
const manifest2 = (await (await fetch(`${BASE}/manifest.webmanifest`)).json()) as Record<string, unknown>;
check('manifest returned to default #06241a', manifest2['background_color'] === '#06241a');

console.log(`\nنتیجه: ${pass} سبز / ${fail} قرمز`);
if (fail > 0) process.exit(1);
