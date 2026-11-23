/** دیباگ Push با پروفایل پایدار — غیر incognito */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const ctx = await chromium.launchPersistentContext('/tmp/pars-chrome-profile', {
  headless: false,
  viewport: { width: 390, height: 844 },
  permissions: ['notifications'],
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
  ],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const logs: string[] = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e}`));

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const diag = await page.evaluate(async () => {
    const out: Record<string, unknown> = {};
    out.permission = Notification.permission;
    const reg = await navigator.serviceWorker.getRegistration('/');
    out.regExists = !!reg;
    if (reg) {
      try {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: (await (await fetch('/api/push/vapid')).json()).data.publicKey as BufferSource,
        });
        out.subscribed = true;
        out.endpoint = sub.endpoint.slice(0, 80);
      } catch (e) {
        out.subscribeError = String(e);
        out.subscribeName = (e as Error).name;
      }
    }
    return out;
  });
  console.log(JSON.stringify(diag, null, 2));
} catch (e) {
  console.log('EVAL FAILED:', String(e));
}
console.log('— console tail —');
for (const l of logs.slice(-10)) console.log(l);
await ctx.close();
