import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/lib/rbac';
import { handleError, ok, readJson } from '@/server/lib/api';
import { getPartnerRequest, submitPartnerRequest } from '@/server/services/partner.service';
import { partnerRequestSchema } from '@/server/validators/partner.schema';

export const dynamic = 'force-dynamic';
const PRIVATE = { 'Cache-Control': 'private, no-store' };
export async function GET(req: NextRequest) {
  try { return ok(await getPartnerRequest(await requireUser(req)), PRIVATE); }
  catch (error) { return handleError(error); }
}
export async function POST(req: NextRequest) {
  try { return ok(await submitPartnerRequest(await requireUser(req), partnerRequestSchema.parse(await readJson(req))), PRIVATE); }
  catch (error) { return handleError(error); }
}
