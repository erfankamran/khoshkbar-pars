import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/server/lib/rbac';
import { handleError, ok, parseQuery } from '@/server/lib/api';
import { listPartnerRequests } from '@/server/services/partner.service';
import { partnerListSchema } from '@/server/validators/partner.schema';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return ok(await listPartnerRequests(parseQuery(partnerListSchema, req.nextUrl.searchParams)), { 'Cache-Control': 'private, no-store' });
  } catch (error) { return handleError(error); }
}
