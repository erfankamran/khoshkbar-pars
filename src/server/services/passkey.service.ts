import { db } from '@/lib/db';
import { ApiError } from '@/server/lib/api';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  challengeBelongsTo,
  clientDataOriginAllowed,
  consumeChallenge,
  expectedOriginsFromRequest,
  friendlyDeviceName,
  rpIDFromRequest,
  storeChallenge,
} from '@/server/lib/webauthn';
import { createUserSession, getActiveUserForLogin } from '@/server/services/auth.service';
import { securityLog } from '@/server/services/auth.service';
import { requestIp } from '@/server/lib/auth';
import { BRAND } from '@/lib/config';
import type { NextRequest } from 'next/server';
import type { PasskeyLoginVerifyInput, PasskeyRegisterVerifyInput } from '@/server/validators/passkey.schema';

/**
 * Passkey / WebAuthn (فاز احراز هویت مدرن) — کتابخانهٔ استاندارد @simplewebauthn
 *
 * جریان ثبت: options (احراز هویت‌شده) → مرورگر credentials.create → verify
 * جریان ورود: options (شماره اختیاری) → مرورگر credentials.get → verify → نشست
 *
 * امنیت (بخش ۹ مگاپروژه):
 *  - Challenge یک‌بارمصرف با انقضای ۵ دقیقه + قفل به کاربر در ثبت (webauthn.ts)
 *  - Origin و RP ID دقیقاً از درخواست استخراج و در verify مقایسه می‌شوند
 *  - شمارندهٔ امضا برای تشخیص کلون (Replay) — bookkeeping در PasskeyCredential
 *  - Credential Substitution: پاسخ ورود باید به credentialId واقعی کاربر بخورد
 *    و userHandle (اگر هست) با userId همان credential یکی باشد
 *  - کلید خصوصی و اطلاعات بیومتریک هرگز به سرور نمی‌رسند — فقط کلید عمومی
 *  - حذف آخرین Passkey حساب را قفل نمی‌کند: OTP همیشه روش جایگزین فعال است
 */

const RP_NAME = BRAND.fullName;

// ——— DTOها ———

export interface PasskeyDTO {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
  /** multi-device = کلید همگام‌شونده (Google Password Manager / iCloud) */
  deviceType: string;
}

export interface PasskeyRegisterOptionsDTO {
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
}

export interface PasskeyLoginOptionsDTO {
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
}

// ——— ثبت Passkey ———

/**
 * POST /api/auth/passkeys/register/options — ساخت challenge ثبت
 * کاربر باید با OTP وارد شده باشد (requireUser در route)
 * Expected queries: کلیدهای قبلی ۱
 */
export async function createPasskeyRegisterOptions(
  userId: string,
  req: NextRequest
): Promise<PasskeyRegisterOptionsDTO> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, fullName: true, firstName: true, lastName: true },
  });
  if (!user) throw ApiError.notFound('کاربر یافت نشد');

  const existing = await db.passkeyCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  // challenge را خود کتابخانه می‌سازد و همان مقدار در دیتابیس قفل به کاربر ذخیره می‌شود
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpIDFromRequest(req),
    // userName = شماره موبایل — شناسهٔ پایدار کاربر
    userName: user.phone,
    userID: Buffer.from(user.id, 'utf8'),
    userDisplayName:
      user.fullName?.trim() ||
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      'کاربر جدید',
    attestationType: 'none',
    // جلوگیری از ثبت دوبارهٔ همان کلید
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (JSON.parse(c.transports) as string[]) : undefined,
    })),
    // residentKey preferred → امکان ورود بدون شماره (discoverable) وقتی پشتیبانی شود
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  await storeChallenge(options.challenge, user.id);

  return { options };
}

/**
 * POST /api/auth/passkeys/register/verify — تأیید ثبت کلید عمومی جدید
 * Expected queries: challenge(حافظه) + کلید تکراری ۱ + درج ۱ + لاگ ۱
 */
