/**
 * کپی متن در کلیپ‌بورد — با fallback برای محیط‌های بدون Clipboard API
 * navigator.clipboard فقط در secure context (https) موجود است؛ نسخه پیش‌نمایش
 * ممکن است http باشد — در آن حالت مسیر execCommand استفاده می‌شود.
 */

export async function copyText(text: string): Promise<boolean> {
  // مسیر استاندارد — در کلیک‌کاربر (user activation) معمولاً مجاز است
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ادامه به fallback — برخی مرورگرها بدون secure context رد می‌کنند
  }
  // مسیر جایگزین — textarea موقت خارج از دید
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
