'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * درگ با ماوس برای ردیف‌های افقی اسکرول‌شوندهٔ صفحهٔ اصلی (فاز ۶)
 *
 * مشکل: «overflow-x-auto» خالص با ماوس درگ نمی‌شود و اسکرول‌بار هم با no-scrollbar
 * مخفی است → در دسکتاپ هیچ راهی برای جابه‌جایی ردیف محصولات نیست.
 *
 * راه‌حل: Pointer Events فقط برای pointerType === 'mouse' —
 * سوایپ لمسی و momentum موبایل کاملاً دست‌نخورده می‌ماند.
 *
 * - آستانهٔ ۶px: حرکت کم = کلیک عادی (کارت باز می‌شود)، بیشتر = درگ
 * - بعد از درگ، کلیکِ رهاکردن ماوس suppress می‌شود تا ناخواسته ناوبری نشود
 *   (پرچم در pointerdown بعدی ریست می‌شود → هیچ‌وقت کهنه نمی‌ماند)
 * - جابه‌جایی دلتا-محور با scrollBy → در RTL (scrollLeft منفی) هم درست کار می‌کند
 * - preventDefault روی pointerdown → انتخاب متن و درگ native تصویر رخ نمی‌دهد
 */
const DRAG_THRESHOLD_PX = 6;

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent<T>) => {
    // فقط دکمهٔ اصلی ماوس — لمس/قلم اسکرول native خودشان را دارند
    if (e.pointerType !== 'mouse' || e.button !== 0) return;

    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;

    // پرچم suppress کهنه را پاک کن (تعامل تازه شروع شده)
    suppressClickRef.current = false;

    // جلوگیری از انتخاب متن و شروع درگ native تصویر
    e.preventDefault();

    const startX = e.clientX;
    let lastX = e.clientX;
    let exceeded = false;
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDragging(false);
    };

    const onMove = (ev: PointerEvent) => {
      if (finished) return;
      const dx = ev.clientX - lastX;
      lastX = ev.clientX;
      if (!exceeded && Math.abs(ev.clientX - startX) > DRAG_THRESHOLD_PX) {
        exceeded = true;
        setDragging(true);
      }
      if (exceeded) {
        // دلتا-محور: در RTL هم جهت درست است (scrollLeft منفی)
        el.scrollBy({ left: -dx });
      }
    };

    const onUp = () => {
      cleanup();
      // درگ واقعی انجام شد → کلیکِ رهاکردن را بخوابان
      if (exceeded) suppressClickRef.current = true;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  /** کلیکِ بعد از درگ را در فاز capture می‌خواباند تا کارت ناخواسته باز نشود */
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return { ref, onPointerDown, onClickCapture, dragging };
}
