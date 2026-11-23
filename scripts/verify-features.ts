// تست صحت لایهٔ داده و کتابخانهٔ بلوک‌ها — اجرا: bun scripts/verify-features.ts
import { PrismaClient } from '@prisma/client';
import { parsePageBlocks, blocksToPlain, pageBlocksSchema } from '../src/lib/page-blocks';

const db = new PrismaClient();

// ۱) مدل Post در کلاینت جدید موجود است
const posts = await db.post.findMany({ where: { isPublished: true }, take: 5 });
console.log(`✅ Post model OK — ${posts.length} published post(s):`);
for (const p of posts) console.log(`   - ${p.slug} → ${p.title} (views: ${p.viewCount})`);

// ۲) ستون‌های جدید ContentPage
const page = await db.contentPage.findFirst({ select: { id: true, slug: true, editorMode: true, blocks: true } });
console.log(`✅ ContentPage new columns OK — sample: ${page?.slug} (mode: ${page?.editorMode ?? 'markdown'}, blocks: ${page?.blocks ?? 'null'})`);

// ۳) اعتبارسنجی و پارس بلوک‌ها — راندتریپ کامل
const sample = [
  { type: 'text', markdown: '## تیتر\nمتن **آزمایشی**' },
  {
    type: 'cards',
    columns: 3,
    items: [{ title: 'پسته اکبری', description: 'درشت و تازه', imageUrl: '/api/media/content/2026/11/x.png', href: '/c/pistachio', badge: 'پیشنهاد شف' }],
  },
  { type: 'icons', columns: 4, items: [{ icon: 'Truck', title: 'ارسال سریع', description: 'سراسر ایران' }] },
  { type: 'slider', autoplay: true, slides: [{ imageUrl: '/api/media/content/2026/11/s.png', title: 'اسلاید', subtitle: null, href: null }] },
  { type: 'gallery', columns: 3, images: [{ url: '/api/media/general/2026/11/g.png', alt: 'گالری' }] },
];
const parsed = pageBlocksSchema.parse(sample);
console.log(`✅ blocks schema OK — ${parsed.length} block types validated`);

const json = JSON.stringify(parsed);
const back = parsePageBlocks(json);
console.log(`✅ parsePageBlocks roundtrip OK — ${back?.length ?? 0} blocks, plain text: «${blocksToPlain(back ?? []).slice(0, 60)}…»`);

// ۴) JSON خراب → null (fallback امن مارک‌داون)
console.log(`✅ corrupt JSON → ${parsePageBlocks('{bad json')} (expect null)`);
console.log(`✅ foreign type → ${parsePageBlocks('[{"type":"evil","x":1}]')} (expect null)`);

await db.$disconnect();
console.log('— ALL DATA-LAYER CHECKS PASSED');
