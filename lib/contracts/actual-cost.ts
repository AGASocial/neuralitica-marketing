/**
 * Actual cost tracking contract (US-7.3).
 * FE imports types and constants only; Zod validation stays server-side.
 */
import { z } from "zod";

import { reelSpendJobKindSchema } from "@/lib/contracts/cost-policy";
import { trendWeekStartSchema } from "@/lib/contracts/trend";

/** Prefer adapter-reported cents when strictly positive. */
export const ADAPTER_REPORTED_COST_MIN_CENTS = 1 as const;

/** Max length for unavailable-reason enum values in DB. */
export const ACTUAL_COST_UNAVAILABLE_REASON_MAX_LENGTH = 64 as const;

export const actualCostUnavailableReasonSchema = z.enum([
  "usage_missing",
  "catalog_cost_model_unsupported",
  "provider_no_billing",
]);

export type ActualCostUnavailableReason = z.infer<
  typeof actualCostUnavailableReasonSchema
>;

export const computeLlmActualCostInputSchema = z
  .object({
    providerKey: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    /** From validated llmCompletionResultSchema — never from request body. */
    adapterReportedCents: z.number().int().nonnegative(),
  })
  .strict();

export const computeLlmActualCostSuccessSchema = z
  .object({
    ok: z.literal(true),
    actualCostCents: z.number().int().nonnegative(),
  })
  .strict();

export const computeLlmActualCostFailureSchema = z
  .object({
    ok: z.literal(false),
    reason: actualCostUnavailableReasonSchema,
  })
  .strict();

export const computeLlmActualCostResultSchema = z.discriminatedUnion("ok", [
  computeLlmActualCostSuccessSchema,
  computeLlmActualCostFailureSchema,
]);

export const finalizeGenerationCostSyncInsertSchema = z
  .object({
    mode: z.literal("sync_insert"),
    clientId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    assetRole: z.enum(["llm", "tts", "talking_head", "broll"]),
    jobKind: reelSpendJobKindSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    operatorClientId: z.string().uuid(),
    providerKey: z.string().min(1),
    durationSec: z.number().positive().nullable().optional(),
    llmUsage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        adapterReportedCents: z.number().int().nonnegative(),
      })
      .optional(),
    /** Phase B manual upload — bypasses computeLlmActualCost. */
    manualActualCostCents: z.literal(0).optional(),
  })
  .strict();

export const finalizeGenerationCostAsyncUpdateSchema = z
  .object({
    mode: z.literal("async_update"),
    spendEventId: z.string().uuid(),
    clientId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    actualCostUnavailableReason: actualCostUnavailableReasonSchema.nullable(),
    durationSec: z.number().positive().nullable().optional(),
  })
  .strict();

export const finalizeGenerationCostInputSchema = z.discriminatedUnion("mode", [
  finalizeGenerationCostSyncInsertSchema,
  finalizeGenerationCostAsyncUpdateSchema,
]);

export const finalizeGenerationCostSuccessSchema = z
  .object({
    ok: z.literal(true),
    spendEventId: z.string().uuid(),
  })
  .strict();

export const finalizeGenerationCostErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "TENANT_MISMATCH",
  "NOT_FOUND",
  "ALREADY_FINALIZED",
]);

export const finalizeGenerationCostFailureSchema = z
  .object({
    ok: z.literal(false),
    code: finalizeGenerationCostErrorCodeSchema,
  })
  .strict();

export const finalizeGenerationCostResultSchema = z.discriminatedUnion("ok", [
  finalizeGenerationCostSuccessSchema,
  finalizeGenerationCostFailureSchema,
]);

export const updateReelSpendEventActualInputSchema = z
  .object({
    spendEventId: z.string().uuid(),
    clientId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    actualCostUnavailableReason: actualCostUnavailableReasonSchema.nullable().optional(),
    durationSec: z.number().positive().nullable().optional(),
  })
  .strict();

export const updateReelSpendEventActualSuccessSchema = z
  .object({
    ok: z.literal(true),
    spendEventId: z.string().uuid(),
    idempotent: z.boolean(),
  })
  .strict();

export const updateReelSpendEventActualErrorCodeSchema = z.enum([
  "NOT_FOUND",
  "TENANT_MISMATCH",
  "ALREADY_FINALIZED",
]);

export const updateReelSpendEventActualFailureSchema = z
  .object({
    ok: z.literal(false),
    code: updateReelSpendEventActualErrorCodeSchema,
  })
  .strict();

export const updateReelSpendEventActualResultSchema = z.discriminatedUnion("ok", [
  updateReelSpendEventActualSuccessSchema,
  updateReelSpendEventActualFailureSchema,
]);

