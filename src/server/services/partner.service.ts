import type { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import type { SessionUser } from '@/server/lib/auth';
import type { partnerListSchema, partnerRequestSchema, partnerReviewSchema } from '@/server/validators/partner.schema';
import { notifyAdmins, notifyInbox } from './notification-center.service';

export async function getPartnerRequest(user: SessionUser) {
  const request = await db.partnerRequest.findUnique({ where: { userId: user.id } });
  return { role: user.role, request };
}

export async function submitPartnerRequest(user: SessionUser, input: z.infer<typeof partnerRequestSchema>) {
  const request = await db.$transaction(async (tx) => {
    const currentUser = await tx.user.findUnique({ where: { id: user.id }, select: { role: true, isActive: true } });
    if (!currentUser?.isActive) throw new ApiError(403, 'FORBIDDEN', 'حساب کاربری فعال نیست');
    if (currentUser.role !== 'USER') throw new ApiError(409, 'ALREADY_PARTNER', 'این حساب نیازی به درخواست همکاری ندارد');
    const current = await tx.partnerRequest.findUnique({ where: { userId: user.id } });
    if (current?.status === 'PENDING') throw new ApiError(409, 'REQUEST_PENDING', 'درخواست شما در انتظار بررسی است');
    return tx.partnerRequest.upsert({
      where: { userId: user.id },
      create: { userId: user.id, businessName: input.businessName, message: input.message || null },
      update: { businessName: input.businessName, message: input.message || null, status: 'PENDING', reviewNote: null, reviewedById: null, reviewedAt: null, createdAt: new Date() },
    });
  });
  void notifyAdmins({ type: 'SYSTEM', title: 'درخواست همکاری جدید', body: `${input.businessName} درخواست تأیید همکاری فرستاد`, url: `/admin/partners?requestId=${request.id}` });
  return { role: user.role, request };
}

export async function listPartnerRequests(query: z.infer<typeof partnerListSchema>) {
  const where = query.requestId ? { id: query.requestId } : query.status === 'all' ? {} : { status: query.status };
  const [requests, total, pending] = await Promise.all([
    db.partnerRequest.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 20, skip: (query.page - 1) * 20,
      include: { user: { select: { id: true, fullName: true, phone: true, role: true, isActive: true } } } }),
    db.partnerRequest.count({ where }), db.partnerRequest.count({ where: { status: 'PENDING' } }),
  ]);
  return { requests, total, pending, page: query.page, pageSize: 20 };
}

export async function reviewPartnerRequest(admin: SessionUser, id: string, input: z.infer<typeof partnerReviewSchema>) {
  const request = await db.$transaction(async (tx) => {
    const current = await tx.partnerRequest.findUnique({ where: { id }, include: { user: { select: { role: true, isActive: true } } } });
    if (!current) throw ApiError.notFound('درخواست یافت نشد');
    if (current.status !== 'PENDING') throw new ApiError(409, 'ALREADY_REVIEWED', 'این درخواست قبلاً بررسی شده است');
    if (!current.user.isActive || current.user.role !== 'USER') throw new ApiError(409, 'USER_CHANGED', 'وضعیت یا نقش کاربر تغییر کرده؛ ابتدا حساب را بررسی کنید');
    const result = await tx.partnerRequest.updateMany({ where: { id, status: 'PENDING' }, data: {
      status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', reviewNote: input.reviewNote || null,
      reviewedAt: new Date(), reviewedById: admin.id,
    } });
    if (!result.count) throw new ApiError(409, 'ALREADY_REVIEWED', 'این درخواست قبلاً بررسی شده است');
    if (input.decision === 'APPROVE') await tx.user.update({ where: { id: current.userId }, data: { role: 'PARTNER' } });
    return { id, userId: current.userId };
  });
  void notifyInbox(request.userId, { type: 'SYSTEM',
    title: input.decision === 'APPROVE' ? 'درخواست همکاری شما تأیید شد' : 'درخواست همکاری شما تأیید نشد',
    body: input.decision === 'APPROVE' ? 'حساب شما همکار شد و اکنون قیمت‌های عمده را می‌بینید' : input.reviewNote!, url: '/?account=partner',
  });
  return { request };
}
