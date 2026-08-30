/**
 * QA report contract (US-10.1).
 * FE imports types + rate-limit constants; Zod validation stays server-side.
 * Check classification is code-only — see lib/qa/check-catalog.ts (BUILD).
 */
import { z } from "zod";

import { GENERIC_AVATAR_NOT_OWNER_CHECK_KEY } from "@/lib/contracts/qa";
import { QA_CHECK_SEVERITY } from "@/lib/qa/check-classes";
import type { ReelBudgetPreview } from "@/lib/contracts/cost-policy";

export { GENERIC_AVATAR_NOT_OWNER_CHECK_KEY };

export const QA_RUN_AGENT_KEY = "qa_run" as const;
export const QA_RATE_WINDOW_MS = 60 * 60 * 1000;
export const QA_MAX_JOBS_PER_WINDOW = 5;
export const QA_IN_FLIGHT_TIMEOUT_MS = 5 * 60 * 1000;
export const QA_EVIDENCE_DETAIL_MAX_CHARS = 500 as const;

export const QA_CHECK_KEYS = [
  "own_avatar_consent",
  "generic_avatar_not_owner",
  "cta_presence",
  "dangerous_claims",
  "tone",
  "clarity",
  "ai_disclosure",
] as const;

export type QaCheckKey = (typeof QA_CHECK_KEYS)[number];

export const qaCheckKeySchema = z.enum(QA_CHECK_KEYS);

export const QA_BLOCKING_CHECK_KEYS = [
  "own_avatar_consent",
  "generic_avatar_not_owner",
] as const satisfies readonly QaCheckKey[];

export const QA_OVERRIDABLE_CHECK_KEYS = [
  "dangerous_claims",
  "tone",
  "clarity",
  "ai_disclosure",
  "cta_presence",
] as const satisfies readonly QaCheckKey[];

export const QA_DETERMINISTIC_CHECK_KEYS = [
  "own_avatar_consent",
  "generic_avatar_not_owner",
  "cta_presence",
] as const satisfies readonly QaCheckKey[];

export const QA_LLM_CHECK_KEYS = [
  "dangerous_claims",
  "tone",
  "clarity",
  "ai_disclosure",
] as const satisfies readonly QaCheckKey[];

export const qaCheckSeveritySchema = z.enum([
  QA_CHECK_SEVERITY.blocking,
  QA_CHECK_SEVERITY.overridable,
]);

export type QaCheckSeverity = z.infer<typeof qaCheckSeveritySchema>;

export const qaCheckOutcomeStatusSchema = z.enum(["pass", "fail", "skipped"]);

export type QaCheckOutcomeStatus = z.infer<typeof qaCheckOutcomeStatusSchema>;

export const qaReportStatusSchema = z.enum([
  "pending",
  "running",
  "passed",
  "failed",
  "blocked",
]);

export type QaReportStatus = z.infer<typeof qaReportStatusSchema>;

export const qaCheckEvidenceSchema = z
  .object({
    messageKey: z.string().min(1).max(200).optional(),
    detail: z.string().max(QA_EVIDENCE_DETAIL_MAX_CHARS).optional(),
  })
  .strict();

export type QaCheckEvidence = z.infer<typeof qaCheckEvidenceSchema>;

export const qaCheckResultSchema = z
  .object({
    checkKey: qaCheckKeySchema,
    status: qaCheckOutcomeStatusSchema,
    severity: qaCheckSeveritySchema,
    evidence: qaCheckEvidenceSchema.optional(),
  })
  .strict();

export type QaCheckResult = z.infer<typeof qaCheckResultSchema>;

/** LLM agent subset — no severity; server overwrites from catalog. */
export const qaLlmCheckResultSchema = z
  .object({
    checkKey: z.enum(QA_LLM_CHECK_KEYS),
    status: z.enum(["pass", "fail"]),
    evidence: qaCheckEvidenceSchema.optional(),
  })
  .strict();

export type QaLlmCheckResult = z.infer<typeof qaLlmCheckResultSchema>;

export const qaLlmAgentOutputSchema = z
  .object({
    checks: z.array(qaLlmCheckResultSchema).max(QA_LLM_CHECK_KEYS.length),
  })
  .strict();

export type QaLlmAgentOutput = z.infer<typeof qaLlmAgentOutputSchema>;

export const FORBIDDEN_QA_RUN_AUTHORITY_KEYS = [
  "passed",
  "status",
  "checks",
  "severity",
  "checkKey",
  "check_key",
  "clientId",
  "client_id",
  "ready",
  "qaPassed",
  "qa_passed",
  "providerKey",
  "provider_key",
  "tier",
  "estimatedCostCents",
  "estimated_cost_cents",
  "skipBudgetCheck",
  "skip_budget_check",
  "override",
  "overrides",
  "blocking",
  "overridable",
  "brandingStatus",
  "branding_status",
  "force",
  "invokedBy",
  "invoked_by",
  "hook",
  "body",
  "cta",
  "caption",
  "scriptText",
  "script_text",
  "onScreenText",
  "on_screen_text",
  "voiceoverText",
  "voiceover_text",
  "mustDiscloseNotOwner",
  "modalidad",
] as const;

