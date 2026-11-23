// غنی‌سازی محتوای فروشگاه — افزودن پرسش‌های متداول واقعی (idempotent بر اساس متن پرسش)
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const NEW_FAQ: Array<{ question: string; answer: string }> = [
  {
    question: 'سفارش من چه زمانی ارسال می‌شود؟',
    answer:
      'سفارش‌هایی که تا ساعت ۱۴ ثبت و پرداخت شوند، همان روز آماده و به پست یا پیک سپرده می‌شوند؛ سفارش‌های بعد از ظهر روز کاری بعد ارسال می‌شوند. کد رهگیری به‌محض ارسال در بخش «سفارش‌های من» ثبت می‌شود.',
  },
  {
    question: 'مغزها را چطور نگهداری کنم تا تازه بمانند؟',
    answer:
      'بهترین روش، نگهداری در ظرف دربسته و خشک، دور از نور و هواست. برای نگهداری طولانی‌مدت (بیش از یک ماه) مغزها را در فریزر بگذارید؛ طعم و تازگی‌شان کاملاً حفظ می‌شود و قبل از مصرف لازم نیست صبر کنید تا آب شود.',
  },
  {
    question: 'امکان خرید عمده وجود دارد؟',
    answer:
      'بله، برای سفارش‌های عمده و همکاری در فروش، قیمت اختصاصی محاسبه می‌شود. کافی است با شماره‌های پشتیبانی (همان شماره‌های پایین سایت) تماس بگیرید تا شرایط عمده را برایتان بفرستیم.',
  },
  {
    question: 'اگر از سفارش راضی نبودم چه می‌شود؟',
    answer:
      'تا ۲۴ ساعت پس از تحویل، اگر مشکل کیفیت یا ایرادی در بسته‌بندی دیدید، با پشتیبانی تماس بگیرید؛ تعویض یا بازگشت وجه بدون معطلی انجام می‌شود. تضمین رضایت پارس همیشه پابرجاست.',
  },
  {
    question: 'روش‌های پرداخت کدام‌ها هستند؟',
    answer:
      'پرداخت آنلاین از طریق درگاه امن بانکی انجام می‌شود و در صورت فعال بودن، پرداخت در محل (کد به کد) هم موقع تحویل ممکن است. اطلاعات کارت در سایت ما ذخیره نمی‌شود؛ پرداخت کاملاً روی درگاه بانک انجام می‌گیرد.',
  },
  {
    question: 'چطور سفارشم را پیگیری کنم؟',
    answer:
      'از مسیر «حساب کاربری → سفارش‌های من» وضعیت لحظه‌ای سفارش (آماده‌سازی، ارسال، تحویل) و کد رهگیری پست را می‌بینید. با کد رهگیری می‌توانید در سایت پست هم رهگیری مستقیم انجام دهید.',
  },
];

const existing = await db.faqItem.findMany({ select: { question: true } });
const existingSet = new Set(existing.map((f) => f.question.trim()));

let added = 0;
let maxOrder = await db.faqItem.aggregate({ _max: { sortOrder: true } });
let nextOrder = (maxOrder._max.sortOrder ?? 0) + 1;

for (const item of NEW_FAQ) {
  if (existingSet.has(item.question.trim())) {
    console.log('skip (exists):', item.question);
    continue;
  }
  await db.faqItem.create({
    data: {
      question: item.question,
      answer: item.answer,
      sortOrder: nextOrder++,
      isActive: true,
    },
  });
  added++;
  console.log('added:', item.question);
}

const total = await db.faqItem.count();
console.log(`FAQ: added ${added}, total now ${total}`);
await db.$disconnect();
