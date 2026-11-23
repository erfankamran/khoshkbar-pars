import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { reviewListQuerySchema } from '@/server/validators/admin.schema';
import { pageOffset } from './shared';
import type { z } from 'zod';
import { notifyInbox } from '@/server/services/notification-center.service';

/**
 * مدیریت نظرات (فاز ۱۴) — صف تأیید، رد، حذف
 *
 * آمار امتیاز محصول (ratingSum/ratingCount) فقط نظرات تأییدشده را می‌شمارند؛
 * تأیید/رد → به‌روزرسانی تجمعی در همان تراکنش تا میانگین همیشه سازگار بماند.
 */

type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

/** فهرست نظرات با فیلتر و شمارش صف — Expected queries: ۳ */
export async function listAdminReviews(query: ReviewListQuery) {
  const where = query.reviewId ? { id: query.reviewId } :
    query.filter === 'pending'
      ? { isApproved: false }
      : query.filter === 'approved'
        ? { isApproved: true }
        : {};

  const [reviews, total, pendingCount, approvedCount] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.pageSize,
      skip: pageOffset(query.page, query.pageSize),
      select: {
        id: true,
        rating: true,
        comment: true,
        isApproved: true,
        orderId: true,
        createdAt: true,
        adminReply: true,
        adminReplyAt: true,
        user: { select: { fullName: true, phone: true } },
        product: { select: { id: true, title: true, slug: true } },
      },
    }),
    db.review.count({ where }),
    db.review.count({ where: { isApproved: false } }),
    db.review.count({ where: { isApproved: true } }),
  ]);

  return {
    reviews,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pendingCount,
    approvedCount,
  };
}

/** تأیید/رد نظر — با اصلاح تجمعی امتیاز محصول (هر گذار فقط یک‌بار) */
export async function setReviewApproval(id: string, isApproved: boolean) {
  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, isApproved: true, rating: true, productId: true, userId: true, adminReply: true, product: { select: { slug: true, title: true } } },
  });
  if (!review) throw ApiError.notFound('نظر یافت نشد');
  if (review.isApproved === isApproved) {
    return { review: { id: review.id, isApproved }, unchanged: true };
  }

  const updated = await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: review.productId },
      data: isApproved
        ? { ratingSum: { increment: review.rating }, ratingCount: { increment: 1 } }
        : { ratingSum: { decrement: review.rating }, ratingCount: { decrement: 1 } },
    });
    return tx.review.update({
      where: { id },
      data: { isApproved },
      select: { id: true, isApproved: true },
    });
  });

  if (isApproved && review.adminReply) {
    void notifyInbox(review.userId, {
      type: 'REVIEW', title: 'فروشگاه به نظر شما پاسخ داد',
      body: `پاسخ نظر شما دربارهٔ «${review.product.title}»: ${review.adminReply}`,
      url: `/p/${encodeURIComponent(review.product.slug)}?review=${id}#review-${id}`,
    });
  }
  return { review: updated, unchanged: false };
}

/**
 * پاسخ فروشگاه به یک نظر — ثبت/ویرایش (Upsert)
 * پاسخ مستقل از وضعیت تأیید مجاز است؛ اما فقط برای نظرات تأییدشده
 * در صفحهٔ محصول نمایش داده می‌شود (نظر تأییدنشده اصلاً عمومی نیست).
 */
export async function setReviewReply(id: string, adminReply: string) {
  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, userId: true, isApproved: true, product: { select: { slug: true, title: true } } },
  });
  if (!review) throw ApiError.notFound('نظر یافت نشد');

  const updated = await db.review.update({
    where: { id },
    data: { adminReply, adminReplyAt: new Date() },
    select: { id: true, adminReply: true, adminReplyAt: true, isApproved: true },
  });
  if (review.isApproved) {
    void notifyInbox(review.userId, {
      type: 'REVIEW', title: 'فروشگاه به نظر شما پاسخ داد',
      body: `پاسخ نظر شما دربارهٔ «${review.product.title}»: ${adminReply}`,
      url: `/p/${encodeURIComponent(review.product.slug)}?review=${id}#review-${id}`,
    });
  }
  return { review: updated };
}

/** حذف پاسخ فروشگاه از یک نظر */
export async function clearReviewReply(id: string) {
  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, adminReply: true },
  });
  if (!review) throw ApiError.notFound('نظر یافت نشد');
  if (review.adminReply === null) {
    return { review: { id: review.id, adminReply: null, adminReplyAt: null }, unchanged: true };
  }

  const updated = await db.review.update({
    where: { id },
    data: { adminReply: null, adminReplyAt: null },
    select: { id: true, adminReply: true, adminReplyAt: true },
  });
  return { review: updated, unchanged: false };
}

/** حذف نظر — اگر تأییدشده بود، امتیاز تجمعی اصلاح می‌شود */
export async function deleteAdminReview(id: string) {
  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, isApproved: true, rating: true, productId: true },
  });
  if (!review) throw ApiError.notFound('نظر یافت نشد');

  await db.$transaction(async (tx) => {
    if (review.isApproved) {
      await tx.product.update({
        where: { id: review.productId },
        data: { ratingSum: { decrement: review.rating }, ratingCount: { decrement: 1 } },
      });
    }
    await tx.review.delete({ where: { id } });
  });

  return { deleted: review.id };
}
