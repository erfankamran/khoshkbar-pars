import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'فاکتور سفارش', robots: { index: false, follow: false } };
export default function InvoiceLayout({ children }: { children: React.ReactNode }) { return children; }
