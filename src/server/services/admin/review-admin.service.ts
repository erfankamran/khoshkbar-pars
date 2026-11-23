import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { logAdminAction, type AdminUser } from '@/server/lib/rbac';
import type {
  AdminReviewAction,
  AdminReviewListQuery,
} from '@/server/validators/admin/review-admin.schema';

/**
 * سرویس مدیریت نظرات (فاز ۱۱.۴)
 *
 * - تأیید/رد با نگهداری درست آمار تجمعی محصول (ratingSum/ratingCount):
 *   تأیید → +rating به جمع و +۱ به شمارش؛ ردِ نظرِ تأییدشده → کسر همان‌ها
 *   (دو طرفه بودن باعث می‌شود toggling هرگز آمار را خراب نکند)
 * - حذف نظر تأییدشده هم آمار را تصحیح می‌کند
 * - هر اقدام با logAdminAction ردپای حسابرسی می‌گیرد
 *
 * Expected queries:
 *   GET /api/admin/reviews — ۲ (صفحه + شمارش) — بدون N+1 (محصول و کاربر با خود ردیف)
 *   PATCH — ۳ (خود + update + به‌روزرسانی آمار) + لاگ
 *   DELETE — ۳ (خود + تصحیح آمار + delete) + لاگ
 */

const PAGE_MAX = 50;

export interface AdminReviewItemDTO {
  id: string;
  rating: number;
  comment: string | null;
  isApproved: boolean;
  isVerifiedPurchase: boolean;
  createdAt: string;
  product: { id: string; title: string; slug: string; image: string | null };
  user: { fullName: string | null; phone: string };
}

export interface AdminReviewListDTO {
  items: AdminReviewItemDTO[];
  total: number;
  page: number;
  totalPages: number;
}

export async function listAdminReviews(
  query: AdminReviewListQuery
): Promise<AdminReviewListDTO> {
  const where = {
    ...(query.status === 'pending' ? { isApproved: false } : {}),
    ...(query.status === 'approved' ? { isApproved: true } : {}),
    ...(query.q
      ? {
          OR: [
            { comment: { contains: query.q } },
            { product: { title: { contains: query.q } } },
            { user: { fullName: { contains: query.q } } },
            { user: { phone: { contains: query.q } } },
          ],
        }
      : {}),
  };

  const limit = Math.min(query.limit, PAGE_MAX);
  const [rows, total] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * limit,
      take: limit,
      select: {
        id: true,
        rating: true,
        comment: true,
        isApproved: true,
        orderId: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
          },
        },
        user: { select: { fullName: true, phone: true } },
      },
    }),
    db.review.count({ where }),
  ]);

  return {
    page: query.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    items: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      isApproved: r.isApproved,
      isVerifiedPurchase: !!r.orderId,
      createdAt: r.createdAt.toISOString(),
      product: {
        id: r.product.id,
        title: r.product.title,
        slug: r.product.slug,
        image: r.product.images[0]?.url ?? null,
      },
      user: { fullName: r.user.fullName, phone: r.user.phone },
    })),
  };
}

/**
 * تأیید یا رد نظر — تغییر وضعیت با تصحیح همزمان آمار محصول در یک تراکنش.
 * عملیات تکراری بی‌اثر است (idempotent) — خطای 409 نمی‌گیرد.
 */
export async function decideAdminReview(
  admin: AdminUser,
  req: NextRequest,
  id: string,
  input: AdminReviewAction
): Promise<AdminReviewItemDTO> {
  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, rating: true, isApproved: true, productId: true },
  });
  if (!review) throw ApiError.notFound('نظر یافت نشد');

  const approve = input.action === 'APPROVE';

  // فقط گذار واقعی — در غیر این صورت آمار دوباره افزایش/کسر می‌شد
  if (review.isApproved !== approve) {
    await db.$transaction(async (tx) => {
      await tx.review.update({
        where: { id },
        data: { isApproved: approve },
        select: { id: true },
      });
      await tx.product.update({
        where: { id: review.productId },
        data: approve
          ? {
              ratingSum: { increment: review.rating },
              ratingCount: { increment: 1 },
            }
          : {
              ratingSum: { decrement: review.rating },
              ratingCount: { decrement: 1 },
            },
      });
    });
    await logAdminAction(req, admin, approve ? 'REVIEW_APPROVE' : 'REVIEW_REJECT', {
      reviewId: id,
      productId: review.productId,
      rating: review.rating,
    });
  }

  const fresh = await db.review.findUnique({
    where: { id },
    select: {
      id: true,
      rating: true,
      comment: true,
      isApproved: true,
      orderId: true,
      createdAt: true,
      product: {
        select: {
          id: true,
          title: true,
          slug: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
        },
      },
      user: { select: { fullName: true, phone: true } },
    },
  });
  if (!fresh) throw ApiError.notFound('نظر یافت نشد');

  return {
    id: fresh.id,
    rating: fresh.rating,
    comment: fresh.comment,
    isApproved: fresh.isApproved,
    isVerifiedPurchase: !!fresh.orderId,
    createdAt: fresh.createdAt.toISOString(),
    product: {
      id: fresh.product.id,
      title: fresh.product.title,
      slug: fresh.product.slug,
      image: fresh.product.images[0]?.url ?? null,
    },
    user: { fullName: fresh.user.fullName, phone: fresh.user.phone },
  };
}

/**
 * حذف نظر — اگر تأییدشده باشد آمار محصول تصحیح می‌شود
 */
export async function deleteAdminReview(
  admin: AdminUser,
  req: NextRequest,
  id: string
): Promise<{ deleted: true }> {
  const review = await db.review.findUnique({
    where: { id },
    select: { id: true, rating: true, isApproved: true, productId: true },
  });
  if (!review) throw ApiError.notFound('نظر یافت نشد');

  await db.$transaction(async (tx) => {
    if (review.isApproved) {
      await tx.product.update({
        where: { id: review.productId },
        data: {
          ratingSum: { decrement: review.rating },
          ratingCount: { decrement: 1 },
        },
      });
    }
    await tx.review.delete({ where: { id } });
  });
  await logAdminAction(req, admin, 'REVIEW_DELETE', { reviewId: id });

  return { deleted: true };
}