export const runQaForAssembledReelInputSchema = z
  .object({
    assembledReelId: z.string().uuid(),
  })
  .strict();

export type RunQaForAssembledReelInput = z.infer<
  typeof runQaForAssembledReelInputSchema
>;

/**
 * Terminal statuses for a completed run. When `idempotent: true` (in-flight
 * short-circuit), status may also be `running` | `pending` (FE soft ask).
 */
export const runQaForAssembledReelSuccessSchema = z
  .object({
    ok: z.literal(true),
    assembledReelId: z.string().uuid(),
    qaReportId: z.string().uuid(),
    status: z.enum(["passed", "failed", "blocked", "running", "pending"]),
    checks: z.array(qaCheckResultSchema),
    idempotent: z.boolean().optional(),
  })
  .strict();

export type RunQaForAssembledReelSuccess = z.infer<
  typeof runQaForAssembledReelSuccessSchema
>;

export const qaReportErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN_FIELDS",
  "ASSEMBLY_NOT_READY",
  "BRANDING_REQUIRED",
  "CAPTION_REQUIRED",
  "SCRIPT_NOT_FOUND",
  "RATE_LIMITED",
  "GENERATION_IN_FLIGHT",
  "BUDGET_EXCEEDED",
  "COST_POLICY_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "QA_OUTPUT_INVALID",
  "INTERNAL_ERROR",
]);

export type QaReportErrorCode = z.infer<typeof qaReportErrorCodeSchema>;

export const qaReportErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: qaReportErrorCodeSchema,
      messageKey: z.string().optional(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
      previews: z.custom<ReelBudgetPreview[]>().optional(),
    })
    .strict(),
});

export type QaReportMutationError = z.infer<typeof qaReportErrorEnvelopeSchema>;

export type RunQaForAssembledReelResult =
  | RunQaForAssembledReelSuccess
  | QaReportMutationError;

export const qaInvokerSchema = z.enum(["operator", "system"]);

export type QaInvoker = z.infer<typeof qaInvokerSchema>;

export const operatorQaReportSummaryDtoSchema = z
  .object({
    qaReportId: z.string().uuid(),
    assembledReelId: z.string().uuid(),
    status: qaReportStatusSchema,
    hasBlockingFailures: z.boolean(),
    hasOverridableFailures: z.boolean(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type OperatorQaReportSummaryDto = z.infer<
  typeof operatorQaReportSummaryDtoSchema
>;

export const operatorQaReportDetailDtoSchema = z
  .object({
    qaReportId: z.string().uuid(),
    assembledReelId: z.string().uuid(),
    status: qaReportStatusSchema,
    checks: z.array(qaCheckResultSchema),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type OperatorQaReportDetailDto = z.infer<
  typeof operatorQaReportDetailDtoSchema
>;

/** Week-load map keyed by assembledReelId (= assembly jobId). Detail includes checks[]. */
export const operatorQaReportsByAssembledReelMapSchema = z.record(
  z.string().uuid(),
  operatorQaReportDetailDtoSchema.nullable(),
);

export type OperatorQaReportsByAssembledReelMap = z.infer<
  typeof operatorQaReportsByAssembledReelMapSchema
>;

export const qaGateStatusSchema = z
  .object({
    ready: z.boolean(),
    status: qaReportStatusSchema.nullable(),
    hasBlockingFailures: z.boolean(),
    hasOverridableFailures: z.boolean(),
    qaReportId: z.string().uuid().nullable(),
  })
  .strict();

export type QaGateStatus = z.infer<typeof qaGateStatusSchema>;

/** Pure status derivation — server-only authority; FE may mirror for badges. */
export function deriveQaReportStatus(
  checks: readonly QaCheckResult[],
): "passed" | "failed" | "blocked" {
  let hasBlockingFail = false;
  let hasOverridableFail = false;
  for (const check of checks) {
    if (check.status !== "fail") continue;
    if (check.severity === QA_CHECK_SEVERITY.blocking) {
      hasBlockingFail = true;
    } else {
      hasOverridableFail = true;
    }
  }
  if (hasBlockingFail) return "blocked";
  if (hasOverridableFail) return "failed";
  return "passed";
}

export function catalogSeverityForCheckKey(
  checkKey: QaCheckKey,
): QaCheckSeverity {
  if (
    (QA_BLOCKING_CHECK_KEYS as readonly string[]).includes(checkKey)
  ) {
    return QA_CHECK_SEVERITY.blocking;
  }
  return QA_CHECK_SEVERITY.overridable;
}

export function isQaReportReadyPhaseA(
  status: QaReportStatus | null | undefined,
): boolean {
  return status === "passed";
}
