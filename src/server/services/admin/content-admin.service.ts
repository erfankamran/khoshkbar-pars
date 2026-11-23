import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import { logAdminAction, type AdminUser } from '@/server/lib/rbac';
import type {
  AdminBannerCreate,
  AdminBannerUpdate,
  AdminSettingsUpdate,
  AdminStoryCreate,
  AdminStoryUpdate,
  SettingKey,
} from '@/server/validators/admin/content-admin.schema';
import { SETTING_KEYS } from '@/server/validators/admin/content-admin.schema';

/**
 * سرویس مدیریت محتوا (فاز ۱۱.۵) — بنرها، استوری‌ها، تنظیمات فروشگاه
 *
 * قواعد:
 * - هر نوشتن با logAdminAction ردپای حسابرسی می‌گیرد (ADMIN_ACTION)
 * - تغییرات بلافاصله در API عمومی (/api/banners و /api/stories و /api/settings
 *   و صفحه اصلی) منعکس می‌شود — این جداول همان منبع حقیقت صفحه اصلی‌اند
 * - لینک‌ها به‌صورت linkParams (شیء) از کلاینت می‌آیند و به JSON رشته‌ای ذخیره
 *   می‌شوند — قرینهٔ خواندن در content.service
 * - 404 برای شناسه ناموجود؛ پیام‌ها فارسی
 */

// ------------------------------------------------------------
// DTO ها
// ------------------------------------------------------------

export interface AdminBannerDTO {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkView: string | null;
  linkParams: Record<string, string>;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface AdminStoryDTO {
  id: string;
  groupKey: string;
  groupTitle: string;
  thumbUrl: string;
  mediaType: string;
  mediaUrl: string;
  caption: string | null;
  linkView: string | null;
  linkParams: Record<string, string>;
  expiresAt: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface AdminSettingsDTO {
  settings: Array<{
    key: SettingKey;
    value: string | number | boolean;
    description: string | null;
    updatedAt: string;
  }>;
}

// ------------------------------------------------------------
// کمکی — تبدیل linkParams شیء ↔ JSON رشته‌ای
// ------------------------------------------------------------

function paramsToJson(params: Record<string, string> | null | undefined): string | null {
  if (!params || Object.keys(params).length === 0) return null;
  return JSON.stringify(params);
}

function jsonToParams(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (x): x is [string, string] => typeof x[1] === 'string'
        )
      );
    }
  } catch {
    /* params خراب → خالی، UI نمی‌شکند */
  }
  return {};
}

// ------------------------------------------------------------
// بنرها — Expected queries: خواندن ۱، هر نوشتن ۱ + لاگ
// ------------------------------------------------------------

export async function listAdminBanners(): Promise<{ items: AdminBannerDTO[] }> {
  const rows = await db.banner.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return {
    items: rows.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      linkView: b.linkView,
      linkParams: jsonToParams(b.linkParams),
      sortOrder: b.sortOrder,
      isActive: b.isActive,
      createdAt: b.createdAt.toISOString(),
    })),
  };
}

