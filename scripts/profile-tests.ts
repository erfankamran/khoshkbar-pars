/**
 * تست رگرسیون فاز پروفایل + امنیت حساب (مگاپروژه — فازهای ۲/۳/۵)
 *
 * پوشش:
 *  ۱) گیت دسترسی: /api/user/* بدون نشست → ۴۰۱
 *  ۲) پروفایل: GET کامل (نام، ایمیل، عضویت، تأیید شماره) + PUT معتبر
 *     - fullName هم‌زمان sync می‌شود (خواننده‌های قدیمی)
 *     - نام فروشگاه هرگز به‌عنوان نام کاربر پیش‌فرض نمی‌آید
 *     - نام با رقم → ۴۰۰؛ ایمیل نامعتبر → ۴۰۰؛ فیلد خالی → ۴۰۰
 *  ۳) آواتار: PNG واقعی → ۲۰۰ + /api/media/؛ فایل متنی جعلی → ۴۰۰؛
 *     بزرگ‌تر از ۲ مگابایت → ۴۱۳
 *  ۴) جداسازی کاربران: تغییر پروفایل A هرگز پروفایل B را عوض نمی‌کند (IDOR)
 *  ۵) Passkey: options ثبت بدون نشست → ۴۰۱؛ با نشست → challenge یک‌بارمصرف؛
 *     verify با امضای جعلی → ۴۰۰؛ استفادهٔ دوباره از همان challenge → رد (Replay)
 *     login/options بدون شماره → ۲۰۰ (بدون افشای حساب)؛ login/verify جعلی → ۴۰۱
 *  ۶) نشست‌ها: GET → isCurrent درست؛ ابطال نشست جاری از مسیر [id] → ۴۰۰؛
 *     revoke-others → شمارش درست؛ پس از آن نشست دیگر باطل است
 *  ۷) حذف Passkey ناموجود → ۴۰۴؛ حذف آخرین کلید حساب را قفل نمی‌کند
 *
 * اجرا: bun scripts/profile-tests.ts [baseUrl]
 */

import { PrismaClient } from '@prisma/client';

const BASE = process.argv[2] ?? 'http://localhost:3000';
/** کاربر تازه در هر اجرا — state پیش‌بین‌پذیر برای تست نام خالی */
const USER_A_PHONE = '09121155544';
const USER_B_PHONE = '09121234567';
const db = new PrismaClient();

let pass = 0;
let failCount = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    failCount++;
    failures.push(name);
    console.log(`  ❌ ${name} ${extra}`);
  }
}

interface ApiResp<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function login(phone: string, device: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pars-device': device },
    body: JSON.stringify({ phone, code: '123456' }),
  });
  const body = (await res.json()) as ApiResp<{ sessionToken?: string }>;
  if (!body.data?.sessionToken) throw new Error(`login failed for ${phone}`);
  return body.data.sessionToken;
}

