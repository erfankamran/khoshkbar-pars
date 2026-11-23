// smoke test آواتار — ورود کد مادر → me → نظرات → تغییر آواتار شخصیت
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

interface ApiResp<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function login(phone: string): Promise<{ token: string; avatarUrl: string | null }> {
  const res = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pars-device': 'avatar-smoke' },
    body: JSON.stringify({ phone, code: '123456' }),
  });
  const body = (await res.json()) as ApiResp<{ sessionToken: string; user: { avatarUrl: string | null } }>;
  if (!body.data?.sessionToken) throw new Error(`login failed: ${JSON.stringify(body.error)}`);
  return { token: body.data.sessionToken, avatarUrl: body.data.user.avatarUrl ?? null };
}

// ۱) ورود کاربر تستی — avatarUrl باید در پاسخ verify باشد
const customer = await login('09121234567');
console.log('1) verify → avatarUrl:', customer.avatarUrl, customer.avatarUrl?.startsWith('/avatars/') ? '✅' : '❌');

// ۲) me هم آواتار دارد
const meRes = await fetch(`${BASE}/api/auth/me`, {
  headers: { 'x-pars-session': customer.token, 'x-pars-device': 'avatar-smoke' },
});
const meBody = (await meRes.json()) as ApiResp<{ user: { avatarUrl: string | null } | null }>;
console.log('2) me → avatarUrl:', meBody.data?.user?.avatarUrl, meBody.data?.user?.avatarUrl ? '✅' : '❌');

// ۳) نظرات محصول — avatarUrl در آیتم‌ها
const reviewsRes = await fetch(`${BASE}/api/products/pistachio-akbari/reviews?limit=3`).catch(() => null);
if (reviewsRes && reviewsRes.ok) {
  const rev = (await reviewsRes.json()) as ApiResp<{ items: Array<{ avatarUrl: string | null }> }>;
  const withAvatar = rev.data?.items.filter((i) => i.avatarUrl).length ?? 0;
  console.log(`3) reviews → ${withAvatar}/${rev.data?.items.length} items have avatarUrl`, withAvatar > 0 ? '✅' : '(شاید هیچ نظر تأییدشده‌ای نیست)');
} else {
  console.log('3) reviews → اسلاگ تستی نبود؛ بررسی دستی لازم');
}

// ۴) تغییر آواتار شخصیت از پروفایل — PUT با یک شخصیت دیگر
const first = await fetch(`${BASE}/api/user/profile`, {
  headers: { 'x-pars-session': customer.token, 'x-pars-device': 'avatar-smoke' },
});
const profile = (await first.json()) as ApiResp<{ avatarUrl: string | null }>;
const current = profile.data?.avatarUrl ?? '';
const target = current === '/avatars/almond.webp' ? '/avatars/cashew.webp' : '/avatars/almond.webp';

const putRes = await fetch(`${BASE}/api/user/profile`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'x-pars-session': customer.token, 'x-pars-device': 'avatar-smoke' },
  body: JSON.stringify({ avatarUrl: target }),
});
const putBody = (await putRes.json()) as ApiResp<{ avatarUrl: string | null }>;
console.log(`4) PUT avatarUrl ${current} → ${target}:`, putRes.status, putBody.data?.avatarUrl, putBody.data?.avatarUrl === target ? '✅' : '❌');

// ۵) گارد امنیتی — آواتار خارج از لیست باید رد شود
const badRes = await fetch(`${BASE}/api/user/profile`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'x-pars-session': customer.token, 'x-pars-device': 'avatar-smoke' },
  body: JSON.stringify({ avatarUrl: 'https://evil.example.com/x.png' }),
});
const badBody = (await badRes.json()) as ApiResp<unknown>;
console.log('5) گارد URL خارجی →', badRes.status, badBody.error?.code ?? '', badRes.status === 400 ? '✅' : '❌');

// برگرداندن آواتار اولیه تستی
await fetch(`${BASE}/api/user/profile`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'x-pars-session': customer.token, 'x-pars-device': 'avatar-smoke' },
  body: JSON.stringify({ avatarUrl: current }),
});
console.log('6) آواتار تستی برگردانده شد →', current);