export async function createAdminBanner(
  admin: AdminUser,
  req: NextRequest,
  input: AdminBannerCreate
): Promise<AdminBannerDTO> {
  const banner = await db.banner.create({
    data: {
      title: input.title,
      subtitle: input.subtitle ?? null,
      imageUrl: input.imageUrl,
      linkView: input.linkView === 'none' ? null : input.linkView,
      linkParams: paramsToJson(input.linkParams),
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  await logAdminAction(req, admin, 'BANNER_CREATE', {
    id: banner.id,
    title: banner.title,
    active: banner.isActive,
  });
  return {
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle,
    imageUrl: banner.imageUrl,
    linkView: banner.linkView,
    linkParams: jsonToParams(banner.linkParams),
    sortOrder: banner.sortOrder,
    isActive: banner.isActive,
    createdAt: banner.createdAt.toISOString(),
  };
}

export async function updateAdminBanner(
  admin: AdminUser,
  req: NextRequest,
  id: string,
  input: AdminBannerUpdate
): Promise<AdminBannerDTO> {
  const existing = await db.banner.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('بنر یافت نشد');

  const banner = await db.banner.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.subtitle !== undefined && { subtitle: input.subtitle }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(input.linkView !== undefined && { linkView: input.linkView === 'none' ? null : input.linkView }),
      ...(input.linkParams !== undefined && { linkParams: paramsToJson(input.linkParams) }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
  await logAdminAction(req, admin, 'BANNER_UPDATE', { id, active: banner.isActive });
  return {
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle,
    imageUrl: banner.imageUrl,
    linkView: banner.linkView,
    linkParams: jsonToParams(banner.linkParams),
    sortOrder: banner.sortOrder,
    isActive: banner.isActive,
    createdAt: banner.createdAt.toISOString(),
  };
}

export async function deleteAdminBanner(
  admin: AdminUser,
  req: NextRequest,
  id: string
): Promise<{ deleted: true }> {
  try {
    await db.banner.delete({ where: { id }, select: { id: true } });
  } catch {
    throw ApiError.notFound('بنر یافت نشد');
  }
  await logAdminAction(req, admin, 'BANNER_DELETE', { id });
  return { deleted: true };
}

// ------------------------------------------------------------
// استوری‌ها — Expected queries: خواندن ۱، هر نوشتن ۱ + لاگ
// ------------------------------------------------------------

export async function listAdminStories(): Promise<{
  items: AdminStoryDTO[];
  groups: Array<{ groupKey: string; groupTitle: string; count: number }>;
}> {
  const rows = await db.story.findMany({
    orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  const groups = new Map<string, { groupKey: string; groupTitle: string; count: number }>();
  const items = rows.map((s) => {
    const g = groups.get(s.groupKey);
    if (g) g.count += 1;
    else groups.set(s.groupKey, { groupKey: s.groupKey, groupTitle: s.groupTitle, count: 1 });
    return {
      id: s.id,
      groupKey: s.groupKey,
      groupTitle: s.groupTitle,
      thumbUrl: s.thumbUrl,
      mediaType: s.mediaType,
      mediaUrl: s.mediaUrl,
      caption: s.caption,
      linkView: s.linkView,
      linkParams: jsonToParams(s.linkParams),
      expiresAt: s.expiresAt?.toISOString() ?? null,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
    };
  });

  return { items, groups: Array.from(groups.values()) };
}

export async function createAdminStory(
  admin: AdminUser,
  req: NextRequest,
  input: AdminStoryCreate
): Promise<AdminStoryDTO> {
  const story = await db.story.create({
    data: {
      groupKey: input.groupKey,
      groupTitle: input.groupTitle,
      thumbUrl: input.thumbUrl,
      mediaType: input.mediaType,
      mediaUrl: input.mediaUrl,
      caption: input.caption ?? null,
      linkView: input.linkView === 'none' ? null : input.linkView,
      linkParams: paramsToJson(input.linkParams),
      expiresAt: input.expiresAt,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  await logAdminAction(req, admin, 'STORY_CREATE', {
    id: story.id,
    groupKey: story.groupKey,
    active: story.isActive,
  });
  return {
    id: story.id,
    groupKey: story.groupKey,
    groupTitle: story.groupTitle,
    thumbUrl: story.thumbUrl,
    mediaType: story.mediaType,
    mediaUrl: story.mediaUrl,
    caption: story.caption,
    linkView: story.linkView,
    linkParams: jsonToParams(story.linkParams),
    expiresAt: story.expiresAt?.toISOString() ?? null,
    sortOrder: story.sortOrder,
    isActive: story.isActive,
    createdAt: story.createdAt.toISOString(),
  };
}

export async function updateAdminStory(
  admin: AdminUser,
  req: NextRequest,
  id: string,
  input: AdminStoryUpdate
): Promise<AdminStoryDTO> {
  const existing = await db.story.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('استوری یافت نشد');

  const story = await db.story.update({
    where: { id },
    data: {
      ...(input.groupKey !== undefined && { groupKey: input.groupKey }),
      ...(input.groupTitle !== undefined && { groupTitle: input.groupTitle }),
      ...(input.thumbUrl !== undefined && { thumbUrl: input.thumbUrl }),
      ...(input.mediaType !== undefined && { mediaType: input.mediaType }),
      ...(input.mediaUrl !== undefined && { mediaUrl: input.mediaUrl }),
      ...(input.caption !== undefined && { caption: input.caption }),
      ...(input.linkView !== undefined && { linkView: input.linkView === 'none' ? null : input.linkView }),
      ...(input.linkParams !== undefined && { linkParams: paramsToJson(input.linkParams) }),
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
  await logAdminAction(req, admin, 'STORY_UPDATE', { id, active: story.isActive });
  return {
    id: story.id,
    groupKey: story.groupKey,
    groupTitle: story.groupTitle,
    thumbUrl: story.thumbUrl,
    mediaType: story.mediaType,
    mediaUrl: story.mediaUrl,
    caption: story.caption,
    linkView: story.linkView,
    linkParams: jsonToParams(story.linkParams),
    expiresAt: story.expiresAt?.toISOString() ?? null,
    sortOrder: story.sortOrder,
    isActive: story.isActive,
    createdAt: story.createdAt.toISOString(),
  };
}

export async function deleteAdminStory(
  admin: AdminUser,
  req: NextRequest,
  id: string
): Promise<{ deleted: true }> {
  try {
    await db.story.delete({ where: { id }, select: { id: true } });
  } catch {
    throw ApiError.notFound('استوری یافت نشد');
  }
  await logAdminAction(req, admin, 'STORY_DELETE', { id });
  return { deleted: true };
}

// ------------------------------------------------------------
// تنظیمات فروشگاه — Expected queries: خواندن ۱، ذخیره ۱ تراکنش
// ------------------------------------------------------------

export async function getAdminSettings(): Promise<AdminSettingsDTO> {
  const rows = await db.setting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const settings = SETTING_KEYS.map((key) => {
    const row = byKey.get(key);
    const raw = row?.value ?? '';
    let value: string | number | boolean = raw;
    if (raw === 'true' || raw === 'false') value = raw === 'true';
    else {
      const asNum = Number(raw);
      if (raw.trim() !== '' && !Number.isNaN(asNum)) value = asNum;
    }
    return {
      key,
      value,
      description: row?.description ?? null,
      updatedAt: (row?.updatedAt ?? new Date(0)).toISOString(),
    };
  });

  return { settings };
}

const SETTING_DESCRIPTIONS: Record<SettingKey, string> = {
  freeShippingThresholdToman: 'سقف خرید ارسال رایگان (تومان)',
  deliveryFeeToman: 'هزینه ارسال عادی (تومان)',
  minOrderToman: 'حداقل مبلغ سفارش (تومان)',
  storeOpen: 'فروشگاه باز است (توقف موقت ثبت سفارش)',
  supportPhone: 'تلفن پشتیبانی',
};

export async function updateAdminSettings(
  admin: AdminUser,
  req: NextRequest,
  input: AdminSettingsUpdate
): Promise<AdminSettingsDTO> {
  // هر کلید فقط در صورت ارسال به‌روزرسانی می‌شود — upsert در یک تراکنش
  const entries: Array<{ key: SettingKey; value: string }> = [];
  if (input.freeShippingThresholdToman !== undefined)
    entries.push({ key: 'freeShippingThresholdToman', value: String(input.freeShippingThresholdToman) });
  if (input.deliveryFeeToman !== undefined)
    entries.push({ key: 'deliveryFeeToman', value: String(input.deliveryFeeToman) });
  if (input.minOrderToman !== undefined)
    entries.push({ key: 'minOrderToman', value: String(input.minOrderToman) });
  if (input.storeOpen !== undefined)
    entries.push({ key: 'storeOpen', value: String(input.storeOpen) });
  if (input.supportPhone !== undefined)
    entries.push({ key: 'supportPhone', value: input.supportPhone });

  await db.$transaction(
    entries.map((e) =>
      db.setting.upsert({
        where: { key: e.key },
        create: { key: e.key, value: e.value, description: SETTING_DESCRIPTIONS[e.key] },
        update: { value: e.value },
      })
    )
  );

  await logAdminAction(req, admin, 'SETTINGS_UPDATE', {
    keys: entries.map((e) => e.key),
  });

  return getAdminSettings();
}
