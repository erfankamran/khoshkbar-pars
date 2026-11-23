'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * آدرس تحویل انتخاب‌شده — انتخابگر هدر (درخواست کاربر)
 *
 * - انتخاب در هدر ذخیره و در همه‌جا نشان داده می‌شود
 * - persist در localStorage تا پس از بازگشت هم حفظ شود
 * - آدرس پیش‌فرض حساب، هنگام باز شدن انتخابگر به‌عنوان پیشنهاد نشان داده می‌شود
 * - نکته: تسویه حساب همچنان انتخاب نهایی خودش را دارد؛ اینجا «آدرس جاری»
 *   کاربر برای پوشش تجربه هدر است (حذف/تعویض آدرس در نمای آدرس‌ها)
 */

export interface DeliveryAddress {
  id: string;
  title: string;
  city: string;
  /** خلاصه کوتاه برای نمایش در هدر — عنوان یا شهر */
  province?: string;
}

interface DeliveryState {
  selected: DeliveryAddress | null;
  select: (address: DeliveryAddress) => void;
  clear: () => void;
}

export const useDeliveryStore = create<DeliveryState>()(
  persist(
    (set) => ({
      selected: null,
      select: (address) => set({ selected: address }),
      clear: () => set({ selected: null }),
    }),
    { name: 'pars:delivery-address' }
  )
);