export async function verifyPasskeyRegistration(
  userId: string,
  input: PasskeyRegisterVerifyInput,
  req: NextRequest
): Promise<{ passkey: PasskeyDTO }> {
  const rpID = rpIDFromRequest(req);

  // ۱) مصرف یک‌بارمصرف challenge — باید به همین کاربر قفل باشد
  const clientData = JSON.parse(
    Buffer.from(input.response.clientDataJSON, 'base64url').toString('utf8')
  ) as { challenge?: string; origin?: string };
  if (!clientData.challenge) {
    throw new ApiError(400, 'VALIDATION', 'پاسخ WebAuthn فاقد challenge است');
  }
  const consumed = await consumeChallenge(clientData.challenge);
  if (!challengeBelongsTo(consumed, userId)) {
    await securityLog('PASSKEY_REGISTER_REJECTED', {
      userId,
      ip: requestIp(req),
      meta: JSON.stringify({ reason: 'challenge-owner-mismatch' }),
    });
    throw new ApiError(400, 'VALIDATION', 'challenge مربوط به حساب شما نیست');
  }

  // ۲) تأیید رمزنگاشتی کامل — امضا، Origin، RP ID، نوع دستگاه
  // کاندیدهای origin: مقدار محاسبه‌شده از هدرها + origin واقعی مرورگر
  // (در صورت تعلق به RP — مرورگر خودش rp.id را روی origin اعمال کرده است)
  const expectedOrigins = [...expectedOriginsFromRequest(req)];
  if (clientData.origin && clientDataOriginAllowed(clientData.origin, rpID)) {
    expectedOrigins.push(clientData.origin);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input as unknown as RegistrationResponseJSON,
      expectedChallenge: consumed.challenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      requireUserVerification: false, // preferred — PIN/بایومتریک اختیاری می‌ماند
    });
  } catch (err) {
    await securityLog('PASSKEY_REGISTER_REJECTED', {
      userId,
      ip: requestIp(req),
      meta: JSON.stringify({
        reason: 'verification-failed',
        detail: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
        browserOrigin: clientData.origin ?? null,
        expectedOrigins,
      }),
    });
    throw new ApiError(400, 'VALIDATION', 'تأیید ثبت Passkey ناموفق بود');
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw new ApiError(400, 'VALIDATION', 'تأیید ثبت Passkey ناموفق بود');
  }

  const info = verification.registrationInfo;
  const credentialId = info.credential.id;

  // ۳) همان کلید قبلاً ثبت نشده باشد (credential substitution)
  const dup = await db.passkeyCredential.findUnique({
    where: { credentialId },
    select: { id: true, userId: true },
  });
  if (dup) {
    throw new ApiError(
      409,
      'CONFLICT',
      'این روش ورود قبلاً ثبت شده است'
    );
  }

  // ۴) ذخیرهٔ کلید عمومی — کلید خصوصی هرگز از مرورگر خارج نمی‌شود
  const created = await db.passkeyCredential.create({
    data: {
      userId,
      credentialId,
      publicKey: Buffer.from(info.credential.publicKey).toString('base64'),
      signCount: info.credential.counter,
      transports: info.credential.transports
        ? JSON.stringify(info.credential.transports)
        : null,
      deviceName: friendlyDeviceName(req.headers.get('user-agent') ?? undefined),
      aaguid: info.aaguid,
      backupEligible: info.credentialDeviceType === 'multiDevice',
      backupState: info.credentialBackedUp,
      // residentKey preferred: multiDevice همیشه discoverable است؛ singleDevice با
      // residentKey هم قابل کشف می‌شود — در ورود بدون شماره امتحان می‌کنیم
      discoverable: true,
    },
    select: { id: true, deviceName: true, createdAt: true, backupState: true, backupEligible: true },
  });

  await securityLog('PASSKEY_REGISTERED', {
    userId,
    ip: requestIp(req),
    meta: JSON.stringify({ deviceType: info.credentialDeviceType }),
  });

  return {
    passkey: {
      id: created.id,
      deviceName: created.deviceName,
      createdAt: created.createdAt.toISOString(),
      lastUsedAt: null,
      backedUp: created.backupState,
      deviceType: created.backupEligible ? 'multiDevice' : 'singleDevice',
    },
  };
}

// ——— ورود با Passkey ———

/**
 * POST /api/auth/passkeys/login/options
 * phone اختیاری: با شماره → فقط کلیدهای همان کاربر (بدون افشای وجود حساب —
 * هر دو حالت خالی، options استاندارد می‌دهند)؛ بدون شماره → discoverable
 * Expected queries: ۰ یا ۱
 */
export async function createPasskeyLoginOptions(
  phone: string | undefined,
  req: NextRequest
): Promise<PasskeyLoginOptionsDTO> {
  let allowCredentials: Array<{ id: string; transports?: string[] }> | undefined;

  if (phone) {
    const user = await db.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (user) {
      const keys = await db.passkeyCredential.findMany({
        where: { userId: user.id },
        select: { credentialId: true, transports: true },
      });
      if (keys.length > 0) {
        allowCredentials = keys.map((k) => ({
          id: k.credentialId,
          transports: k.transports ? (JSON.parse(k.transports) as string[]) : undefined,
        }));
      }
    }
    // کاربر/کلید پیدا نشد → allowCredentials نمی‌دهیم؛ رفتار یکسان (بدون افشا)
  }

  // challenge ورود را کتابخانه می‌سازد — در دیتابیس با انقضا ثبت می‌شود
  const options = await generateAuthenticationOptions({
    rpID: rpIDFromRequest(req),
    ...(allowCredentials ? { allowCredentials } : {}),
    userVerification: 'preferred',
    timeout: 60_000,
  });
  await storeChallenge(options.challenge);

  return { options };
}

/**
 * POST /api/auth/passkeys/login/verify — تأیید امضا و ساخت نشست
 * Expected queries: credential ۱ + کاربر ۱ + counter ۱ + جریان نشست ~۸
 */
