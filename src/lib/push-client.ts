/**
 * کلاینت Web Push (فاز ۱۰ — رضایت‌محور، بخش ۱۱ مشخصات)
 *
 * - کلید عمومی VAPID از /api/push/vapid خوانده می‌شود (env سرور)
 * - subscribe: Permission → pushManager.subscribe → POST /api/push/subscribe
 * - unsubscribe: pushManager.unsubscribe → POST /api/push/unsubscribe
 * - همه توابع فقط سمت کلاینت فراخوانی می‌شوند (مرورگر)
 */

export type PushSupport =
  | 'unsupported' // مرورگر بدون Push/Notification
  | 'not-configured' // کلید VAPID سرور تنظیم نشده (۵۰۳)
  | 'denied' // کاربر مجوز را رد کرده
  | 'subscribed' // اشتراک فعال روی این دستگاه
  | 'enable' // مجوز هست/قابل درخواست — اشتراک نیست
  ;

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** تبدیل کلید base64url به Uint8Array برای applicationServerKey */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** اشتراک فعال این دستگاه — یا null */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/**
 * وضعیت پشتیبانی/رضایت Push برای نمایش کارت در تنظیمات
 * 'enable' یعنی دکمه فعال‌سازی باید دیده شود
 */
export async function resolvePushSupport(): Promise<PushSupport> {
  if (!pushSupported()) return 'unsupported';
  const res = await fetch('/api/push/vapid');
  if (!res.ok) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await getPushSubscription();
  return sub ? 'subscribed' : 'enable';
}

/** درخواست مجوز + اشتراک + ثبت در سرور — در صورت خطا throw (caller پیام می‌دهد) */
export async function subscribeToPush(): Promise<PushSubscriptionPayload> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('PERMISSION_DENIED');
  }
  const res = await fetch('/api/push/vapid');
  if (!res.ok) throw new Error('PUSH_NOT_CONFIGURED');
  const { data } = (await res.json()) as { data: { publicKey: string } };

  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) throw new Error('NO_SERVICE_WORKER');

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // BufferSource — TS جدید Uint8Array را strict می‌گیرد
    applicationServerKey: urlBase64ToUint8Array(data.publicKey) as BufferSource,
  });

  const json = sub.toJSON() as PushSubscriptionPayload;
  const save = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...json, userAgent: navigator.userAgent }),
  });
  if (!save.ok) throw new Error('SUBSCRIBE_SAVE_FAILED');
  return json;
}

/** لغو اشتراک این دستگاه — همیشه نتیجه boolean (خطای سرور مانع لغو محلی نیست) */
export async function unsubscribeFromPush(): Promise<boolean> {
  const sub = await getPushSubscription();
  if (!sub) return true;
  const okLocal = await sub.unsubscribe();
  try {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {
    /* لغو محلی انجام شد — حذف سروری در پاک‌سازی ۴۱۰ بعدی انجام می‌شود */
  }
  return okLocal;
}
