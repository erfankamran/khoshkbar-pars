/** Only local destinations may be opened from an inbox notification. */
export function notificationTarget(url: string | null): { href: string; orderCode: string | null; partnerAccount: boolean } | null {
  if (!url || !url.startsWith('/') || url.startsWith('//') || /[\\\u0000-\u0020]/.test(url)) return null;
  try {
    const target = new URL(url, 'https://pars.local');
    if (target.origin !== 'https://pars.local') return null;
    const code = target.pathname === '/' ? target.searchParams.get('o') : null;
    return {
      href: target.pathname + target.search + target.hash,
      orderCode: code && /^PARS-\d{8}-[A-Z2-9]{4}$/.test(code) ? code : null,
      partnerAccount: target.pathname === '/' && target.searchParams.get('account') === 'partner',
    };
  } catch {
    return null;
  }
}
