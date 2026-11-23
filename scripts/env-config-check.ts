/**
 * تست منطق پیکربندی env سرویس پیامک — بدون ارسال واقعی پیامک
 * اجرا: bun scripts/env-config-check.ts
 */
import { getSmsConfig, isSmsEnvManaged } from '../src/server/services/sms.service';

function mask(v: string): string {
  return v ? `${v.slice(0, 3)}***(${v.length})` : '(empty)';
}

async function main() {
  // — حالت ۱: env کامل → مقدم بر پنل —
  process.env.SMS_PROVIDER = 'melipayamak';
  process.env.SMS_USERNAME = '5000123456';
  process.env.SMS_PASSWORD = 'secret-pass-123';
  process.env.SMS_SENDER = '50004000123456';
  const c1 = await getSmsConfig();
  console.log('1) env complete  →', c1 ? `username=${mask(c1.username)} password=${mask(c1.password)} sender=${c1.sender}` : 'null', '| envManaged:', isSmsEnvManaged());

  // — حالت ۲: env ناقص → فال‌بک به پنل (DB) —
  delete process.env.SMS_PASSWORD;
  const c2 = await getSmsConfig();
  console.log('2) env partial   →', c2 ? `source=panel username=${mask(c2.username)}` : 'null (panel هم پیکربندی نشده — sandbox)', '| envManaged:', isSmsEnvManaged());

  // — حالت ۳: provider اشتباه → پیکربندی از env نمی‌شود —
  process.env.SMS_PASSWORD = 'secret-pass-123';
  process.env.SMS_PROVIDER = 'kavenegar';
  const c3 = await getSmsConfig();
  console.log('3) wrong provider→', c3 ? 'unexpected config' : 'null (نادیده گرفته شد)', '| envManaged:', isSmsEnvManaged());

  // — حالت ۴: بدون env → مسیر پنل —
  delete process.env.SMS_PROVIDER;
  delete process.env.SMS_USERNAME;
  delete process.env.SMS_PASSWORD;
  delete process.env.SMS_SENDER;
  const c4 = await getSmsConfig();
  console.log('4) no env        →', c4 ? `source=panel` : 'null (sandbox)', '| envManaged:', isSmsEnvManaged());
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
