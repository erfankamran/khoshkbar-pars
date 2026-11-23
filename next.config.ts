import type { NextConfig } from "next";

// ——— کلید وضعیت توسعه/دمو — منبع: .env (NEXT_PUBLIC_DEV_MODE) ———
// در زمان بیلد خوانده و داخل باندل سرور و کلاینت قفل می‌شود؛ یعنی تغییر
// true/false = ویرایش .env + کامیت + بیلد پلتفرم. وقتی false باشد کلیدهای
// کد مادر اصلاً داخل باندل قرار نمی‌گیرند (مسیر آزمایشی به‌کلی حذف می‌شود).
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

const nextConfig: NextConfig = {
  output: "standalone",
  // ——— متغیرهای درون‌بندی‌شدهٔ باندل (منبع: .env) ———
  // فقط مقادیر «عمومی» (کدهای نمایشی OTP) اینجا inline می‌شوند؛ اسرار
  // (AUTH_SECRET / VAPID_*) هرگز از این مسیر عبور نمی‌کنند تا به کلاینت نشت نکنند.
  env: {
    NEXT_PUBLIC_DEV_MODE: DEV_MODE ? "true" : "false",
    ...(DEV_MODE
      ? {
          OTP_MASTER_CODE: process.env.OTP_MASTER_CODE || "123456",
          OTP_DEV_CODE_EXPOSE: "1",
          NEXT_PUBLIC_OTP_MASTER_CODE: process.env.NEXT_PUBLIC_OTP_MASTER_CODE || "123456",
        }
      : {}),
  },
  // خطاهای تایپ باید بیلد را بشکنند (typecheck در CI هم اجرا می‌شود)
  typescript: {
    ignoreBuildErrors: false,
  },
  // double-render توسعه‌ای مثل تولید — کشف کامپوننت‌های ناخالص
  reactStrictMode: true,
  // حذف هدر اطلاعاتی x-powered-by
  poweredByHeader: false,
  // ——— هاست‌های مجاز برای منابع dev (فقط development؛ در build اثری ندارد) ———
  // پیش‌نمایش پلتفرم از دامنهٔ *.space-z.ai به سرور dev پروکسی می‌کند؛ Next.js
  // به‌طور پیش‌فرض درخواست‌های بین‌دامنه به /_next/* (CSS/JS) را با 403 می‌بندد
  // و صفحه سفید می‌شود. این خط همان دامنه‌ها را مجاز می‌کند (الگوی * فقط
  // زیردامنه‌ها را می‌گیرد).
  allowedDevOrigins: ["*.space-z.ai"],
  experimental: {
    // درخت‌هیزن بهتر آیکون‌ها و انیمیشن‌ها در سرعت کامپایل dev
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
