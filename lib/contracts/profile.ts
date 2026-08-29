/**
 * Living profile / Ficha viva view + edit contract (US-2.1 / US-2.2 / US-2.3).
 * FE imports types only; validation stays server-side.
 * Agent DTO types are distinct from Cliente view types (US-2.3).
 */
import { z } from "zod";

import {
  interviewAnswersCompleteSchema,
  type InterviewAnswersComplete,
} from "@/lib/contracts/interview";

/** Ficha viva fields jsonb — 1:1 with complete interview answers (V1). */
export type BusinessProfileFields = InterviewAnswersComplete;

/** Trusted job-context clientId for getBusinessProfileForAgents. */
export const agentClientIdSchema = z.string().uuid();

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
 * Minimal Ficha viva projection for trusted server agents / orchestration (US-2.3).
 * Distinct from BusinessProfileView / BusinessProfileForClientResult.
 */
export const businessProfileForAgentsViewSchema = z
  .object({
    exists: z.literal(true),
    /** Echo of trusted arg — server-only DTO; never client-bundled */
    clientId: z.string().uuid(),
    /** Required positive int for agent traceability (US-2.2 bumps) */
    version: z.number().int().positive(),
    fields: interviewAnswersCompleteSchema,
    /**
     * Preferencias / Modalidad de producción summary — stub until US-3.x.
     * Key MUST be present; value MUST be null in this story.
     */
    visualModeSummary: z.null(),
    /** Optional ISO timestamptz freshness */
    updatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type BusinessProfileForAgentsView = z.infer<
  typeof businessProfileForAgentsViewSchema
>;

export const businessProfileForAgentsMissingSchema = z
  .object({
    exists: z.literal(false),
  })
  .strict();

export type BusinessProfileForAgentsMissing = z.infer<
  typeof businessProfileForAgentsMissingSchema
>;

/**
 * Soft load / corrupt failure — distinct from bare missing.
 * Do not invent fields; do not add foreign-tenant oracle codes.
 */
export const businessProfileForAgentsLoadFailedSchema = z
  .object({
    exists: z.literal(false),
    loadFailed: z.literal(true),
  })
  .strict();

export type BusinessProfileForAgentsLoadFailed = z.infer<
  typeof businessProfileForAgentsLoadFailedSchema
>;

export type BusinessProfileForAgentsResult =
  | BusinessProfileForAgentsView
  | BusinessProfileForAgentsMissing
  | BusinessProfileForAgentsLoadFailed;

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
