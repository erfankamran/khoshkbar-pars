'use client';

import { useRouter } from 'next/navigation';
import { notificationTarget } from '@/lib/notification-target';
import { useRouterStore } from '@/stores/router-store';

export function useNotificationNavigation(inShop: boolean) {
  const router = useRouter();
  return (url: string | null) => {
    const target = notificationTarget(url);
    if (!target) return;
    if (inShop && target.partnerAccount) {
      useRouterStore.getState().push({ view: 'account', key: 'account' });
    } else if (inShop && target.orderCode) {
      useRouterStore.getState().push({
        view: 'orderDetail', params: { code: target.orderCode }, key: `orderDetail:${target.orderCode}`,
      });
    } else {
      router.push(target.href);
    }
  };
}
