/**
 * ضرب کد OTP مستقیم در دیتابیس — برای اجرای رگرسیون روی سرور تولید.
 *
 * چرا؟ در production پاسخ /otp/request شامل devCode نیست (امنیت —
 * auth.service.ts) و کد در DB هش‌شدهٔ یک‌طرفه ذخیره می‌شود؛ پس سوئیت‌ها
 * نمی‌توانند کد را از پاسخ/DB بخوانند. این ابزار با همان الگوریتم
 * hashOtp سرور (sha256 با AUTH_SECRET) ردیف OTP می‌سازد و کد آشکار را
 * برمی‌گرداند تا verify مستقیم صدا زده شود — بدون /otp/request، بدون
 * کول‌داون و سقف ساعتی.
 *
 * شرط اجرا: دسترسی DB + همان AUTH_SECRET سرور (پیش‌فرض pars-dev-secret).
 * فقط ابزار تست — هرگز در کد سرور استفاده نشود.
 */
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  __parsTestDb: PrismaClient | undefined;
};

const testDb = globalForPrisma.__parsTestDb ?? new PrismaClient({ log: [] });
globalForPrisma.__parsTestDb = testDb;

/** همان hashOtp سرور (auth.service.ts) */
function hashOtp(phone: string, code: string): string {
  const secret = process.env.AUTH_SECRET ?? 'pars-dev-secret';
  return createHash('sha256').update(`pars:otp:${phone}:${code}:${secret}`).digest('hex');
}

/** ساخت ردیف OTP معتبر و بازگرداندن کد ۶ رقمی آشکار */
export async function mintOtp(phone: string): Promise<string> {
  const code = String(Math.floor(100_000 + Math.random() * 900_000));
  await testDb.otpCode.create({
    data: {
      phone,
      codeHash: hashOtp(phone, code),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      ip: '127.0.0.1',
    },
  });
  return code;
}
