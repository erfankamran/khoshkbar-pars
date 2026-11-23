/**
 * قواعد مشترک فرم‌های پنل ادمین (فاز ۱۱.۲)
 * کپی منطق اعتبارسنجی سمت سرور (validators/admin/catalog.schema) برای
 * بازخورد فوری UI — مرز امنیتی همچنان zod سمت سرور است
 */

export const slugRegex = /^[a-z0-9-]{2,60}$/;

/** تبدیل ارقام فارسی/عربی به لاتین برای ورودی‌های عددی */
export function toEnDigitsInput(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}
