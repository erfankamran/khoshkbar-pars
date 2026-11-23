import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'برگه پستی سفارش', robots: { index: false, follow: false } };
export default function ShippingLayout({ children }: { children: React.ReactNode }) { return children; }