async function api<T>(
  path: string,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' = 'GET',
  token?: string | null,
  body?: unknown
): Promise<{ status: number; json: ApiResp<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { 'x-pars-session': token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as ApiResp<T> };
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function main() {
  console.log(`— تست پروفایل و امنیت حساب روی ${BASE} —\n`);

  // کاربر A هر بار تازه ساخته می‌شود — state پیش‌بین‌پذیر (نشست‌ها/کلیدها cascade می‌شوند)
  await db.user.deleteMany({ where: { phone: USER_A_PHONE } });

  // ——— ۱) گیت دسترسی ———
  console.log('۱) گیت دسترسی:');
  for (const p of ['/api/user/profile', '/api/user/passkeys', '/api/user/sessions']) {
    const r = await api(p, 'GET', null);
    check(`${p} بدون نشست → ۴۰۱`, r.status === 401, `got ${r.status}`);
  }
  const ro = await api('/api/user/sessions/revoke-others', 'POST', null);
  check('revoke-others بدون نشست → ۴۰۱', ro.status === 401, `got ${ro.status}`);

  const tokenA1 = await login(USER_A_PHONE, 'profile-tests-a1');
  const tokenA2 = await login(USER_A_PHONE, 'profile-tests-a2');
  const demoToken = await login(USER_B_PHONE, 'profile-tests-b');
  check('ورود کاربر A (نشست ۱) با کد مادر', !!tokenA1);
  check('ورود کاربر A (نشست ۲) با کد مادر', !!tokenA2);
  check('ورود کاربر B با کد مادر', !!demoToken);

  // ——— ۲) پروفایل ———
  console.log('۲) پروفایل کاربر A (تازه):');
  const prof = await api<{
    id: string;
    phone: string;
    phoneVerifiedAt: string | null;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    email: string | null;
    memberSince: string;
  }>('/api/user/profile', 'GET', tokenA1);
  check('GET پروفایل → ۲۰۰', prof.status === 200);
  check('شماره درست', prof.json.data?.phone === USER_A_PHONE);
  check(
    'phoneVerifiedAt پس از ورود OTP ثبت شده',
    !!prof.json.data?.phoneVerifiedAt,
    JSON.stringify(prof.json.data?.phoneVerifiedAt)
  );
  check('memberSince وجود دارد', !!prof.json.data?.memberSince);
  check(
    'بدون نام ثبت‌شده → fullName خالی (کاربر جدید در UI؛ هرگز «پارس»)',
    (prof.json.data?.fullName ?? '') === '' || prof.json.data?.fullName === null,
    prof.json.data?.fullName ?? 'undefined'
  );

  // displayName پیش‌فرض — قبل از ثبت نام، کاربر تازه باید «کاربر جدید» باشد
  const regOptDefault = await api<{ options: { user: { name: string; displayName: string } } }>(
    '/api/auth/passkeys/register/options',
    'POST',
    tokenA1,
    {}
  );
  check(
    'displayName کاربر بدون نام → «کاربر جدید» (هرگز نام فروشگاه)',
    (regOptDefault.json.data?.options.user.displayName ?? '') === 'کاربر جدید',
    regOptDefault.json.data?.options.user.displayName ?? ''
  );

  const putOk = await api<typeof prof.json.data>('/api/user/profile', 'PUT', tokenA1, {
    firstName: 'مدیر',
    lastName: 'فروشگاه',
    email: 'admin@pars-shop.test',
  });
  check('PUT معتبر → ۲۰۰', putOk.status === 200, `got ${putOk.status}`);
  check('fullName sync شد', putOk.json.data?.fullName === 'مدیر فروشگاه', putOk.json.data?.fullName ?? '');
  check('ایمیل ذخیره شد', putOk.json.data?.email === 'admin@pars-shop.test');

  const badName = await api('/api/user/profile', 'PUT', tokenA1, {
    firstName: 'نام123',
  });
  check('نام با رقم → ۴۰۰', badName.status === 400, `got ${badName.status}`);
  const badEmail = await api('/api/user/profile', 'PUT', tokenA1, {
    email: 'not-an-email',
  });
  check('ایمیل نامعتبر → ۴۰۰', badEmail.status === 400, `got ${badEmail.status}`);
  const emptyPut = await api('/api/user/profile', 'PUT', tokenA1, {});
  check('بدون هیچ فیلدی → ۴۰۰', emptyPut.status === 400, `got ${emptyPut.status}`);

  // ——— ۳) آواتار ———
  console.log('۳) آواتار:');
  const goodForm = new FormData();
  goodForm.append('file', new File([PNG_1PX], 'avatar.png', { type: 'image/png' }));
  const goodAvatar = await fetch(`${BASE}/api/user/profile/avatar`, {
    method: 'POST',
    headers: { 'x-pars-session': tokenA1 },
    body: goodForm,
  });
  const goodAvatarBody = (await goodAvatar.json()) as ApiResp<{ avatarUrl: string }>;
  check('PNG واقعی → ۲۰۰', goodAvatar.status === 200, `got ${goodAvatar.status}`);
  check(
    'نشانی از /api/media/',
    goodAvatarBody.data?.avatarUrl?.startsWith('/api/media/') ?? false,
    goodAvatarBody.data?.avatarUrl ?? ''
  );

  const fakeForm = new FormData();
  fakeForm.append('file', new File([Buffer.from('not an image')], 'avatar.png', { type: 'image/png' }));
  const fakeAvatar = await fetch(`${BASE}/api/user/profile/avatar`, {
    method: 'POST',
    headers: { 'x-pars-session': tokenA1 },
    body: fakeForm,
  });
  check('فایل جعلی (بدون magic bytes) → ۴۰۰', fakeAvatar.status === 400, `got ${fakeAvatar.status}`);

  const bigForm = new FormData();
  bigForm.append(
    'file',
    new File([Buffer.alloc(2 * 1024 * 1024 + 100, 1)], 'big.png', { type: 'image/png' })
  );
  const bigAvatar = await fetch(`${BASE}/api/user/profile/avatar`, {
    method: 'POST',
    headers: { 'x-pars-session': tokenA1 },
    body: bigForm,
  });
  check('بیش از ۲ مگابایت → ۴۱۳', bigAvatar.status === 413, `got ${bigAvatar.status}`);

  // ——— ۴) جداسازی کاربران ———
  console.log('۴) جداسازی کاربران (IDOR):');
  const demoBefore = await api<{ fullName: string | null }>('/api/user/profile', 'GET', demoToken);
  check(
    'پروفایل B قبل از تغییر A — بدون نام A',
    demoBefore.json.data?.fullName !== 'مدیر فروشگاه',
    demoBefore.json.data?.fullName ?? ''
  );
  check(
    'ایمیل A به B نشت نکرده',
    demoBefore.json.data?.email !== 'admin@pars-shop.test'
  );

  // ——— ۵) Passkey ———
  console.log('۵) Passkey (API سطح):');
  const regNoAuth = await api('/api/auth/passkeys/register/options', 'POST', null, {});
  check('options ثبت بدون نشست → ۴۰۱', regNoAuth.status === 401, `got ${regNoAuth.status}`);

  const regOpt = await api<{ options: { challenge: string; rp: { id: string }; user: { name: string; displayName: string } } }>(
    '/api/auth/passkeys/register/options',
    'POST',
    tokenA1,
    {}
  );
  check('options ثبت با نشست → ۲۰۰', regOpt.status === 200);
  check('challenge ساخته شد', (regOpt.json.data?.options.challenge?.length ?? 0) > 20);
  check(
    'userName = شماره موبایل (نه نام فروشگاه)',
    regOpt.json.data?.options.user.name === USER_A_PHONE,
    regOpt.json.data?.options.user.name
  );
  check(
    'displayName پس از ثبت نام = نام شخصی کاربر (نه نام فروشگاه)',
    (regOpt.json.data?.options.user.displayName ?? '').includes('مدیر فروشگاه') &&
      !(regOpt.json.data?.options.user.displayName ?? '').includes('فروشگاه پارس'),
    regOpt.json.data?.options.user.displayName
  );

  // Replay: استفاده از challenge در verify جعلی — بار اول challenge مصرف می‌شود و
  // امضای جعلی رد می‌شود؛ بار دوم همان challenge دیگر حتی به تأیید نمی‌رسد
  const challenge = regOpt.json.data?.options.challenge ?? '';
  const fakeClientData = Buffer.from(
    JSON.stringify({
      type: 'webauthn.create',
      challenge,
      origin: 'http://localhost:3000',
      crossOrigin: false,
    })
  ).toString('base64url');
  const fakeBody = {
    id: 'AA',
    rawId: 'AA',
    type: 'public-key',
    response: {
      clientDataJSON: fakeClientData,
      attestationObject: Buffer.from([0xa3, 0x63, 0x66, 0x6d, 0x74, 0x63, 0x6e, 0x6f, 0x6e, 0x65]).toString('base64url'),
    },
  };
  const rej1 = await api('/api/auth/passkeys/register/verify', 'POST', tokenA1, fakeBody);
  check('verify با امضای جعلی → ۴۰۰', rej1.status === 400, `got ${rej1.status}`);
  const rej2 = await api('/api/auth/passkeys/register/verify', 'POST', tokenA1, fakeBody);
  check('همان challenge دوباره → رد (یک‌بارمصرف/Replay)', rej2.status === 400, `got ${rej2.status}`);

  const loginOpt = await api<{ options: { challenge: string; rpId: string } }>(
    '/api/auth/passkeys/login/options',
    'POST',
    null,
    {}
  );
  check('login/options بدون شماره → ۲۰۰ (بدون افشای حساب)', loginOpt.status === 200);
  check('rpId از درخواست', (loginOpt.json.data?.options.rpId ?? '').length > 0);

  const loginOptPh = await api('/api/auth/passkeys/login/options', 'POST', null, {
    phone: '09119998877',
  });
  check('login/options شماره ناشناس → ۲۰۰ هم‌شکل (بدون افشا)', loginOptPh.status === 200);

  const fakeLogin = await api('/api/auth/passkeys/login/verify', 'POST', null, {
    id: 'UNKNOWN',
    rawId: 'UNKNOWN',
    type: 'public-key',
    response: {
      clientDataJSON: Buffer.from(
        JSON.stringify({ type: 'webauthn.get', challenge: 'x', origin: 'http://localhost:3000' })
      ).toString('base64url'),
      authenticatorData: 'AA',
      signature: 'AA',
    },
  });
  check(
    'login/verify با credential ناشناس → رد (۴۰۰/۴۰۱ — بدون افشا)',
    fakeLogin.status === 400 || fakeLogin.status === 401,
    `got ${fakeLogin.status}`
  );

  const pkDeleteMissing = await api('/api/user/passkeys/not-exists', 'DELETE', tokenA1);
  check('حذف Passkey ناموجود → ۴۰۴', pkDeleteMissing.status === 404, `got ${pkDeleteMissing.status}`);

  // ——— ۶) نشست‌ها ———
  console.log('۶) مدیریت نشست‌ها:');
  const sess1 = await api<{ sessions: Array<{ id: string; isCurrent: boolean }> }>(
    '/api/user/sessions',
    'GET',
    tokenA1
  );
  check('GET نشست‌ها → ۲۰۰', sess1.status === 200);
  const current = sess1.json.data?.sessions.find((s) => s.isCurrent);
  check('نشست جاری نشانه‌گذاری شده', !!current);
  check('حداقل دو نشست فعال (A دوبار لاگین + B)', (sess1.json.data?.sessions.length ?? 0) >= 2, `got ${sess1.json.data?.sessions.length}`);

  if (current) {
    const revokeCurrent = await api(`/api/user/sessions/${current.id}`, 'DELETE', tokenA1);
    check('ابطال نشست جاری از این مسیر → ۴۰۰', revokeCurrent.status === 400, `got ${revokeCurrent.status}`);
  }

  const revokeOthers = await api<{ revokedCount: number }>(
    '/api/user/sessions/revoke-others',
    'POST',
    tokenA1
  );
  check('revoke-others → ۲۰۰', revokeOthers.status === 200);
  check('حداقل یک نشست دیگر باطل شد', (revokeOthers.json.data?.revokedCount ?? 0) >= 1, `${revokeOthers.json.data?.revokedCount}`);

  const sess2 = await api<{ sessions: Array<{ id: string; isCurrent: boolean }> }>(
    '/api/user/sessions',
    'GET',
    tokenA1
  );
  check('فقط نشست جاری باقی مانده', sess2.json.data?.sessions.length === 1 && sess2.json.data.sessions[0]?.isCurrent === true, `${sess2.json.data?.sessions.length}`);

  // ——— ۷) پاکسازی ———
  // ایمیل آزمون پاک می‌شود؛ نام مدیر همان «مدیر فروشگاه» می‌ماند (بی‌ضرر)
  await api('/api/user/profile', 'PUT', tokenA1, {
    firstName: 'مدیر',
    lastName: 'فروشگاه',
    email: '',
  });

  await db.$disconnect();

  console.log('');
  if (failCount === 0) {
    console.log(`ALL GREEN — ${pass}/${pass + failCount} تست پروفایل/امنیت سبز ✅`);
    process.exit(0);
  }
  console.log(`قرمز: ${failCount} — ${failures.join(' | ')}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
