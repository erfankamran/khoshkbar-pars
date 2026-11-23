import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/lib/rbac';
import { handleError, ok } from '@/server/lib/api';
import { getShippingLabel } from '@/server/services/shipping-label.service';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const admin = await requireAdmin(req);
    const code = z.string().regex(/^PARS-\d{8}-[A-Z2-9]{4}$/).parse((await params).code);
    return ok(await getShippingLabel(admin, code), { 'Cache-Control': 'private, no-store' });
  } catch (error) { return handleError(error); }
}
