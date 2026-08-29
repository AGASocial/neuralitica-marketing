/**
 * Consentimiento de avatar contract (US-3.2).
 * FE imports types only; Zod validation stays server-side on grant/revoke.
 * Technical tokens are code/DB only — never primary UI headlines.
 */
import { z } from "zod";

/** FE-safe echo of the disclosure version string (server constant is authoritative). */
export const AVATAR_CONSENT_DISCLOSURE_V1 = "AVATAR_CONSENT_DISCLOSURE_V1" as const;

export type AvatarConsentDisclosureVersion =
  typeof AVATAR_CONSENT_DISCLOSURE_V1;

export const avatarConsentActiveViewSchema = z
  .object({
    active: z.literal(true),
    consentedAt: z.string().datetime({ offset: true }),
    consentVersion: z.string().min(1),
    currentConsentVersion: z.literal(AVATAR_CONSENT_DISCLOSURE_V1),
    preferenciasMayStillListOwnAvatar: z.boolean().optional(),
  })
  .strict();

export const avatarConsentInactiveViewSchema = z
  .object({
    active: z.literal(false),
    consentedAt: z.null(),
    consentVersion: z.null(),
    currentConsentVersion: z.literal(AVATAR_CONSENT_DISCLOSURE_V1),
    reason: z
      .enum(["none", "revoked", "version_mismatch", "load_failed"])
      .optional(),
    preferenciasMayStillListOwnAvatar: z.boolean().optional(),
  })
  .strict();

export type AvatarConsentForClientResult =
  | z.infer<typeof avatarConsentActiveViewSchema>
  | z.infer<typeof avatarConsentInactiveViewSchema>;

export const grantAvatarConsentInputSchema = z
  .object({
    affirmed: z.literal(true),
    consentVersion: z.literal(AVATAR_CONSENT_DISCLOSURE_V1),
  })
  .strict();

export type GrantAvatarConsentInput = z.infer<
  typeof grantAvatarConsentInputSchema
>;

export const grantAvatarConsentSuccessSchema = z
  .object({
    ok: z.literal(true),
    active: z.literal(true),
    consentedAt: z.string().datetime({ offset: true }),
    consentVersion: z.literal(AVATAR_CONSENT_DISCLOSURE_V1),
  })
  .strict();

export const grantAvatarConsentErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "CONSENT_VERSION_MISMATCH",
  "AFFIRMATION_REQUIRED",
  "ALREADY_ACTIVE",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export type GrantAvatarConsentErrorCode = z.infer<
  typeof grantAvatarConsentErrorCodeSchema
>;

export const grantAvatarConsentErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: grantAvatarConsentErrorCodeSchema,
      fields: z.record(z.string(), z.array(z.string())).optional(),
      messageKey: z.string().optional(),
    })
    .strict(),
});

export type GrantAvatarConsentResult =
  | z.infer<typeof grantAvatarConsentSuccessSchema>
  | z.infer<typeof grantAvatarConsentErrorEnvelopeSchema>;

export const revokeAvatarConsentSuccessSchema = z
  .object({
    ok: z.literal(true),
    active: z.literal(false),
    revokedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const revokeAvatarConsentErrorCodeSchema = z.enum([
  "NOT_ACTIVE",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export type RevokeAvatarConsentErrorCode = z.infer<
  typeof revokeAvatarConsentErrorCodeSchema
>;

export const revokeAvatarConsentErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: revokeAvatarConsentErrorCodeSchema,
      messageKey: z.string().optional(),
    })
    .strict(),
});

export type RevokeAvatarConsentResult =
  | z.infer<typeof revokeAvatarConsentSuccessSchema>
  | z.infer<typeof revokeAvatarConsentErrorEnvelopeSchema>;

export type AssertActiveAvatarConsentForJobsResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code:
          | "OWN_AVATAR_CONSENT_REQUIRED"
          | "UNAUTHENTICATED"
          | "INTERNAL_ERROR";
        messageKey?: string;
      };
    };
