/**
 * Interview contract types and Zod schemas (US-1.1 Entrevista inicial).
 * FE imports types only; persist validation stays server-side.
 */
import { z } from "zod";

/** App gate: UTF-8 bytes of JSON.stringify(merged answers). Oversize → PAYLOAD_TOO_LARGE. */
export const INTERVIEW_ANSWERS_MAX_UTF8_BYTES = 65536;

/** DB enum neuramark_interview_session_status — 1.1 writes draft only */
export const interviewSessionStatusSchema = z.enum(["draft", "completed"]);
export type InterviewSessionStatus = z.infer<typeof interviewSessionStatusSchema>;

/** DB enum neuramark_interview_step — storage keys, SPEC order */
export const interviewStepKeySchema = z.enum([
  "services",
  "zone",
  "tone",
  "offers",
  "objections",
  "style",
  "restrictions",
]);
export type InterviewStepKey = z.infer<typeof interviewStepKeySchema>;

export const INTERVIEW_STEP_ORDER: readonly InterviewStepKey[] = [
  "services",
  "zone",
  "tone",
  "offers",
  "objections",
  "style",
  "restrictions",
];

export const interviewErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "PAYLOAD_TOO_LARGE",
  "FORBIDDEN_FIELDS",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "CONFLICT",
  "INTERNAL_ERROR",
]);
export type InterviewErrorCode = z.infer<typeof interviewErrorCodeSchema>;

const itemStringSchema = z.string().trim().min(1).max(500);
const descriptionSchema = z.string().trim().min(1).max(2000);

export const interviewListStepSchema = z
  .object({
    items: z.array(itemStringSchema).min(1).max(20),
  })
  .strict();

/** restrictions: array required, empty allowed (“none”) */
export const interviewRestrictionsStepSchema = z
  .object({
    items: z.array(itemStringSchema).max(20),
  })
  .strict();

export const interviewTextStepSchema = z
  .object({
    description: descriptionSchema,
  })
  .strict();

export const interviewServicesStepSchema = interviewListStepSchema;
export const interviewOffersStepSchema = interviewListStepSchema;
export const interviewObjectionsStepSchema = interviewListStepSchema;
export const interviewZoneStepSchema = interviewTextStepSchema;
export const interviewToneStepSchema = interviewTextStepSchema;
export const interviewStyleStepSchema = interviewTextStepSchema;

export const interviewAnswersStoredSchema = z
  .object({
    services: interviewServicesStepSchema.optional(),
    zone: interviewZoneStepSchema.optional(),
    tone: interviewToneStepSchema.optional(),
    offers: interviewOffersStepSchema.optional(),
    objections: interviewObjectionsStepSchema.optional(),
    style: interviewStyleStepSchema.optional(),
    restrictions: interviewRestrictionsStepSchema.optional(),
  })
  .strict();
export type InterviewAnswers = z.infer<typeof interviewAnswersStoredSchema>;

export const persistInterviewDraftInputSchema = z
  .object({
    currentStep: interviewStepKeySchema,
    answers: interviewAnswersStoredSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!(value.currentStep in value.answers) || value.answers[value.currentStep] == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [value.currentStep],
        message: "required",
      });
    }
  });
export type PersistInterviewDraftInput = z.infer<
  typeof persistInterviewDraftInputSchema
>;

export const interviewDraftViewSchema = z.object({
  currentStep: interviewStepKeySchema,
  answers: interviewAnswersStoredSchema,
  status: interviewSessionStatusSchema,
});
export type InterviewDraftView = z.infer<typeof interviewDraftViewSchema>;

export const persistInterviewDraftSuccessSchema = z.object({
  ok: z.literal(true),
  draft: interviewDraftViewSchema,
});
export type PersistInterviewDraftSuccess = z.infer<
  typeof persistInterviewDraftSuccessSchema
>;

export const interviewFieldErrorsSchema = z.record(z.string(), z.array(z.string()));

export const interviewErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: interviewErrorCodeSchema,
    messageKey: z.string(),
    fields: interviewFieldErrorsSchema.optional(),
  }),
});
export type InterviewErrorEnvelope = z.infer<typeof interviewErrorEnvelopeSchema>;

export const persistInterviewDraftResultSchema = z.discriminatedUnion("ok", [
  persistInterviewDraftSuccessSchema,
  interviewErrorEnvelopeSchema,
]);
export type PersistInterviewDraftResult = z.infer<
  typeof persistInterviewDraftResultSchema
>;

/** Dashboard interview card — omit answers and session UUID (US-1.2) */
export const interviewDashboardSummarySchema = z
  .object({
    status: interviewSessionStatusSchema,
    currentStep: interviewStepKeySchema,
    hasProgress: z.boolean(),
  })
  .strict();

export type InterviewDashboardSummaryRow = z.infer<
  typeof interviewDashboardSummarySchema
>;

/** `null` = no row → not started (Start CTA) */
export type InterviewDashboardSummary = InterviewDashboardSummaryRow | null;

/**
 * Completeness at submit (US-1.3): all seven keys required.
 * Same caps / advance rules as US-1.1 per step; empty restrictions.items OK.
 */
export const interviewAnswersCompleteSchema = z
  .object({
    services: interviewServicesStepSchema,
    zone: interviewZoneStepSchema,
    tone: interviewToneStepSchema,
    offers: interviewOffersStepSchema,
    objections: interviewObjectionsStepSchema,
    style: interviewStyleStepSchema,
    restrictions: interviewRestrictionsStepSchema,
  })
  .strict();
export type InterviewAnswersComplete = z.infer<
  typeof interviewAnswersCompleteSchema
>;

/** Prefer `{}` or omit. Client answers are never SoT for submit (US-1.3). */
export const submitInterviewInputSchema = z.object({}).strict();
export type SubmitInterviewInput = z.infer<typeof submitInterviewInputSchema>;

export const submitInterviewSuccessSchema = z.object({
  ok: z.literal(true),
  /** false = first successful complete; true = idempotent re-submit */
  alreadyCompleted: z.boolean(),
  /** FE navigates here after success confirmation */
  redirectTo: z.literal("/profile"),
  /** Minimal — no raw fields dump (US-2.1 owns full render) */
  profile: z
    .object({
      exists: z.literal(true),
      version: z.number().int().positive(),
    })
    .strict(),
  /** Interview status after submit — always completed on ok: true */
  interview: z
    .object({
      status: z.literal("completed"),
    })
    .strict(),
});
export type SubmitInterviewSuccess = z.infer<typeof submitInterviewSuccessSchema>;

export const submitInterviewResultSchema = z.discriminatedUnion("ok", [
  submitInterviewSuccessSchema,
  interviewErrorEnvelopeSchema,
]);
export type SubmitInterviewResult = z.infer<typeof submitInterviewResultSchema>;

/** Ficha viva fields jsonb — 1:1 with complete interview answers (V1). */
export type BusinessProfileFields = InterviewAnswersComplete;

/** Stub `/profile` RSC summary (US-1.3) — no fields dump, no ids. */
export const profileStubSummarySchema = z
  .object({
    exists: z.boolean(),
    version: z.number().int().positive().nullable(),
  })
  .strict();
export type ProfileStubSummary = z.infer<typeof profileStubSummarySchema>;
