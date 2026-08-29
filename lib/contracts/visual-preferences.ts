/**
 * Preferencias de producción visual contract (US-3.1).
 * FE imports types only; Zod validation stays server-side on upsert.
 * Technical enums are code/DB only — never primary UI headlines.
 */
import { z } from "zod";

export const visualModalitySchema = z.enum([
  "own_avatar",
  "generic_avatar",
  "faceless",
]);

export type VisualModality = z.infer<typeof visualModalitySchema>;

export const facelessStyleSchema = z
  .object({
    voice: z.enum(["none", "ai_voiceover", "music_only"]),
    onScreenText: z.enum(["none", "captions", "headline_and_captions"]),
    broll: z.enum(["stock", "product_led", "mixed"]),
  })
  .strict();

export type FacelessStyle = z.infer<typeof facelessStyleSchema>;

/** Cap for faceless_style jsonb UTF-8 size (CONTRACT ≤ 4 KiB). */
export const FACELESS_STYLE_MAX_UTF8_BYTES = 4096;

/** Default faceless axes when Cliente enables Video sin rostro. */
export const FACELESS_STYLE_DEFAULT: FacelessStyle = {
  voice: "ai_voiceover",
  onScreenText: "captions",
  broll: "stock",
};

export const visualPreferencesRulesSchema = z
  .object({
    must_disclose_not_owner: z.boolean(),
  })
  .strict();

export type VisualPreferencesRules = z.infer<
  typeof visualPreferencesRulesSchema
>;

export const visualPreferencesViewExistsSchema = z
  .object({
    exists: z.literal(true),
    allowedModes: z.array(visualModalitySchema).max(3),
    facelessStyle: facelessStyleSchema.nullable(),
    genericAvatarId: z.null(),
    rules: visualPreferencesRulesSchema,
    updatedAt: z.string().datetime({ offset: true }),
    ownAvatarConsentActive: z.boolean(),
  })
  .strict();

export type VisualPreferencesViewExists = z.infer<
  typeof visualPreferencesViewExistsSchema
>;

export const visualPreferencesViewMissingSchema = z
  .object({
    exists: z.literal(false),
    allowedModes: z.array(visualModalitySchema).length(0),
    facelessStyle: z.null(),
    genericAvatarId: z.null(),
    rules: z.null(),
    updatedAt: z.null(),
    ownAvatarConsentActive: z.boolean(),
  })
  .strict();

export type VisualPreferencesViewMissing = z.infer<
  typeof visualPreferencesViewMissingSchema
>;

export const visualPreferencesViewLoadFailedSchema = z
  .object({
    exists: z.literal(false),
    loadFailed: z.literal(true),
    ownAvatarConsentActive: z.boolean().optional(),
  })
  .strict();

export type VisualPreferencesViewLoadFailed = z.infer<
  typeof visualPreferencesViewLoadFailedSchema
>;

export type VisualPreferencesForClientResult =
  | VisualPreferencesViewExists
  | VisualPreferencesViewMissing
  | VisualPreferencesViewLoadFailed;

export const upsertVisualPreferencesInputSchema = z
  .object({
    allowedModes: z
      .array(visualModalitySchema)
      .max(3)
      .superRefine((arr, ctx) => {
        const unique = new Set(arr);
        if (unique.size !== arr.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Duplicate modalities are not allowed",
            path: ["allowedModes"],
          });
        }
      }),
    facelessStyle: facelessStyleSchema.nullable().optional(),
    genericAvatarId: z.null().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasFaceless = val.allowedModes.includes("faceless");
    if (hasFaceless) {
      if (val.facelessStyle == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "facelessStyle is required when faceless is selected",
          path: ["facelessStyle"],
        });
      }
    } else if (val.facelessStyle != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "facelessStyle must be null when faceless is not selected",
        path: ["facelessStyle"],
      });
    }
  });

export type UpsertVisualPreferencesInput = z.infer<
  typeof upsertVisualPreferencesInputSchema
>;

export const upsertVisualPreferencesSuccessSchema = z
  .object({
    ok: z.literal(true),
    allowedModes: z.array(visualModalitySchema).max(3),
    facelessStyle: facelessStyleSchema.nullable(),
    genericAvatarId: z.null(),
    rules: visualPreferencesRulesSchema,
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type UpsertVisualPreferencesSuccess = z.infer<
  typeof upsertVisualPreferencesSuccessSchema
>;

export const upsertVisualPreferencesErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "PAYLOAD_TOO_LARGE",
  "FORBIDDEN_FIELDS",
  "OWN_AVATAR_CONSENT_REQUIRED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export type UpsertVisualPreferencesErrorCode = z.infer<
  typeof upsertVisualPreferencesErrorCodeSchema
>;

export const upsertVisualPreferencesErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: upsertVisualPreferencesErrorCodeSchema,
      fields: z.record(z.string(), z.array(z.string())).optional(),
      messageKey: z.string().optional(),
    })
    .strict(),
});

export type UpsertVisualPreferencesErrorEnvelope = z.infer<
  typeof upsertVisualPreferencesErrorEnvelopeSchema
>;

export const upsertVisualPreferencesResultSchema = z.discriminatedUnion("ok", [
  upsertVisualPreferencesSuccessSchema,
  upsertVisualPreferencesErrorEnvelopeSchema,
]);

export type UpsertVisualPreferencesResult = z.infer<
  typeof upsertVisualPreferencesResultSchema
>;

/** Soft agent summary shape (US-2.3 / US-3.4) — allowlist + disclosure flag; omit consent. */
export const visualModeSummarySchema = z
  .object({
    allowedModes: z.array(visualModalitySchema).max(3),
    mustDiscloseNotOwner: z.boolean(),
  })
  .strict();

export type VisualModeSummary = z.infer<typeof visualModeSummarySchema>;
