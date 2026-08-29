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
