import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const pages = await db.contentPage.findMany();
console.log('ContentPage rows:', pages.length);
for (const p of pages) console.log(`- slug=${p.slug} title=${p.title} active=${p.isActive} footer=${p.showInFooter} bodyLen=${p.body.length}`);
await db.$disconnect();
