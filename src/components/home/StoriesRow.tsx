'use client';

import { useState, useSyncExternalStore } from 'react';
import type { getStories } from '@/server/services/content.service';
import { useDragScroll } from '@/hooks/use-drag-scroll';
import { cn } from '@/lib/utils';
import { StoryViewer } from './StoryViewer';

import Image from 'next/image';
export type StoryGroupDTO = Awaited<
  ReturnType<typeof getStories>
>['groups'][number];

const SEEN_KEY = 'pars:stories-seen';

// ————————————————————————————————————————————
// Store کوچک «استوری‌های دیده‌شده» — با useSyncExternalStore
// (بدون setState داخل effect؛ سازگار با SSR و قانون react-hooks)
// ————————————————————————————————————————————
let seenKeys: string[] | null = null; // null = هنوز از sessionStorage خوانده نشده
const listeners = new Set<() => void>();

function loadSeenIfNeeded(): void {
  if (seenKeys !== null) return;
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    seenKeys = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    seenKeys = [];
  }
}

function subscribeSeen(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSeenSnapshot(): string {
  loadSeenIfNeeded();
  return seenKeys!.join('\n');
}

function getSeenServerSnapshot(): string {
  // سمت سرور هیچ استوری دیده‌شده‌ای وجود ندارد (حلقه طلایی در SSR)
  return '';
}

function markSeen(groupKey: string): void {
  loadSeenIfNeeded();
  if (seenKeys!.includes(groupKey)) return;
  seenKeys = [...seenKeys!, groupKey];
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(seenKeys));
  } catch {
    /* حافظه در دسترس نیست — فقط وضعیت این نشست */
  }
  listeners.forEach((l) => l());
}

/**
 * ردیف دایره‌های استوری صفحه اصلی (بخش ۴.۳ مشخصات)
 * - حلقه طلایی برای دیده‌نشده، حلقه خاکستری برای دیده‌شده (sessionStorage)
 * - نمایشگر تمام‌صفحه با نوار پیشرفت و تایمر (StoryViewer)
 */
export function StoriesRow({ groups }: { groups: StoryGroupDTO[] }) {
  const seen = useSyncExternalStore(
    subscribeSeen,
    getSeenSnapshot,
    getSeenServerSnapshot
  );
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const drag = useDragScroll<HTMLDivElement>();

  if (groups.length === 0) return null;

  const seenSet = new Set(seen ? seen.split('\n') : []);

  return (
    <>
      <div
        ref={drag.ref}
        onPointerDown={drag.onPointerDown}
        onClickCapture={drag.onClickCapture}
        className={cn(
          'no-scrollbar flex gap-3 overflow-x-auto px-4 pt-1',
          drag.dragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        role="list"
        aria-label="استوری‌های فروشگاه"
      >
        {groups.map((g, i) => {
          const isSeen = seenSet.has(g.groupKey);
          return (
            <button
              key={g.groupKey}
              type="button"
              role="listitem"
              onClick={() => setOpenIndex(i)}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              aria-label={`استوری ${g.groupTitle}`}
            >
              <span
                className={
                  isSeen
                    ? 'rounded-full p-[2.5px] ring-2 ring-cream-300'
                    : 'rounded-full bg-gradient-to-tr from-gold-400 via-gold-500 to-brand-500 p-[2.5px]'
                }
              >
                <span className="block rounded-full bg-white p-[1.5px]">
                  <Image
                    src={g.thumbUrl}
                    alt={g.groupTitle}
                    width={104}
                    height={104}
                    sizes="52px"
                    className="h-[52px] w-[52px] rounded-full object-cover"
                  />
                </span>
              </span>
              <span className="max-w-16 truncate text-[11px] font-bold text-ink-700">
                {g.groupTitle}
              </span>
            </button>
          );
        })}
      </div>

      {openIndex !== null && (
        <StoryViewer
          groups={groups}
          initialIndex={openIndex}
          onClose={() => setOpenIndex(null)}
          onGroupSeen={markSeen}
        />
      )}
    </>
  );
}
