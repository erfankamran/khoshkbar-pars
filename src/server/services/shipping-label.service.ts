import type { SessionUser } from '@/server/lib/auth';
import { getInvoiceForUser } from './invoice.service';

export async function getShippingLabel(user: SessionUser, code: string) {
  const { order, store } = await getInvoiceForUser(user, code);
  return {
    code: order.code, createdAt: order.createdAt, recipient: order.address, store,
    shippingMethodName: order.shippingMethodName, trackingCode: order.trackingCode,
    weightGrams: order.items.reduce((sum, item) => sum + item.weightGrams * item.quantity, 0),
  };
}
export type ShippingLabelDTO = Awaited<ReturnType<typeof getShippingLabel>>;
