// quick DB content check (read-only)
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const [faq, links, contacts, badges, users, noAvatar, products, reviews] = await Promise.all([
  db.faqItem.count(),
  db.footerLink.count(),
  db.contactNumber.count(),
  db.trustBadge.count(),
  db.user.count(),
  db.user.count({ where: { avatarUrl: null } }),
  db.product.count(),
  db.review.count(),
]);
console.log({ faq, links, contacts, badges, users, noAvatar, products, reviews });
await db.$disconnect();
