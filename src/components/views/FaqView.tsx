'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { CircleHelp } from 'lucide-react';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState, ErrorState } from '@/components/shared/States';
import { useApi } from '@/hooks/use-api';
import type { SiteContent } from '@/server/services/content.service';

/**
 * پرسش‌های متداول (فاز ۳) — خواندن از /api/content (جدول مستقل FaqItem)
 * Accordion ساده با آیکن پرسش؛ پاسخ‌های رسمی فروشگاه
 */
export function FaqView() {
  const { data, loading, error, reload } = useApi<SiteContent>('/api/content');
  const faq = data?.faq ?? [];

  return (
    <div>
      <TopBar title="پرسش‌های متداول" />

      <div className="px-4 py-4">
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-16 rounded-2xl" aria-label="در حال بارگذاری" />
            ))}
          </div>
        ) : error ? (
          <ErrorState title="دریافت پرسش‌ها ناموفق بود" onRetry={reload} />
        ) : faq.length === 0 ? (
          <EmptyState
            icon={CircleHelp}
            title="هنوز پرسشی ثبت نشده است"
            description="پرسش‌های متداول از پنل مدیریت اضافه می‌شود"
          />
        ) : (
          <Accordion type="single" collapsible className="space-y-2.5">
            {faq.map((item, i) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="rounded-2xl border border-cream-200 bg-white px-4 shadow-card"
              >
                <AccordionTrigger className="py-3.5 text-right text-[13px] font-black leading-6 text-ink-900 hover:no-underline">
                  <span className="flex-1">{item.question}</span>
                </AccordionTrigger>
                <AccordionContent className="whitespace-pre-line pb-4 text-[12px] leading-6 text-ink-600">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
