'use client';

import { useEffect, useState } from 'react';
import { MessageSquareText, Reply, Send, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/use-api';
import { apiPost, ApiClientError } from '@/lib/api-client';
import { toFaDigits } from '@/lib/fa';
import { formatJalaliDate } from '@/lib/jalali';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';
import { BRAND } from '@/lib/config';

/**
 * بخش نظرات صفحه محصول (فاز ۱۴) — فهرست نظرات تأییدشده + فرم ثبت
 * ثبت نظر → صف بازبینی مدیر (isApproved=false) → پس از تأیید عمومی می‌شود
 */

interface ReviewsResp {
  summary: { average: number; count: number; distribution: Record<string, number> };
  items: Array<{
    id: string;
    rating: number;
    comment: string | null;
    displayName: string;
    avatarUrl?: string | null;
    isVerifiedPurchase: boolean;
    adminReply: string | null;
    adminReplyAt: string | null;
    createdAt: string;
  }>;
}

export function ProductReviewsSection({ slug, reviewId }: { slug: string; reviewId?: string }) {
  const { data, loading, error, reload } = useApi<ReviewsResp>(
    `/api/products/${slug}/reviews?limit=8${reviewId ? `&reviewId=${encodeURIComponent(reviewId)}` : ''}`
  );
  useEffect(() => {
    if (reviewId && data) document.getElementById(`review-${reviewId}`)?.scrollIntoView({ block: 'center' });
  }, [reviewId, data]);
  const brandName = useSettingsStore((s) => s.brand?.name) || BRAND.name;
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (rating < 1) return;
    setSending(true);
    try {
      await apiPost(`/api/products/${slug}/reviews`, {
        rating,
        comment: comment || null,
      });
      setSubmitted(true);
      setRating(0);
      setComment('');
      toast.success('نظر شما ثبت شد — پس از تأیید مدیر نمایش داده می‌شود');
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        toast.error('برای ثبت نظر وارد حساب شوید');
      } else if (e instanceof ApiClientError && e.status === 409) {
        toast.info('شما قبلاً برای این محصول نظر ثبت کرده‌اید');
      } else {
        toast.error(e instanceof ApiClientError ? e.message : 'ثبت نظر ناموفق بود');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="reviews" className="mt-6 rounded-3xl bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-black text-ink-900">نظرات خریداران</h2>
        {data && data.summary.count > 0 && (
          <p className="flex items-center gap-1 text-[11.5px] font-bold text-ink-600">
            <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" aria-hidden />
            {toFaDigits(data.summary.average.toFixed(1))} از {toFaDigits(data.summary.count)} نظر
          </p>
        )}
      </div>

      {/* ——— فهرست نظرات تأییدشده ——— */}
      {loading ? (
        <div className="shimmer mt-3 h-24 rounded-2xl" aria-label="در حال بارگذاری" />
      ) : error ? (
        <p className="mt-3 text-[11px] text-ink-400">نظرات در دسترس نیست</p>
      ) : !data || data.items.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-cream-50 p-3 text-[11.5px] leading-6 text-ink-500">
          هنوز نظری تأیید نشده — اولین نفر باشید!
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {data.items.map((r) => (
            <li key={r.id} id={`review-${r.id}`} className="scroll-mt-6 rounded-2xl border border-cream-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {r.avatarUrl ? (
                     
                    <img
                      src={r.avatarUrl}
                      alt={`آواتار ${r.displayName}`}
                      className="h-8 w-8 shrink-0 rounded-full border border-cream-100 bg-cream-50 object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-black text-brand-700">
                      {r.displayName.slice(0, 1)}
                    </span>
                  )}
                  <p className="truncate text-[12px] font-black text-ink-800">{r.displayName}</p>
                </div>
                <div className="flex items-center gap-0.5" aria-label={`امتیاز ${r.rating} از ۵`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={cn(
                        'h-3 w-3',
                        i <= r.rating ? 'fill-gold-400 text-gold-400' : 'text-cream-300'
                      )}
                      aria-hidden
                    />
                  ))}
                </div>
              </div>
              {r.comment && <p className="mt-1.5 text-[12px] leading-6 text-ink-600">{r.comment}</p>}
              {/* ——— پاسخ رسمی فروشگاه ——— */}
              {r.adminReply && (
                <div className="mt-2.5 rounded-2xl border border-brand-100 bg-brand-50/70 p-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-950 text-[10px] font-black text-gold-300"
                    >
                      پ
                    </span>
                    <p className="truncate text-[11px] font-black text-brand-700">
                      پاسخ {brandName}
                    </p>
                    {r.adminReplyAt && (
                      <span className="shrink-0 text-[9.5px] text-ink-400">
                        {formatJalaliDate(r.adminReplyAt)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-[12px] leading-6 text-ink-700">
                    {r.adminReply}
                  </p>
                </div>
              )}
              <p className="mt-1.5 flex items-center gap-1 text-[10px] text-ink-400">
                {formatJalaliDate(r.createdAt)}
                {r.isVerifiedPurchase && ' — خرید تأییدشده'}
                {r.adminReply && (
                  <span className="inline-flex items-center gap-0.5 text-brand-600">
                    <Reply className="h-3 w-3" aria-hidden />
                    پاسخ داده شد
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* ——— فرم ثبت نظر ——— */}
      <div className="mt-4 rounded-2xl bg-cream-50 p-3.5">
        {submitted ? (
          <p className="flex items-center gap-2 text-[12px] font-bold text-brand-700">
            <MessageSquareText className="h-4 w-4" aria-hidden />
            نظر شما در صف تأیید است — سپاس از همراهی!
          </p>
        ) : (
          <>
            <p className="text-[12px] font-black text-ink-800">ثبت نظر شما</p>
            <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="امتیاز">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={rating === i}
                  aria-label={`${i} ستاره`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(i)}
                  className="p-0.5"
                >
                  <Star
                    className={cn(
                      'h-6 w-6 transition-colors',
                      i <= (hover || rating) ? 'fill-gold-400 text-gold-400' : 'text-cream-300'
                    )}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="تجربه‌تان از این محصول را بنویسید (اختیاری)…"
              aria-label="متن نظر"
              className="mt-2.5 w-full rounded-2xl border border-cream-200 bg-white p-3 text-[12.5px] leading-6 text-ink-800 outline-none transition-colors focus:border-brand-400"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[10px] text-ink-400">
                نظر پس از بازبینی مدیر منتشر می‌شود
              </p>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={rating < 1 || sending}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-[12px] font-black text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                {sending ? 'در حال ارسال…' : 'ثبت نظر'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
