import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import type { SessionUser } from '@/server/lib/auth';
import { notifyAdmins } from '@/server/services/notification-center.service';

/**
 * سرویس نظرات محصولات (فاز ۷)
 *
 * قوانین:
 * - فقط نظرات تأییدشده (isApproved) نمایش داده می‌شود — تأیید در پنل مدیریت (فاز ۱۳)
 * - حریم خصوصی: شماره موبایل هرگز به کلاینت نمی‌رود؛ فقط نام نمایشی
 *   (نام کامل کاربر در صورت وجود، در غیر این صورت «خریدار پارس»)
 * - بج «خرید تأییدشده» فقط برای نظرات متصل به سفارش (orderId)
 *
 * Expected SQL statements: ۴ ثابت (اندازه‌گیری‌شده در dev.log)
 *   1) findUnique محصول با slug
 *   2) findMany نظرات
 *   3) batch-IN کاربران (WHERE id IN — یک دستور برای همه، ضد N+1)
 *   4) groupBy توزیع امتیازها
 */

export interface ReviewItemDTO {
  id: string;
  rating: number;
  comment: string | null;
  displayName: string;
  /** آواتار شخصیت/آپلودی نویسنده — فاز آواتار (شماره هرگز نمی‌رود) */
  avatarUrl: string | null;
  isVerifiedPurchase: boolean;
  /** پاسخ رسمی فروشگاه به این نظر — فقط از پنل مدیریت (null = بدون پاسخ) */
  adminReply: string | null;
  /** ISO تاریخ پاسخ فروشگاه */
  adminReplyAt: string | null;
  /** ISO تاریخ — قالب‌بندی شمسی سمت کلاینت */
  createdAt: string;
}

export interface ProductReviewsDTO {
  summary: {
    average: number;
    count: number;
    /** توزیع ۱..۵ — کلیدها به‌صورت رشته برای JSON امن */
    distribution: Record<string, number>;
  };
  items: ReviewItemDTO[];
}

export async function getProductReviews(
  slug: string,
  limit = 10,
  reviewId?: string
): Promise<ProductReviewsDTO> {
  const product = await db.product.findUnique({
    where: { slug },
    select: { id: true, ratingSum: true, ratingCount: true },
  });
  if (!product) throw ApiError.notFound('محصول یافت نشد');

  const [rows, distributionRows] = await Promise.all([
    db.review.findMany({
      where: { productId: product.id, isApproved: true, ...(reviewId ? { id: reviewId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        rating: true,
        comment: true,
        orderId: true,
        createdAt: true,
        adminReply: true,
        adminReplyAt: true,
        user: { select: { fullName: true, avatarUrl: true } },
      },
    }),
    db.review.groupBy({
      by: ['rating'],
      where: { productId: product.id, isApproved: true },
      _count: { rating: true },
    }),
  ]);

  const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const d of distributionRows) {
    distribution[String(d.rating)] = d._count.rating;
  }

  return {
    summary: {
      // میانگین از آمار تجمعی محصول (شامل نظرات قدیمی‌تر از سقف limit)
      average:
        product.ratingCount > 0
          ? Number((product.ratingSum / product.ratingCount).toFixed(1))
          : 0,
      count: product.ratingCount,
      distribution,
    },
    items: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      displayName: r.user.fullName?.trim() || 'خریدار پارس',
      avatarUrl: r.user.avatarUrl,
      isVerifiedPurchase: !!r.orderId,
      adminReply: r.adminReply,
      adminReplyAt: r.adminReplyAt ? r.adminReplyAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ------------------------------------------------------------
// ثبت نظر توسط کاربر (فاز ۱۴) — صف بازبینی پنل مدیریت
// ------------------------------------------------------------

/** ورودی ثبت نظر — اعتبارسنجی کامل سمت سرور */
export interface CreateReviewInput {
  rating: number;
  comment?: string | null;
}

/**
 * ثبت نظر جدید — پیش‌فرض isApproved=false (صف بازبینی مدیر)
 *
 * قوانین (بخش کاتالوگ مشخصات):
 * - ورود الزامی (نشست OTP)
 * - یک نظر برای هر کاربر روی هر محصول (هر وضعیتی) → 409 ALREADY_REVIEWED
 * - بج «خرید تأییدشده» فقط وقتی کاربر سفارش تحویل‌شده با این محصول دارد
 * Expected queries: ۴ (محصول + نظر قبلی + سفارش تحویل‌شده + ثبت)
 */
export async function createReview(
  user: SessionUser,
  slug: string,
  input: CreateReviewInput
): Promise<{ review: { id: string; isApproved: boolean } }> {
  const product = await db.product.findUnique({
    where: { slug },
    select: { id: true, isActive: true, title: true },
  });
  if (!product || !product.isActive) throw ApiError.notFound('محصول یافت نشد');

  const existing = await db.review.findFirst({
    where: { productId: product.id, userId: user.id },
    select: { id: true },
  });
  if (existing) {
    throw new ApiError(409, 'ALREADY_REVIEWED', 'شما قبلاً برای این محصول نظر ثبت کرده‌اید');
  }

  // خرید تأییدشده: سفارش تحویل‌شده شامل این محصول
  const deliveredItem = await db.orderItem.findFirst({
    where: {
      productId: product.id,
      order: { userId: user.id, status: 'DELIVERED' },
    },
    select: { orderId: true },
    orderBy: { orderId: 'desc' },
  });

  const comment = input.comment?.trim();
  const review = await db.review.create({
    data: {
      productId: product.id,
      userId: user.id,
      orderId: deliveredItem?.orderId ?? null,
      rating: input.rating,
      comment: comment ? comment.slice(0, 1000) : null,
      isApproved: false,
    },
    select: { id: true, isApproved: true },
  });

  void notifyAdmins({
    type: 'REVIEW', title: 'نظر جدید ثبت شد',
    body: `نظر جدید دربارهٔ «${product.title}»${comment ? `: ${comment}` : ''}`,
    url: `/admin/reviews?reviewId=${review.id}`,
  });
  return { review };
}
