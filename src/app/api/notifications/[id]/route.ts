import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/server/lib/auth';
import { ApiError, handleError, ok } from '@/server/lib/api';
import { deleteNotification } from '@/server/services/notification-center.service';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'برای حذف اعلان وارد حساب شوید');
    const id = z.string().min(1).max(128).parse((await params).id);
    return ok(await deleteNotification(user, id));
  } catch (e) {
    return handleError(e);
  }
}
