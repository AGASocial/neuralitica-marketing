/**
 * Living profile / Ficha viva view + edit contract (US-2.1 / US-2.2).
 * FE imports types only; validation stays server-side.
 */
import { z } from "zod";

import {
  interviewAnswersCompleteSchema,
  type InterviewAnswersComplete,
} from "@/lib/contracts/interview";

/** Ficha viva fields jsonb — 1:1 with complete interview answers (V1). */
export type BusinessProfileFields = InterviewAnswersComplete;

export const businessProfileViewSchema = z
  .object({
    exists: z.literal(true),
    fields: interviewAnswersCompleteSchema,
    updatedAt: z.string().datetime({ offset: true }).optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();

export type BusinessProfileView = z.infer<typeof businessProfileViewSchema>;

export const businessProfileMissingSchema = z
  .object({
    exists: z.literal(false),
  })
  .strict();

export type BusinessProfileMissing = z.infer<typeof businessProfileMissingSchema>;

/**
 * Soft load failure — same UX class as dashboard interview loadFailed.
 * Do not distinguish foreign-tenant cases (no foreign-id surface).
 */
export const businessProfileLoadFailedSchema = z
  .object({
    exists: z.literal(false),
    loadFailed: z.literal(true),
  })
  .strict();

export type BusinessProfileLoadFailed = z.infer<
  typeof businessProfileLoadFailedSchema
>;

export type BusinessProfileForClientResult =
  | BusinessProfileView
  | BusinessProfileMissing
  | BusinessProfileLoadFailed;

/**
 * Full seven-key replace (US-2.2). Reuse interviewAnswersCompleteSchema (.strict()).
 * FE submits merged complete snapshot even if UI edited one section.
 */
export const updateBusinessProfileInputSchema = interviewAnswersCompleteSchema;
export type UpdateBusinessProfileInput = BusinessProfileFields;

export const updateBusinessProfileSuccessSchema = z
  .object({
    ok: z.literal(true),
    /** Full seven sections after persist — FE may sync local form state */
    fields: interviewAnswersCompleteSchema,
    /** Bumped integer for agent traceability */
    version: z.number().int().positive(),
    /** ISO timestamptz — LWW visible signal after save */
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type UpdateBusinessProfileSuccess = z.infer<
  typeof updateBusinessProfileSuccessSchema
>;

/**
 * Error codes — extend interview/auth style.
 * PROFILE_NOT_FOUND is US-2.2–specific (no create-via-PATCH).
 */
export const updateBusinessProfileErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "PAYLOAD_TOO_LARGE",
  "FORBIDDEN_FIELDS",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "PROFILE_NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
]);

export type UpdateBusinessProfileErrorCode = z.infer<
  typeof updateBusinessProfileErrorCodeSchema
>;

export const updateBusinessProfileErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: updateBusinessProfileErrorCodeSchema,
      /** Per-field paths when VALIDATION_ERROR (Zod issues) */
      fields: z.record(z.string(), z.array(z.string())).optional(),
      messageKey: z.string().optional(),
    })
    .strict(),
});

export type UpdateBusinessProfileErrorEnvelope = z.infer<
  typeof updateBusinessProfileErrorEnvelopeSchema
>;

export const updateBusinessProfileResultSchema = z.discriminatedUnion("ok", [
  updateBusinessProfileSuccessSchema,
  updateBusinessProfileErrorEnvelopeSchema,
]);

export type UpdateBusinessProfileResult = z.infer<
  typeof updateBusinessProfileResultSchema
>;
