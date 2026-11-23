import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { getSessionUser } from './auth';

export const PRIVATE_PRICING_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, x-pars-session' };

/** Approved partners see the per-kg offer and minimum order weight. */
export function customerVariants<T extends { isWholesale: boolean }>(variants: T[], role?: string): T[] {
  const wholesale = role === 'PARTNER' ? variants.filter((variant) => variant.isWholesale) : [];
  return wholesale.length ? wholesale : variants.filter((variant) => !variant.isWholesale);
}

/** Use the same authenticated identity for SSR and API prices. Never infer it from a query parameter. */
export async function storefrontUser() {
  return getSessionUser(new NextRequest('http://internal/', { headers: new Headers(await headers()) }));
}
