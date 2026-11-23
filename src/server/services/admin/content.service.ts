import { revalidateStoreCache, CACHE_TAGS } from '@/server/lib/cache-tags';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import {
  badgeCreateSchema,
  badgeUpdateSchema,
  contactCreateSchema,
  contactUpdateSchema,
  faqCreateSchema,
  faqUpdateSchema,
  footerLinkCreateSchema,
  footerLinkUpdateSchema,
  pageCreateSchema,
  pageUpdateSchema,
} from '@/server/validators/admin.schema';
import type { z } from 'zod';

/**
 * محتوای مستقل فروشگاه (فاز ۳) — CRUD چهار بخش:
 *   پرسش‌های متداول / شماره‌های تماس / نمادهای اعتماد / لینک‌های فوتر
 *
 * تصمیم معماری تأییدشده: این داده‌ها چرخه مدیریت مستقل دارند و
 * هرگز در جدول Setting ذخیره نمی‌شوند — هر بخش جدول خودش را دارد.
 * الگو همان CRUD بنرها است: whitelist zod + ترتیب نمایش با sortOrder.
 */

type FaqCreateInput = z.infer<typeof faqCreateSchema>;
type FaqUpdateInput = z.infer<typeof faqUpdateSchema>;
type ContactCreateInput = z.infer<typeof contactCreateSchema>;
type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
type BadgeCreateInput = z.infer<typeof badgeCreateSchema>;
type BadgeUpdateInput = z.infer<typeof badgeUpdateSchema>;
type FooterLinkCreateInput = z.infer<typeof footerLinkCreateSchema>;
type FooterLinkUpdateInput = z.infer<typeof footerLinkUpdateSchema>;

// ——— پرسش‌های متداول ———

/** فهرست همه پرسش‌ها به ترتیب نمایش — Expected queries: ۱ */
export async function listAdminFaq() {
  const faq = await db.faqItem.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return { faq };
}

