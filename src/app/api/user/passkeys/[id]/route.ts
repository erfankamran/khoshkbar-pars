import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/lib/rbac';
import { deleteMyPasskey } from '@/server/services/passkey.service';
import { handleError, ok } from '@/server/lib/api';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/user/passkeys/[id] — حذف کلید Passkey
 * حذف آخرین کلید حساب را قفل نمی‌کند: ورود با OTP همیشه فعال است
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    return ok(await deleteMyPasskey(user.id, id, req));
  } catch (e) {
    return handleError(e);
  }
}
