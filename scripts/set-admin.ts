/**
 * ابزار عملیاتی: ارتقای شماره موبایل به مدیر (فاز ۱۱)
 *
 * - اجرا: bun scripts/set-admin.ts 0912xxxxxxx
 * - اگر کاربر وجود داشته باشد فقط نقش او ADMIN می‌شود؛ اگر نباشد ساخته می‌شود
 * - غیرفعال‌سازی (پایین‌آوردن نقش) عمداً در همین اسکریپت پشتیبانی نمی‌شود —
 *   برای آن مستقیماً دیتابیس/پنل کاربران (زیرفاز ۱۱.۶) مرجع است
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error('استفاده: bun scripts/set-admin.ts <شماره موبایل>');
    process.exit(1);
  }
  // نرمال‌سازی ارقام فارسی/عربی و فرمت — همان قواعد ورود OTP
  const en = raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\d+]/g, '');
  const phone = en.startsWith('+98')
    ? `0${en.slice(3)}`
    : en.startsWith('98') && en.length === 12
      ? `0${en.slice(2)}`
      : en;
  if (!/^09\d{9}$/.test(phone)) {
    console.error('شماره موبایل معتبر نیست — مثال: 09123456789');
    process.exit(1);
  }

  const user = await db.user.upsert({
    where: { phone },
    create: { phone, fullName: 'مدیر فروشگاه پارس', role: 'ADMIN', isActive: true },
    update: { role: 'ADMIN', isActive: true },
    select: { id: true, phone: true, role: true },
  });
  console.log(`✓ کاربر ${user.phone} اکنون «${user.role}» است (${user.id})`);
}

main()
  .catch((e) => {
    console.error('SET-ADMIN FAILED:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