export const getReelCostSummaryForWeekInputSchema = z
  .object({
    clientId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    slotReelScriptIds: z.array(
      z
        .object({
          slotIndex: z.number().int().min(0).max(6),
          reelScriptId: z.string().uuid().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const reelSlotCostSummarySchema = z
  .object({
    reelScriptId: z.string().uuid().nullable(),
    slotIndex: z.number().int().min(0).max(6),
    estimatedCostCents: z.number().int().nonnegative(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    hasPendingActual: z.boolean(),
    unavailableReasonKeys: z.array(actualCostUnavailableReasonSchema),
  })
  .strict();

export const reelWeekCostSummarySchema = z
  .object({
    weekStart: trendWeekStartSchema,
    clientId: z.string().uuid(),
    slots: z.array(reelSlotCostSummarySchema),
    weeklyEstimatedCostCents: z.number().int().nonnegative(),
    weeklyActualCostCents: z.number().int().nonnegative().nullable(),
    hasPartialActual: z.boolean(),
  })
  .strict();

export const operatorProductionJobCostStatusSchema = z.enum([
  "actual",
  "estimated_only",
  "pending",
  "unavailable",
]);

export const operatorProductionJobCostDtoSchema = z
  .object({
    jobId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    estimatedCostCents: z.number().int().nonnegative(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    costStatus: operatorProductionJobCostStatusSchema,
    unavailableReasonKey: actualCostUnavailableReasonSchema.optional(),
  })
  .strict();

export type ComputeLlmActualCostInput = z.infer<
  typeof computeLlmActualCostInputSchema
>;
export type ComputeLlmActualCostResult = z.infer<
  typeof computeLlmActualCostResultSchema
>;
export type FinalizeGenerationCostInput = z.infer<
  typeof finalizeGenerationCostInputSchema
>;
export type FinalizeGenerationCostResult = z.infer<
  typeof finalizeGenerationCostResultSchema
>;
export type UpdateReelSpendEventActualInput = z.infer<
  typeof updateReelSpendEventActualInputSchema
>;
export type UpdateReelSpendEventActualResult = z.infer<
  typeof updateReelSpendEventActualResultSchema
>;
export type GetReelCostSummaryForWeekInput = z.infer<
  typeof getReelCostSummaryForWeekInputSchema
>;
export type ReelSlotCostSummary = z.infer<typeof reelSlotCostSummarySchema>;
export type ReelWeekCostSummary = z.infer<typeof reelWeekCostSummarySchema>;
export type OperatorProductionJobCostStatus = z.infer<
  typeof operatorProductionJobCostStatusSchema
>;
export type OperatorProductionJobCostDto = z.infer<
  typeof operatorProductionJobCostDtoSchema
>;

// --- US-7.4 Reel cost roll-up (Operator-only) ---

export const reelCostRollupAssetRoleSchema = z.enum([
  "llm",
  "talking_head",
  "broll",
  "tts",
]);

export type ReelCostRollupAssetRole = z.infer<
  typeof reelCostRollupAssetRoleSchema
>;

export const reelCostRollupComponentSchema = z
  .object({
    assetRole: reelCostRollupAssetRoleSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    actualCostCents: z.number().int().nonnegative().nullable(),
    eventCount: z.number().int().nonnegative(),
    hasPendingActual: z.boolean(),
    unavailableReasonKeys: z.array(actualCostUnavailableReasonSchema),
  })
  .strict();

export const reelCostRollupDtoSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    eventScope: z.literal("week"),
    estimatedTotalCents: z.number().int().nonnegative(),
    actualTotalCents: z.number().int().nonnegative().nullable(),
    varianceCents: z.number().int().nullable(),
    hasPendingActual: z.boolean(),
    maxCostCents: z.number().int().positive(),
    isOverBudget: z.boolean(),
    components: z.array(reelCostRollupComponentSchema),
  })
  .strict();

export const reelCostRollupsMapSchema = z.record(
  z.string().uuid(),
  reelCostRollupDtoSchema,
);

/** Internal helper input — not exposed to browser actions in Phase A. */
export const getReelCostRollupForScriptInputSchema = z
  .object({
    clientId: z.string().uuid(),
    reelScriptId: z.string().uuid(),
    weekStart: trendWeekStartSchema,
    eventScope: z.literal("week"),
  })
  .strict();

/** Optional lazy Server Action input (Phase B+); Phase A uses batch attach only. */
export const getReelCostRollupForScriptActionInputSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    weekStart: trendWeekStartSchema.optional(),
  })
  .strict();

export type ReelCostRollupComponent = z.infer<
  typeof reelCostRollupComponentSchema
>;
export type ReelCostRollupDto = z.infer<typeof reelCostRollupDtoSchema>;
export type ReelCostRollupsMap = z.infer<typeof reelCostRollupsMapSchema>;
export type GetReelCostRollupForScriptInput = z.infer<
  typeof getReelCostRollupForScriptInputSchema
>;
export type GetReelCostRollupForScriptActionInput = z.infer<
  typeof getReelCostRollupForScriptActionInputSchema
>;

/** actualTotal - estimatedTotal when actual known; else null. */
export function computeReelCostVarianceCents(
  estimatedTotalCents: number,
  actualTotalCents: number | null,
): number | null {
  if (actualTotalCents === null) {
    return null;
  }
  return actualTotalCents - estimatedTotalCents;
}

/** Total used for over-budget comparison: actual when recorded, else estimate. */
export function computeReelCostCompareTotalCents(
  estimatedTotalCents: number,
  actualTotalCents: number | null,
): number {
  return actualTotalCents !== null ? actualTotalCents : estimatedTotalCents;
}

/** Reporting-only — does NOT affect US-7.1 budget gate. */
export function computeReelCostIsOverBudget(
  estimatedTotalCents: number,
  actualTotalCents: number | null,
  maxCostCents: number,
): boolean {
  return (
    computeReelCostCompareTotalCents(estimatedTotalCents, actualTotalCents) >
    maxCostCents
  );
}
