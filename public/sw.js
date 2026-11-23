/*
 * پارس — Service Worker (فاز ۱۰ — PWA کامل: آفلاین + Push)
 *
 * استراتژی‌ها:
 * - استاتیک تغییرناپذیر (_next/static، /icons/، /images/) → Cache-First
 *   (فایل‌های Next هش نام دارند؛ اگر 200 نبود کش نمی‌شود)
 * - ناوبری‌ها (HTML) → Network-First با بازگشت به کش و در نهایت /offline.html
 * - هیچ‌گاه پاسخ‌های /api/ کش نمی‌شوند (قیمت، موجودی و داده‌های حساس)
 * - Push: نمایش اعلان فارسی RTL با آیکون؛ کلیک → تمرکز/بازکردن مقصد
 *
 * نسخه کش با هر تغییر این فایل باید bump شود.
 */
const VERSION = 'pars-pwa-v6-private-pricing';
const OFFLINE_URL = '/offline.html';

// برند assets واقعاً تغییرناپذیر — Cache-First امن
const IMMUTABLE = /^\/(icons|images)\//;
// chunks بیلد — در production تغییرناپذیرند اما در dev محتوای همان نشانی
// عوض می‌شود؛ Network-First تا همیشه کد تازه اجرا شود (آفلاین → کش)
const BUILD = /^\/_next\/static\//;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // پیش‌کش صفحه آفلاین — تنها منبعی که قبل از اولین بازدید لازم است
      const cache = await caches.open(VERSION);
      await cache.add(OFFLINE_URL);
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== VERSION).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // داده‌های زنده فروشگاه هرگز کش نمی‌شوند
  if (url.pathname.startsWith('/api/')) return;

  // ——— برند assets: Cache-First ———
  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const clone = response.clone();
          const cache = await caches.open(VERSION);
          cache.put(request, clone);
        }
        return response;
      })()
    );
    return;
  }

  // ——— chunks بیلد: Network-First (تازه بودن کد؛ آفلاین از کش) ———
  if (BUILD.test(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(VERSION);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          throw new Error('آفلاین');
        }
      })()
    );
    return;
  }

  // HTML may contain private partner prices; never cache it across accounts.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          return response;
        } catch {
          const offline = await caches.match(OFFLINE_URL);
          return offline ?? new Response('آفلاین', { status: 503 });
        }
      })()
    );
  }
});

// ——— Push (فاز ۱۰) ———
self.addEventListener('push', (event) => {
  let payload = { title: 'فروشگاه پارس', body: 'اعلان جدید', url: '/' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // بدنه متنی ساده
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      dir: 'rtl',
      lang: 'fa',
      icon: '/icons/icon-192.png',
      badge: '/icons/maskable-192.png',
      tag: payload.tag ?? 'pars-notification',
      renotify: false,
      data: { url: payload.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // پنجره باز اپ → تمرکز و هدایت به مقصد
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if (client.navigate && target !== '/') {
            try {
              await client.navigate(target);
            } catch {
              /* ناوبری در همان مسیر فعلی کافی است */
            }
          }
          return;
        }
      }
      // پنجره‌ای باز نیست → باز کردن جدید
      await self.clients.openWindow(target);
    })()
  );
});
