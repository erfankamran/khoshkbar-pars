'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Reply,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { EmptyState, PageHeader, Toolbar, mutationError } from '@/components/admin/kit';
import { useApi } from '@/hooks/use-api';
import { apiDelete, apiPatch, apiPut } from '@/lib/api-client';
import { toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';

/**
 * مدیریت نظرات (فاز ۱۴ + پاسخ به نظرات) — صف تأیید، رد، حذف، پاسخ فروشگاه
 * تأیید/رد آمار امتیاز محصول را سمت سرور اصلاح می‌کند
 * پاسخ فروشگاه: PUT/DELETE /api/admin/reviews/[id]/reply — فقط نظرات
 * تأییدشده پاسخشان در صفحهٔ محصول نمایش داده می‌شود
 */

interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  isApproved: boolean;
  orderId: string | null;
  createdAt: string;
  adminReply: string | null;
  adminReplyAt: string | null;
  user: { fullName: string | null; phone: string };
  product: { id: string; title: string; slug: string };
}

interface ReviewsResp {
  reviews: AdminReview[];
  total: number;
  pendingCount: number;
  approvedCount: number;
}

export default function AdminReviewsPage() {
  return (
    <AdminShell>
      <Suspense fallback={<p className="p-4 text-sm text-ink-500">در حال بارگذاری نظر…</p>}>
        <ReviewsContent />
      </Suspense>
    </AdminShell>
  );
}

