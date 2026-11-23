'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import { useRouterStore } from '@/stores/router-store';
import type { StoryGroupDTO } from './StoriesRow';

/**
 * نمایشگر استوری تمام‌صفحه (بخش ۴.۳ مشخصات)
 *
 * - هر آیتم ۵ ثانیه؛ نوار پیشرفت با CSS animation (بدون re-render هر فریم)
 * - تپ آینه‌ای RTL: نیمه چپ = بعدی، نیمه راست = قبلی (مانند اینستاگرام فارسی)
 * - نگه‌داشتن لمس = توقف موقت تایمر
 * - پایان گروه → گروه بعدی؛ پایان همه → بستن
 * - دکمه CTA استوری → ناوبری به مقصد (دسته/محصول/جستجو) و بستن
 * - در دسکتاپ ستون ۴۸۰px مرکز می‌ماند و اطراف تیره می‌شود
 */

const ITEM_DURATION_MS = 5000;

const STORY_PROGRESS_CSS = `
@keyframes pars-story-progress {
  from { width: 0%; }
  to { width: 100%; }
}
.pars-story-progress-active {
  animation: pars-story-progress linear forwards;
}
.pars-story-progress-paused {
  animation-play-state: paused !important;
}
`;

export function StoryViewer({
  groups,
  initialIndex,
  onClose,
  onGroupSeen,
}: {
  groups: StoryGroupDTO[];
  initialIndex: number;
  onClose: () => void;
  onGroupSeen: (groupKey: string) => void;
}) {
  const push = useRouterStore((s) => s.push);

  const [groupIdx, setGroupIdx] = useState(initialIndex);
  const [itemIdx, setItemIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const group = groups[groupIdx];
  const item = group?.items[itemIdx];
  const timerRef = useRef<number | null>(null);
  const remainingRef = useRef(ITEM_DURATION_MS);
  const startedAtRef = useRef(0);

  const goTo = useCallback(
    (nextGroup: number, nextItem: number) => {
      if (nextGroup < 0 || nextGroup >= groups.length) {
        onClose();
        return;
      }
      const g = groups[nextGroup];
      if (nextItem >= g.items.length) {
        // پایان این گروه → گروه بعدی
        setGroupIdx(nextGroup + 1);
        setItemIdx(0);
        if (nextGroup + 1 >= groups.length) onClose();
        return;
      }
      if (nextItem < 0) {
        // قبلی قبل از اولین آیتم → گروه قبلی (آخرین آیتم)
        setGroupIdx(nextGroup - 1);
        setItemIdx(0);
        if (nextGroup - 1 < 0) onClose();
        return;
      }
      setGroupIdx(nextGroup);
      setItemIdx(nextItem);
    },
    [groups, onClose]
  );

  const next = useCallback(
    () => goTo(groupIdx, itemIdx + 1),
    [goTo, groupIdx, itemIdx]
  );
  const prev = useCallback(
    () => goTo(groupIdx, itemIdx - 1),
    [goTo, groupIdx, itemIdx]
  );

  // علامت‌گذاری گروه فعلی به‌عنوان دیده‌شده
  useEffect(() => {
    if (group) onGroupSeen(group.groupKey);
  }, [group, onGroupSeen]);

  // ——— تایمر پیشروی خودکار با پشتیبانی توقف/ادامه ———
  useEffect(() => {
    remainingRef.current = ITEM_DURATION_MS;
    startedAtRef.current = Date.now();

    if (!paused) {
      timerRef.current = window.setTimeout(next, remainingRef.current);
    }
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [groupIdx, itemIdx, paused, next]);

  const handlePointerDown = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current = Math.max(
      400,
      remainingRef.current - (Date.now() - startedAtRef.current)
    );
    setPaused(true);
  };

  const handlePointerUp = () => setPaused(false);

  // قفل اسکرول پس‌زمینه هنگام باز بودن نمایشگر
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // ——— ناوبری CTA ———
  const handleLink = () => {
    if (!item?.linkView || item.linkView === 'none') return;
    const params = item.linkParams ?? {};
    push({
      view: item.linkView as Parameters<typeof push>[0]['view'],
      params,
    });
    onClose();
  };

  if (!group || !item) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/90"
      role="dialog"
      aria-modal="true"
      aria-label={`استوری ${group.groupTitle}`}
    >
      <style>{STORY_PROGRESS_CSS}</style>

      <div className="relative flex h-full w-full max-w-[480px] flex-col bg-ink-950">
        {/* ——— نوارهای پیشرفت ——— */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-3">
          {group.items.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              {i < itemIdx ? (
                <div className="h-full w-full bg-white" />
              ) : i === itemIdx ? (
                <div
                  key={`${groupIdx}-${itemIdx}-${paused ? 'p' : 'r'}`}
                  className={`h-full bg-white pars-story-progress-active ${
                    paused ? 'pars-story-progress-paused' : ''
                  }`}
                  style={{ animationDuration: `${ITEM_DURATION_MS}ms` }}
                />
              ) : null}
            </div>
          ))}
        </div>

        {/* ——— هدر ——— */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2.5 px-4 pt-7">
          <span className="block rounded-full bg-white/20 p-[2px]">
            <img
              src={group.thumbUrl}
              alt={`استوری ${group.groupTitle}`}
              className="h-9 w-9 rounded-full object-cover"
            />
          </span>
          <span className="text-[13px] font-extrabold text-white">
            {group.groupTitle}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن استوری"
            className="rounded-full bg-white/15 p-2 text-white transition-colors active:bg-white/30"
          >
            <X className="h-4.5 w-4.5" aria-hidden />
          </button>
        </div>

        {/* ——— رسانه + نواحی تپ ——— */}
        <div
          className="relative flex-1 select-none"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {item.mediaType === 'video' ? (
            <video
              key={item.id}
              src={item.mediaUrl}
              className="h-full w-full object-cover"
              autoPlay
              muted
              playsInline
              onEnded={next}
            />
          ) : (
            <img
              key={item.id}
              src={item.mediaUrl}
              alt={item.caption ?? group.groupTitle}
              className="h-full w-full object-cover"
              draggable={false}
            />
          )}

          {/* گرادیان خوانایی کپشن */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950/80 to-transparent"
            aria-hidden
          />

          {/* نیمه راست = قبلی / نیمه چپ = بعدی (آینه RTL) */}
          <button
            type="button"
            aria-label="استوری قبلی"
            onClick={prev}
            className="absolute inset-y-0 right-0 z-10 w-1/3"
          />
          <button
            type="button"
            aria-label="استوری بعدی"
            onClick={next}
            className="absolute inset-y-0 left-0 z-10 w-2/3"
          />
        </div>

        {/* ——— کپشن + CTA ——— */}
        <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 p-4 pb-8">
          {item.caption && (
            <p className="text-[13px] font-bold leading-6 text-white drop-shadow">
              {item.caption}
            </p>
          )}
          {item.linkView && item.linkView !== 'none' && (
            <button
              type="button"
              onClick={handleLink}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-gold-400 text-sm font-black text-brand-950 transition-transform active:scale-[0.98]"
            >
              مشاهده
              <ChevronRight className="h-4 w-4 rotate-180" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