export async function createAdminFaq(input: FaqCreateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const item = await db.faqItem.create({
    data: {
      question: input.question,
      answer: input.answer,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  return { item };
}

export async function updateAdminFaq(id: string, input: FaqUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.faqItem.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('پرسش یافت نشد');
  const item = await db.faqItem.update({
    where: { id },
    data: {
      ...(input.question !== undefined ? { question: input.question } : {}),
      ...(input.answer !== undefined ? { answer: input.answer } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return { item };
}

export async function deleteAdminFaq(id: string) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.faqItem.findUnique({
    where: { id },
    select: { id: true, question: true },
  });
  if (!existing) throw ApiError.notFound('پرسش یافت نشد');
  await db.faqItem.delete({ where: { id } });
  return { deleted: existing.question };
}

// ——— شماره‌های تماس ———

export async function listAdminContacts() {
  const contacts = await db.contactNumber.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return { contacts };
}

export async function createAdminContact(input: ContactCreateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const contact = await db.contactNumber.create({
    data: {
      label: input.label,
      phone: input.phone,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  return { contact };
}

export async function updateAdminContact(id: string, input: ContactUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.contactNumber.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('شماره تماس یافت نشد');
  const contact = await db.contactNumber.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return { contact };
}

export async function deleteAdminContact(id: string) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.contactNumber.findUnique({
    where: { id },
    select: { id: true, label: true },
  });
  if (!existing) throw ApiError.notFound('شماره تماس یافت نشد');
  await db.contactNumber.delete({ where: { id } });
  return { deleted: existing.label };
}

// ——— نمادهای اعتماد ———

export async function listAdminBadges() {
  const badges = await db.trustBadge.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return { badges };
}

export async function createAdminBadge(input: BadgeCreateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const badge = await db.trustBadge.create({
    data: {
      title: input.title,
      imageUrl: input.imageUrl,
      linkUrl: input.linkUrl ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  return { badge };
}

export async function updateAdminBadge(id: string, input: BadgeUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.trustBadge.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('نماد یافت نشد');
  const badge = await db.trustBadge.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return { badge };
}

export async function deleteAdminBadge(id: string) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.trustBadge.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!existing) throw ApiError.notFound('نماد یافت نشد');
  await db.trustBadge.delete({ where: { id } });
  return { deleted: existing.title };
}

// ——— لینک‌های فوتر ———

export async function listAdminFooterLinks() {
  const links = await db.footerLink.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return { links };
}

export async function createAdminFooterLink(input: FooterLinkCreateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const link = await db.footerLink.create({
    data: {
      title: input.title,
      url: input.url,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  return { link };
}

export async function updateAdminFooterLink(id: string, input: FooterLinkUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.footerLink.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('لینک یافت نشد');
  const link = await db.footerLink.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return { link };
}

export async function deleteAdminFooterLink(id: string) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.footerLink.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!existing) throw ApiError.notFound('لینک یافت نشد');
  await db.footerLink.delete({ where: { id } });
  return { deleted: existing.title };
}

// ——— صفحات اختصاصی (درخواست کاربر) — قوانین و شرایط و ... ———

type PageCreateInput = z.infer<typeof pageCreateSchema>;
type PageUpdateInput = z.infer<typeof pageUpdateSchema>;

/** فهرست همه صفحات به ترتیب نمایش — Expected queries: ۱ */
export async function listAdminPages() {
  const pages = await db.contentPage.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return { pages };
}

/** ایجاد صفحه — خطای تکراری‌بودن slug → 409 — با پشتیبانی بلوک‌های صفحه‌ساز */
export async function createAdminPage(input: PageCreateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const dup = await db.contentPage.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (dup) throw new ApiError(409, 'SLUG_TAKEN', 'شناسه صفحه قبلاً استفاده شده — شناسه دیگری انتخاب کنید');
  const page = await db.contentPage.create({
    data: {
      slug: input.slug,
      title: input.title,
      body: input.body ?? '',
      editorMode: input.editorMode,
      // بلوک‌ها به JSON رشته‌ای — حالت مارک‌داون → null
      blocks: input.editorMode === 'blocks' && input.blocks?.length
        ? JSON.stringify(input.blocks)
        : null,
      isActive: input.isActive,
      showInFooter: input.showInFooter,
      sortOrder: input.sortOrder,
    },
  });
  return { page };
}

/** ویرایش صفحه — اگر slug تغییر کند یکتایی بررسی می‌شود */
export async function updateAdminPage(id: string, input: PageUpdateInput) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.contentPage.findUnique({ where: { id }, select: { id: true, slug: true } });
  if (!existing) throw ApiError.notFound('صفحه یافت نشد');
  if (input.slug !== undefined && input.slug !== existing.slug) {
    const dup = await db.contentPage.findUnique({ where: { slug: input.slug }, select: { id: true } });
    if (dup) throw new ApiError(409, 'SLUG_TAKEN', 'شناسه صفحه قبلاً استفاده شده — شناسه دیگری انتخاب کنید');
  }
  const page = await db.contentPage.update({
    where: { id },
    data: {
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.editorMode !== undefined ? { editorMode: input.editorMode } : {}),
      ...(input.blocks !== undefined
        ? {
            // حالت بلوک‌ها → JSON رشته‌ای؛ مارک‌داون/خالی → null
            blocks:
              input.editorMode !== 'markdown' && input.blocks?.length
                ? JSON.stringify(input.blocks)
                : null,
          }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.showInFooter !== undefined ? { showInFooter: input.showInFooter } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  return { page };
}

/** حذف صفحه */
export async function deleteAdminPage(id: string) {
  revalidateStoreCache(CACHE_TAGS.CONTENT);

  const existing = await db.contentPage.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!existing) throw ApiError.notFound('صفحه یافت نشد');
  await db.contentPage.delete({ where: { id } });
  return { deleted: existing.title };
}
