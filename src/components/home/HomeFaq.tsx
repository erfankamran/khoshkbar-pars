'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useRouterStore } from '@/stores/router-store';

/**
 * پرسش‌های متداول صفحه اصلی — انتهای بدنه، پیش از فوتر
 *
 * ۴ پرسش ثابت در کد (درخواست کاربر ۱۴۰۵/۰۸/۲۰) — متن پاسخ‌ها از محتوای
 * واقعی فروشگاه (جدول FaqItem، همان ۴ سوالِ اول بر اساس sortOrder) کپی شده
 * تا صفحه اصلی به /api/content وابسته نباشد؛ تغییرشان فقط با ویرایش همین
 * فایل ممکن است. مابقی پرسش‌ها در نمای «پرسش‌های متداول» (view: faq) است.
 */

const HOME_FAQ_ITEMS: Array<{ id: string; question: string; answer: string }> = [
  {
    id: 'faq-shipping',
    question: 'هزینه و زمان ارسال چقدر است؟',
    answer:
      'سفارش‌های بالای سقف ارسال رایگان، پست پیشتاز رایگان دارند. سایر سفارش‌ها بر اساس روش ارسال انتخابی در تسویه حساب محاسبه می‌شود؛ سفارش‌های ثبت‌شده تا ساعت ۱۴ همان روز کاری به پست تحویل می‌شوند.',
  },
  {
    id: 'faq-freshness',
    question: 'محصولات چقدر تازه هستند؟',
    answer:
      'همه مغزها و خشکبارها تازه بو داده و در همان روز با بسته‌بندی پنج‌لایه محافظ ارسال می‌شوند؛ هر محموله پیش از ارسال کنترل کیفی می‌شود.',
  },
  {
    id: 'faq-returns',
    question: 'اگر محصول راضی‌کننده نبود چه؟',
    answer:
      'تا ۷ روز پس از تحویل، در صورت مغایرت یا مشکل کیفی، مبلغ سفارش به‌طور کامل بازگردانده می‌شود. کافی است از طریق شماره‌های تماس با پشتیبانی در ارتباط باشید.',
  },
  {
    id: 'faq-cod',
    question: 'پرداخت در محل دارید؟',
    answer:
      'بله، پرداخت در محل برای سراسر ایران فعال است. همچنین می‌توانید با کارت بانکی از درگاه امن پرداخت آنلاین استفاده کنید.',
  },
];

export function HomeFaq() {
  const push = useRouterStore((s) => s.push);

  return (
    <section aria-label="پرسش‌های متداول">
      <SectionHeader
        title="پرسش‌های متداول"
        onAction={() => push({ view: 'faq' })}
      />
      <div className="px-4">
        <Accordion type="single" collapsible className="space-y-2.5">
          {HOME_FAQ_ITEMS.map((item) => (
            <AccordionItem
              key={item.id}
              value={item.id}
              className="rounded-2xl border border-cream-200 bg-white px-4 shadow-card"
            >
              <AccordionTrigger className="py-3.5 text-right text-[12.5px] font-black leading-6 text-ink-900 hover:no-underline">
                <span className="flex-1">{item.question}</span>
              </AccordionTrigger>
              <AccordionContent className="whitespace-pre-line pb-4 text-[11.5px] leading-6 text-ink-600">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