export async function verifyPasskeyLogin(
  input: PasskeyLoginVerifyInput,
  req: NextRequest
): Promise<ReturnType<typeof createUserSession>> {
  const now = new Date();
  const ip = requestIp(req);
  const userAgent = req.headers.get('user-agent') ?? undefined;

  // ۱) مصرف یک‌بارمصرف challenge
  const clientData = JSON.parse(
    Buffer.from(input.response.clientDataJSON, 'base64url').toString('utf8')
  ) as { challenge?: string; origin?: string };
  if (!clientData.challenge) {
    throw new ApiError(400, 'VALIDATION', 'پاسخ WebAuthn فاقد challenge است');
  }
  const consumed = await consumeChallenge(clientData.challenge);

  // ۲) پیدا کردن credential — فقط کلیدهای ثبت‌شدهٔ این RP می‌توانند امضا کنند
  const credential = await db.passkeyCredential.findUnique({
    where: { credentialId: input.id },
    select: {
      id: true,
      userId: true,
      credentialId: true,
      publicKey: true,
      signCount: true,
      transports: true,
    },
  });
  if (!credential) {
    await securityLog('PASSKEY_LOGIN_FAIL', {
      ip,
      meta: JSON.stringify({ reason: 'unknown-credential' }),
    });
    throw new ApiError(401, 'UNAUTHENTICATED', 'این روش ورود شناخته نشد');
  }

  // ۳) userHandle باید با کاربرِ credential یکی باشد (جلوگیری از Credential Substitution)
  if (input.response.userHandle) {
    const handle = Buffer.from(input.response.userHandle, 'base64url').toString('utf8');
    if (handle !== credential.userId) {
      await securityLog('PASSKEY_LOGIN_FAIL', {
        userId: credential.userId,
        ip,
        meta: JSON.stringify({ reason: 'user-handle-mismatch' }),
      });
      throw new ApiError(401, 'UNAUTHENTICATED', 'این روش ورود شناخته نشد');
    }
  }

  // ۴) تأیید رمزنگاشتی امضا + Origin + RP ID + شمارندهٔ امضا (Replay/Clone)
  const rpID = rpIDFromRequest(req);
  const expectedOrigins = [...expectedOriginsFromRequest(req)];
  if (clientData.origin && clientDataOriginAllowed(clientData.origin, rpID)) {
    expectedOrigins.push(clientData.origin);
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input as unknown as AuthenticationResponseJSON,
      expectedChallenge: consumed.challenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64')),
        counter: credential.signCount,
        transports: credential.transports
          ? (JSON.parse(credential.transports) as string[])
          : undefined,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    await securityLog('PASSKEY_LOGIN_FAIL', {
      userId: credential.userId,
      ip,
      meta: JSON.stringify({
        reason: 'verification-failed',
        detail: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
        browserOrigin: clientData.origin ?? null,
        expectedOrigins,
      }),
    });
    throw new ApiError(401, 'UNAUTHENTICATED', 'تأیید ورود با Passkey ناموفق بود');
  }

  if (!verification.verified) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'تأیید ورود با Passkey ناموفق بود');
  }

  // ۵) کاربر فعال + bookkeeping شمارنده
  const user = await getActiveUserForLogin(credential.userId);
  await db.passkeyCredential
    .update({
      where: { id: credential.id },
      data: {
        signCount: verification.authenticationInfo.newCounter,
        lastUsedAt: now,
        backupEligible: verification.authenticationInfo.credentialDeviceType === 'multiDevice',
        backupState: verification.authenticationInfo.credentialBackedUp,
      },
    })
    .catch(() => undefined);

  // ۶) نشست جدید — همان جریان ورود OTP (ادغام سبد + کوکی HttpOnly)
  return createUserSession(user, req, { now, ip, userAgent, method: 'passkey' });
}

// ——— مدیریت Passkeyها ———

/** GET /api/user/passkeys — کلیدهای کاربر جاری — Expected queries: ۱ */
export async function listMyPasskeys(userId: string): Promise<{ passkeys: PasskeyDTO[] }> {
  const passkeys = await db.passkeyCredential.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      deviceName: true,
      createdAt: true,
      lastUsedAt: true,
      backupState: true,
      backupEligible: true,
    },
  });
  return {
    passkeys: passkeys.map((p) => ({
      id: p.id,
      deviceName: p.deviceName,
      createdAt: p.createdAt.toISOString(),
      lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
      backedUp: p.backupState,
      deviceType: p.backupEligible ? 'multiDevice' : 'singleDevice',
    })),
  };
}

/**
 * DELETE /api/user/passkeys/[id] — حذف کلید
 * حساب هرگز قفل نمی‌شود: OTP همیشه روش جایگزین فعال است (بخش ۶ مگاپروژه)
 */
export async function deleteMyPasskey(
  userId: string,
  id: string,
  req: NextRequest
): Promise<{ deleted: boolean }> {
  const existing = await db.passkeyCredential.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('روش ورود یافت نشد');

  await db.passkeyCredential.delete({ where: { id } });
  await securityLog('PASSKEY_DELETED', { userId, ip: requestIp(req) });
  return { deleted: true };
}
