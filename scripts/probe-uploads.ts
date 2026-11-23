import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const db = new PrismaClient();

// OTP mint (same as otp-fallback)
function hashOtp(phone: string, code: string): string {
  const secret = process.env.AUTH_SECRET ?? 'pars-dev-secret';
  return createHash('sha256').update(`pars:otp:${phone}:${code}:${secret}`).digest('hex');
}
async function mintOtp(phone: string): Promise<string> {
  const code = String(Math.floor(100_000 + Math.random() * 900_000));
  await db.otpCode.create({
    data: {
      phone,
      codeHash: hashOtp(phone, code),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      ip: '127.0.0.1',
    },
  });
  return code;
}

// ۱) ورود ادمین
const code = await mintOtp('09121111111');
const verify = await fetch(`${BASE}/api/auth/otp/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '09121111111', code }),
});
const session = /pars_session=([a-f0-9]+)/.exec(verify.headers.get('set-cookie') ?? '')?.[1];
if (!session) throw new Error('login failed');

// ۲) آپلود PNG واقعی
mkdirSync('/tmp/upl', { recursive: true });
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const form = new FormData();
form.append('file', new File([new Uint8Array(png)], 'probe.png', { type: 'image/png' }));
const up = await fetch(`${BASE}/api/admin/upload`, {
  method: 'POST',
  headers: { Cookie: `pars_session=${session}` },
  body: form,
});
const upBody = (await up.json()) as { ok?: boolean; data?: { url?: string } };
console.log('upload:', up.status, upBody.data?.url);
if (!upBody.data?.url) process.exit(1);

// ۳) GET همان فایل
const res = await fetch(`${BASE}${upBody.data.url}`);
const buf = Buffer.from(await res.arrayBuffer());
console.log('GET:', res.status, 'type:', res.headers.get('content-type'), 'x-route:', res.headers.get('x-pars-uploads'));
console.log('bytes match:', buf.equals(png));
console.log(res.status === 200 && buf.equals(png) ? 'UPLOAD-SERVING OK' : 'UPLOAD-SERVING BROKEN');

// ۴) ۴۰۴ برای نام خارج از الگو
const bad = await fetch(`${BASE}/uploads/../../db/custom.db`);
console.log('traversal probe:', bad.status);

await db.$disconnect();
