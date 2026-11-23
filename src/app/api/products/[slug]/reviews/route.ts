import type { NextRequest } from 'next/server';
import { createReview, getProductReviews } from '@/server/services/review.service';
import { ApiError, handleError, ok, parseQuery } from '@/server/lib/api';
import { getSessionUser } from '@/server/lib/auth';
import { readJson } from '@/server/lib/api';
import {
  createReviewSchema,
  emptyQuerySchema,
  reviewsQuerySchema,
  slugParamSchema,
} from '@/server/validators/catalog.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products/[slug]/reviews — نظرات تأییدشده محصول
 * Expected queries: 3 (محصول + نظرات + توزیع امتیاز)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { limit, reviewId } = parseQuery(reviewsQuerySchema, req.nextUrl.searchParams);
    const { slug } = await params;
    const validSlug = slugParamSchema.parse(slug);
    const data = await getProductReviews(validSlug, limit, reviewId);
    return ok(data);
  } catch (e) {
    return handleError(e);
  }
}

// ——— ثبت نظر (فاز ۱۴) — صف بازبینی پنل مدیریت ———

/** POST /api/products/[slug]/reviews — ثبت نظر کاربر واردشده (پیش‌فرض: در انتظار تأیید) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getSessionUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'برای ثبت نظر وارد حساب شوید');
    const { slug } = await params;
    const validSlug = slugParamSchema.parse(slug);
    const body = createReviewSchema.parse(await readJson(req));
    return ok(await createReview(user, validSlug, body));
  } catch (e) {
    return handleError(e);
  }
}