function ReviewsContent() {
  const reviewId = useSearchParams().get('reviewId');
  const [filter, setFilter] = useState<'pending' | 'approved'>('pending');
  const { data, loading, error, reload } = useApi<ReviewsResp>(
    `/api/admin/reviews?page=1&pageSize=50&filter=${filter}${reviewId ? `&reviewId=${encodeURIComponent(reviewId)}` : ''}`
  );

  // ——— پاسخ فروشگاه — حالت باز/بستهٔ ویرایشگر برای هر کارت ———
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  const moderate = async (r: AdminReview, isApproved: boolean) => {
    try {
      await apiPatch(`/api/admin/reviews/${r.id}`, { isApproved });
      toast.success(isApproved ? 'نظر تأیید شد' : 'نظر رد شد');
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  const remove = async (r: AdminReview) => {
    try {
      await apiDelete(`/api/admin/reviews/${r.id}`);
      toast.success('نظر حذف شد');
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  const openReplyComposer = (r: AdminReview) => {
    setReplyOpenFor(r.id);
    setReplyText(r.adminReply ?? '');
  };

  const closeReplyComposer = () => {
    setReplyOpenFor(null);
    setReplyText('');
  };

  const saveReply = async (r: AdminReview) => {
    const text = replyText.trim();
    if (!text) return;
    setReplyBusy(true);
    try {
      await apiPut(`/api/admin/reviews/${r.id}/reply`, { adminReply: text });
      toast.success(r.adminReply ? 'پاسخ به‌روزرسانی شد' : 'پاسخ فروشگاه ثبت شد');
      closeReplyComposer();
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    } finally {
      setReplyBusy(false);
    }
  };

  const removeReply = async (r: AdminReview) => {
    try {
      await apiDelete(`/api/admin/reviews/${r.id}/reply`);
      toast.success('پاسخ حذف شد');
      reload();
    } catch (e) {
      toast.error(mutationError(e));
    }
  };

  return (
    <div>
      <PageHeader title="نظرات" desc="بازبینی نظرات ثبت‌شده خریداران، تأیید پیش از نمایش عمومی و پاسخ رسمی فروشگاه" />
      {reviewId && <Link href="/admin/reviews" className="mb-3 inline-block text-xs font-bold text-brand-700">نمایش همهٔ نظرات</Link>}

      <Toolbar>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-black ${
              filter === 'pending' ? 'bg-brand-600 text-white' : 'bg-cream-100 text-ink-500 hover:bg-cream-200'
            }`}
          >
            در انتظار تأیید
            <span className={filter === 'pending' ? 'text-brand-100' : 'text-ink-300'}>
              {toFaDigits(data?.pendingCount ?? 0)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('approved')}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-black ${
              filter === 'approved' ? 'bg-brand-600 text-white' : 'bg-cream-100 text-ink-500 hover:bg-cream-200'
            }`}
          >
            تأییدشده
            <span className={filter === 'approved' ? 'text-brand-100' : 'text-ink-300'}>
              {toFaDigits(data?.approvedCount ?? 0)}
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={reload}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg bg-cream-100 text-ink-500 hover:bg-cream-200"
          aria-label="بازخوانی"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>
      </Toolbar>

      {loading ? (
        <div className="shimmer h-64 rounded-3xl" aria-label="در حال بارگذاری" />
      ) : error || !data ? (
        <EmptyState icon={MessageSquareText} title="دریافت نظرات ناموفق بود" hint={error ?? undefined} />
      ) : data.reviews.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title={filter === 'pending' ? 'نظر در صف تأیید نیست' : 'نظر تأییدشده‌ای نیست'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.reviews.map((r) => (
            <article key={r.id} id={`review-${r.id}`} className="rounded-3xl border border-cream-200 bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-black text-ink-900">{r.product.title}</p>
                  <p className="mt-0.5 text-[10.5px] text-ink-400">
                    {r.user.fullName?.trim() || 'خریدار پارس'} —{' '}
                    <span dir="ltr">{r.user.phone}</span> — {formatJalaliDate(r.createdAt)}
                    {r.orderId ? ' — خرید تأییدشده' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5" aria-label={`امتیاز ${r.rating} از ۵`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${i <= r.rating ? 'fill-gold-400 text-gold-400' : 'text-cream-300'}`}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
              {r.comment && (
                <p className="mt-2.5 rounded-2xl bg-cream-50 p-3 text-[12px] leading-6 text-ink-700">
                  {r.comment}
                </p>
              )}

              {/* ——— پاسخ ثبت‌شدهٔ فروشگاه ——— */}
              {r.adminReply && replyOpenFor !== r.id && (
                <div className="mt-2 rounded-2xl border border-brand-100 bg-brand-50/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-black text-brand-700">
                      <Reply className="h-3.5 w-3.5" aria-hidden />
                      پاسخ فروشگاه
                      {r.adminReplyAt && (
                        <span className="font-normal text-ink-400"> — {formatJalaliDate(r.adminReplyAt)}</span>
                      )}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openReplyComposer(r)}
                        className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-bold text-brand-700 hover:bg-brand-100"
                        aria-label="ویرایش پاسخ"
                      >
                        <Pencil className="h-3 w-3" aria-hidden />
                        ویرایش
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeReply(r)}
                        className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-bold text-red-600 hover:bg-red-50"
                        aria-label="حذف پاسخ"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
                        حذف
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-[12px] leading-6 text-ink-700">
                    {r.adminReply}
                  </p>
                </div>
              )}

              {/* ——— ویرایشگر پاسخ ——— */}
              {replyOpenFor === r.id && (
                <div className="mt-2 rounded-2xl border border-cream-200 bg-cream-50 p-3">
                  <p className="text-[11px] font-black text-ink-700">
                    {r.adminReply ? 'ویرایش پاسخ فروشگاه' : 'پاسخ فروشگاه به این نظر'}
                  </p>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    autoFocus
                    placeholder="پاسخ رسمی فروشگاه را بنویسید…"
                    aria-label="متن پاسخ فروشگاه"
                    className="mt-2 w-full rounded-2xl border border-cream-200 bg-white p-3 text-[12px] leading-6 text-ink-800 outline-none transition-colors focus:border-brand-400"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[9.5px] leading-4 text-ink-400">
                      پاسخ زیر نظر در صفحهٔ محصول نمایش داده می‌شود
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={closeReplyComposer}
                        className="flex h-8 items-center rounded-lg bg-white px-3 text-[11px] font-bold text-ink-500 hover:bg-cream-100"
                      >
                        انصراف
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveReply(r)}
                        disabled={replyBusy || !replyText.trim()}
                        className="flex h-8 items-center gap-1 rounded-lg bg-brand-600 px-3 text-[11px] font-black text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        {replyBusy ? 'در حال ثبت…' : r.adminReply ? 'به‌روزرسانی پاسخ' : 'ثبت پاسخ'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center gap-1.5">
                {r.isApproved ? (
                  <button
                    type="button"
                    onClick={() => void moderate(r, false)}
                    className="flex h-8 items-center gap-1 rounded-lg bg-gold-100 px-3 text-[11px] font-black text-gold-700 hover:bg-gold-200"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    رد تأیید
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void moderate(r, true)}
                    className="flex h-8 items-center gap-1 rounded-lg bg-brand-600 px-3 text-[11px] font-black text-white hover:bg-brand-700"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    تأیید
                  </button>
                )}
                {replyOpenFor !== r.id && (
                  <button
                    type="button"
                    onClick={() => openReplyComposer(r)}
                    className={`flex h-8 items-center gap-1 rounded-lg px-3 text-[11px] font-black transition-colors ${
                      r.adminReply
                        ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                        : 'bg-cream-100 text-ink-600 hover:bg-cream-200'
                    }`}
                  >
                    <Reply className="h-3.5 w-3.5" aria-hidden />
                    {r.adminReply ? 'پاسخ داده شده' : 'پاسخ'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void remove(r)}
                  className="mr-auto flex h-8 items-center gap-1 rounded-lg px-3 text-[11px] font-bold text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  حذف
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
