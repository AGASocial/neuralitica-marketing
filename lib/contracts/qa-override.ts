/**
 * QA override contract (US-10.2).
 * FE imports types + rate-limit / forbidden-key constants; Zod validation stays server-side.
 * Catalog severity authority remains lib/qa/check-catalog.ts — never trust body severity.
 */
import { z } from "zod";

import {
  OVERRIDE_REASON_MAX_LENGTH,
  OVERRIDE_REASON_MIN_LENGTH,
} from "@/lib/contracts/cost-policy";
import {
  operatorQaOverrideDtoSchema,
  operatorQaReportDetailDtoSchema,
  qaCheckKeySchema,
  type QaCheckKey,
  type QaCheckResult,
  type QaReportStatus,
  type OperatorQaOverrideDto,
} from "@/lib/contracts/qa-report";

export {
  OVERRIDE_REASON_MAX_LENGTH,
  OVERRIDE_REASON_MIN_LENGTH,
  operatorQaOverrideDtoSchema,
};

export type { OperatorQaOverrideDto };

export const QA_OVERRIDE_AGENT_KEY = "qa_override" as const;
export const QA_OVERRIDE_RATE_WINDOW_MS = 60 * 60 * 1000;
export const QA_OVERRIDE_MAX_PER_WINDOW = 20;

export const FORBIDDEN_QA_OVERRIDE_AUTHORITY_KEYS = [
  "overrideAll",
  "override_all",
  "overrides",
  "ready",
  "passed",
  "qaPassed",
  "qa_passed",
  "status",
  "checks",
  "severity",
  "blocking",
  "overridable",
  "clientId",
  "client_id",
  "assembledReelId",
  "assembled_reel_id",
  "operatorClientId",
  "operator_client_id",
  "operator_id",
  "userId",
  "user_id",
  "force",
  "skipCatalogCheck",
  "skip_catalog_check",
  "override",
  "reportStatus",
  "report_status",
] as const;

export type ForbiddenQaOverrideAuthorityKey =
  (typeof FORBIDDEN_QA_OVERRIDE_AUTHORITY_KEYS)[number];

export const overrideQaCheckInputSchema = z
  .object({
    qaReportId: z.string().uuid(),
    checkKey: qaCheckKeySchema,
    reason: z
      .string()
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .min(OVERRIDE_REASON_MIN_LENGTH)
          .max(OVERRIDE_REASON_MAX_LENGTH),
      ),
  })
  .strict();

export type OverrideQaCheckInput = z.infer<typeof overrideQaCheckInputSchema>;

export const overrideQaCheckSuccessSchema = z
  .object({
    ok: z.literal(true),
    qaReportId: z.string().uuid(),
    assembledReelId: z.string().uuid(),
    checkKey: qaCheckKeySchema,
    overrideId: z.string().uuid(),
    status: z.enum(["pending", "running", "passed", "failed", "blocked"]),
    overrides: z.array(operatorQaOverrideDtoSchema),
    report: operatorQaReportDetailDtoSchema,
  })
  .strict();

export type OverrideQaCheckSuccess = z.infer<typeof overrideQaCheckSuccessSchema>;

export const qaOverrideErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN_FIELDS",
  "CHECK_BLOCKING",
  "CHECK_NOT_FAILED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

export type QaOverrideErrorCode = z.infer<typeof qaOverrideErrorCodeSchema>;

export const qaOverrideErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: qaOverrideErrorCodeSchema,
      messageKey: z.string().optional(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
    })
    .strict(),
});

export type QaOverrideMutationError = z.infer<typeof qaOverrideErrorEnvelopeSchema>;

export type OverrideQaCheckResult =
  | OverrideQaCheckSuccess
  | QaOverrideMutationError;

/**
 * Pure gate readiness with overrides (US-10.2).
 * Replaces Phase A `isQaReportReadyPhaseA` for the gate helper.
 */
export function computeUncoveredFailedOverridableKeys(input: {
  checks: readonly QaCheckResult[];
  overriddenCheckKeys: readonly string[];
}): string[] {
  const covered = new Set(input.overriddenCheckKeys);
  const uncovered: string[] = [];
  for (const check of input.checks) {
    if (check.status !== "fail") continue;
    if (check.severity !== "overridable") continue;
    if (!covered.has(check.checkKey)) {
      uncovered.push(check.checkKey);
    }
  }
  return uncovered;
}

export function computeQaGateReady(input: {
  status: QaReportStatus | null | undefined;
  checks: readonly QaCheckResult[];
  overriddenCheckKeys: readonly string[];
  hasBlockingFailures: boolean;
}): boolean {
  if (input.status === "passed") return true;
  if (input.status !== "failed") return false;
  if (input.hasBlockingFailures) return false;
  return (
    computeUncoveredFailedOverridableKeys({
      checks: input.checks,
      overriddenCheckKeys: input.overriddenCheckKeys,
    }).length === 0
  );
}

/** Alias for BUILD docs / tests. */
export function isQaReportReadyWithOverrides(input: {
  status: QaReportStatus | null | undefined;
  checks: readonly QaCheckResult[];
  overriddenCheckKeys: readonly string[];
  hasBlockingFailures: boolean;
}): boolean {
  return computeQaGateReady(input);
}

export type { QaCheckKey };
