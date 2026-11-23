/**
 * پاک‌سازی کدهای OTP — برای اجرای پشت‌سرهم تست‌ها بدون limiter (فاز ۱۳)
 * اجرا: bun scripts/reset-otp.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

await db.otpCode.deleteMany();
console.log('✅ همه کدهای OTP پاک شد (limiter تست آزاد است)');

await db.$disconnect();
