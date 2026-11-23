/**
 * فایل راه‌انداز cPanel (Passenger) — «Startup File» در Setup Node.js App
 *
 * محل قرارگیری: ریشهٔ Application Root روی هاست cPanel
 *   مثلاً: /home/USERNAME/pars-app/server.js
 *
 * کار این فایل: اجرای سرور standalone بیلد production با تنظیمات درست برای Passenger.
 *
 * نکته‌ها:
 * - Passenger پورت را از env «PORT» به اپ می‌دهد؛ standalone خودش process.env.PORT
 *   را می‌خواند (فال‌بک 3000 فقط برای اجرای دستی خارج از Passenger است).
 * - HOSTNAME صراحتاً 0.0.0.0 می‌شود تا اگر Passenger مقدار دیگری ست کرده بود،
 *   سرور روی همهٔ اینترفیس‌ها گوش دهد (بسته‌شدن به hostname اشتباه = خطای 503).
 * - DATABASE_URL و MEDIA_STORAGE_DIR باید «مسیر مطلق» باشند (در envهای cPanel)،
 *   چون working directory اینجا ریشهٔ اپلیکیشن است نه پوشهٔ سورس.
 * - ری‌استارت اپ بعد از هر آپدیت: دکمهٔ Restart در صفحهٔ Setup Node.js App
 *   (معادل touch tmp/restart.txt).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.HOSTNAME = '0.0.0.0';
process.env.PORT = process.env.PORT || '3000';

require('./.next/standalone/server.js');
