// فاز آواتار — اختصاص تصادفی شخصیت پارس به کاربران موجود بدون آواتار
// فقط کاربران avatarUrl=null — آواتارهای آپلودی دست‌نخورده می‌مانند
import { PrismaClient } from '@prisma/client';

const NUT_AVATAR_URLS = [
  '/avatars/almond.webp',
  '/avatars/walnut.webp',
  '/avatars/pistachio.webp',
  '/avatars/hazelnut.webp',
  '/avatars/cashew.webp',
  '/avatars/peanut.webp',
  '/avatars/raisin.webp',
  '/avatars/mulberry.webp',
];

const db = new PrismaClient();

const users = await db.user.findMany({
  where: { avatarUrl: null },
  select: { id: true },
});

let updated = 0;
for (const u of users) {
  const url = NUT_AVATAR_URLS[Math.floor(Math.random() * NUT_AVATAR_URLS.length)]!;
  await db.user.update({ where: { id: u.id }, data: { avatarUrl: url } });
  updated++;
}

const distribution: Record<string, number> = {};
for (const url of NUT_AVATAR_URLS) {
  distribution[url] = await db.user.count({ where: { avatarUrl: url } });
}

console.log(`backfilled: ${updated} users`);
console.log('distribution:', distribution);
await db.$disconnect();
