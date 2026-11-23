import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { updateAdminOrder } from '@/server/services/admin/orders.service';
import {
  applyAdminOrderAction,
  getAdminOrderDetail,
} from '@/server/services/admin/orders-admin.service';
import { handleError, ok, readJson } from '@/server/lib/api';
import { orderUpdateSchema } from '@/server/validators/admin.schema';
import { adminOrderActionSchema } from '@/server/validators/admin/order-admin.schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/orders/[id] — جزئیات کامل سفارش
 * DTO تخت AdminOrderDetailDTO — هم‌قرارداد با صفحهٔ جزئیات پنل (فاز ۱۱.۳)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    return ok(await getAdminOrderDetail(id));
  } catch (e) {
    return handleError(e);
  }
}

/**
 * PATCH /api/admin/orders/[id] — دو مسیر:
 * ۱) اکشن صریح ({ action: 'SHIP' | 'MARK_PAID' | ... }) — صفحهٔ جزئیات پنل
 *    (فاز ۱۱.۳) — گذار گارددار + حسابرسی + اعلان مشتری
 * ۲) ست خام ({ status, trackingCode, adminNote }) — دیالوگ فهرست سفارش‌ها
 *
 * پیش‌تر بدنهٔ { action } با orderUpdateSchema بی‌صدا به {} تبدیل می‌شد و
 * اقدام مدیر «با موفقیت» اما بدون اثر ثبت می‌شد — با مسیر اکشن صریح ترمیم شد.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const raw = await readJson(req);
    if (raw && typeof raw === 'object' && 'action' in raw) {
      const admin = await requireAdmin(req);
      const input = adminOrderActionSchema.parse(raw);
      return ok(await applyAdminOrderAction(admin, req, id, input));
    }
    await requireAdmin(req);
    const body = orderUpdateSchema.parse(raw);
    return ok(await updateAdminOrder(id, body));
  } catch (e) {
    return handleError(e);
  }
}
