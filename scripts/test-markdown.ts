/**
 * تست پارسر مارک‌داون صفحات اختصاصی — درخواست کاربر
 * اجرا: bun scripts/test-markdown.ts
 */
import { mdToPlain, pageExcerpt, parseMarkdown } from '../src/lib/markdown';

let failures = 0;
function expect(cond: boolean, name: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

const sample = [
  '# قوانین فروشگاه',
  'متن **درشت** و *ایتالیک* و ~~حذف‌شده~~ و `کد` در یک خط.',
  '',
  '## بخش اول',
  '- مورد یک با **مهم**',
  '- مورد دو',
  '',
  '1. شماره یک',
  '2. شماره دو',
  '',
  '> نقل‌قول تستی با [لینک](https://example.com)',
  '',
  'لینک امن: [سایت](https://example.com/a_b) — لینک خطرناک: [کلیک](javascript:alert(1))',
  '',
  '![تصویر](/media/test.jpg)',
  '',
  '| ستون ۱ | ستون ۲ |',
  '| --- | --- |',
  '| الف | ب |',
  '',
  '```js',
  "console.log('سلام');",
  '```',
  '',
  '---',
  '',
  '### زیرتیتر',
  'پاراگراف پایانی.',
].join('\n');

const blocks = parseMarkdown(sample);

console.log('— بلوک‌های پارس‌شده —');
for (const b of blocks) {
  console.log(`  ${b.type}${b.type === 'heading' ? ` H${b.level}` : ''}`);
}

console.log('\n— بررسی‌ها —');

// تیترها
expect(blocks[0]!.type === 'heading' && blocks[0]!.level === 1, 'تیتر H1 شناخته شد');
expect(blocks.some((b) => b.type === 'heading' && b.level === 2), 'تیتر H2 شناخته شد');
expect(blocks.some((b) => b.type === 'heading' && b.level === 3), 'تیتر H3 شناخته شد');

// درون‌خطی
const para = blocks.find((b) => b.type === 'para')!;
if (para.type === 'para') {
  const kinds = para.c.map((s) => s.t);
  expect(kinds.includes('bold'), 'bold در پاراگراف');
  expect(kinds.includes('italic'), 'italic در پاراگراف');
  expect(kinds.includes('strike'), 'strike در پاراگراف');
  expect(kinds.includes('code'), 'کد درون‌خطی در پاراگراف');
}

// فهرست‌ها
const ul = blocks.find((b) => b.type === 'list' && !b.ordered);
expect(!!ul && ul.items.length === 2, 'فهرست نقطه‌ای با ۲ مورد');
const ol = blocks.find((b) => b.type === 'list' && b.ordered);
expect(!!ol && ol.items.length === 2, 'فهرست شماره‌دار با ۲ مورد');

// bold داخل آیتم فهرست
if (ul && ul.items[0]![0]!.t === 'text') {
  // «مورد یک با » + bold — بررسی تودرتو
  expect(ul.items[0]!.some((s) => s.t === 'bold'), 'bold تودرتو در آیتم فهرست');
}

// نقل‌قول + لینک امن
const quote = blocks.find((b) => b.type === 'quote');
expect(!!quote, 'نقل‌قول پارس شد');
if (quote && quote.type === 'quote') {
  const link = quote.c.find((s) => s.t === 'link');
  expect(!!link && link.t === 'link' && link.href === 'https://example.com', 'لینک امن داخل نقل‌قول');
}

// لینک خطرناک → متن ساده
const dangerPara = blocks.find((b) => b.type === 'para' && b.c.some((s) => s.t === 'text' && s.v.includes('لینک خطرناک')));
if (dangerPara && dangerPara.type === 'para') {
  const hasJsLink = dangerPara.c.some((s) => s.t === 'link' && s.href.startsWith('javascript'));
  expect(!hasJsLink, 'لینک javascript: رد شد (به متن ساده تبدیل شد)');
}

// تصویر
const imgPara = blocks.find((b) => b.type === 'para' && b.c.some((s) => s.t === 'img'));
expect(!!imgPara, 'تصویر پارس شد');
if (imgPara && imgPara.type === 'para') {
  const img = imgPara.c.find((s) => s.t === 'img');
  expect(!!img && img.t === 'img' && img.src === '/media/test.jpg', 'آدرس تصویر درست');
}

// جدول
const table = blocks.find((b) => b.type === 'table');
expect(!!table, 'جدول پارس شد');
if (table && table.type === 'table') {
  expect(table.head.length === 2, 'سرستون جدول = ۲');
  expect(table.rows.length === 1 && table.rows[0]!.length === 2, 'یک ردیف با ۲ سلول');
}

// بلوک کد
const code = blocks.find((b) => b.type === 'code');
expect(!!code && code.type === 'code' && code.lang === 'js', 'بلوک کد با زبان js');
if (code && code.type === 'code') {
  expect(code.v === "console.log('سلام');", 'محتوای کد دست‌نخورده');
}

// hr
expect(blocks.some((b) => b.type === 'hr'), 'خط جداکننده');

// — سازگاری با محتوای قدیمی («## تیتر» + پاراگراف ساده) —
const oldStyle = parseMarkdown('## این پیام برای مناسبت بلک فرایدی میباشد \nبا سلام خیلی خوشحالم که دارم براتون پست میزارم');
expect(
  oldStyle.length === 2 && oldStyle[0]!.type === 'heading' && oldStyle[0]!.level === 2 && oldStyle[1]!.type === 'para',
  'محتوای قدیمی: H2 + پاراگراف (هر دو در همان کارت رندر می‌شوند)'
);
if (oldStyle[0]!.type === 'heading') {
  expect(oldStyle[0]!.c[0]!.t === 'text', 'متن تیتر قدیمی سالم');
}
// متن بعد از تیتر داخل همان بلوک نمی‌آید (خط دوم پاراگراف جدا می‌شود؟ — نه: تیتر تک‌خطی است و ادامه پاراگراف جدا)
const oldPara = parseMarkdown('خط اول\nخط دوم');
expect(oldPara.length === 1 && oldPara[0]!.type === 'para', 'خطوط پشت‌سرهم = یک پاراگراف');

// — mdToPlain / pageExcerpt —
const plain = mdToPlain(sample);
expect(!plain.includes('**'), 'mdToPlain: علامت درشت حذف شد');
expect(!plain.includes('['), 'mdToPlain: لینک به متن تبدیل شد');
expect(!plain.includes('#'), 'mdToPlain: علامت تیتر حذف شد');
expect(pageExcerpt(sample).length <= 161, 'pageExcerpt کوتاه‌سازی شد');

// — escape —
const esc = parseMarkdown('این \\*\\*درشت نیست\\*\\* فقط متن است');
if (esc[0]!.type === 'para') {
  expect(!esc[0]!.c.some((s) => s.t === 'bold'), 'escape با بک‌اسلش: bold نشد');
}

console.log(failures === 0 ? '\n✅ همهٔ تست‌ها موفق' : `\n❌ ${failures} تست ناموفق`);
process.exit(failures === 0 ? 0 : 1);
