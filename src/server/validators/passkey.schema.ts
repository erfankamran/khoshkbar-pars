import { z } from 'zod';

/**
 * اعتبارسنجی ورودی WebAuthn (فاز Passkey)
 *
 * بدنهٔ پاسخ مرورگر ساختار استاندارد JSON دارد (RegistrationResponseJSON /
 * AuthenticationResponseJSON) — اینجا ساختار کلی و نوع‌ها سخت‌گیرانه چک می‌شود
 * تا هرگز به کتابخانهٔ تأیید، دادهٔ خراب نرسد. تأیید رمزنگاشتی خودش در
 * @simplewebauthn/server انجام می‌شود.
 */

const b64urlSchema = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[A-Za-z0-9_-]+$/, 'مقدار base64url معتبر نیست');

const clientDataJSONSchema = z.object({
  type: z.string().min(1).max(64),
  challenge: b64urlSchema,
  origin: z.string().url().max(300),
  crossOrigin: z.boolean().optional(),
});

const attestationObjectSchema = z.object({
  fmt: z.string().max(40).optional(),
  attStmt: z.record(z.string(), z.unknown()).optional(),
  authData: z.string().min(1).optional(),
});

/** POST /api/auth/passkeys/register/verify */
export const passkeyRegisterVerifySchema = z.object({
  id: b64urlSchema,
  rawId: b64urlSchema,
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: b64urlSchema,
    attestationObject: b64urlSchema,
    transports: z.array(z.string().max(20)).max(10).optional(),
  }),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
});
export type PasskeyRegisterVerifyInput = z.infer<typeof passkeyRegisterVerifySchema>;

/** POST /api/auth/passkeys/login/verify */
export const passkeyLoginVerifySchema = z.object({
  id: b64urlSchema,
  rawId: b64urlSchema,
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: b64urlSchema,
    authenticatorData: b64urlSchema,
    signature: b64urlSchema,
    userHandle: b64urlSchema.optional().nullable(),
  }),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
});
export type PasskeyLoginVerifyInput = z.infer<typeof passkeyLoginVerifySchema>;

/** POST /api/auth/passkeys/login/options — شماره اختیاری برای محدودکردن کلیدهای مجاز */
export const passkeyLoginOptionsSchema = z.object({
  phone: z
    .string()
    .min(4)
    .max(20)
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      // نرمال‌سازی همان OTP — ارقام فارسی و +98 پذیرفته می‌شود
      // (چرخهٔ کامل در سرویس انجام می‌شود تا خطاها فارسی باشند)
      return v.trim();
    }),
});
export type PasskeyLoginOptionsInput = z.infer<typeof passkeyLoginOptionsSchema>;
