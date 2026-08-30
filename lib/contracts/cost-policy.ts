/**
 * Cost policy + Reel budget gate contract (US-7.1).
 * FE imports types and constants only; Zod validation stays server-side.
 */
import { z } from "zod";

import { providerRationaleKeySchema } from "@/lib/contracts/providers";
import { providerTierSchema, visualModeSchema } from "@/lib/contracts/providers";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { visualModalitySchema } from "@/lib/contracts/visual-preferences";

/** Application ceiling for max_cost_cents writes (stricter than DB CHECK > 0). */
export const MAX_COST_CENTS_CEILING = 10_000 as const;

/** US-X.4 seed default — documented; not enforced on read. */
export const DEFAULT_MAX_COST_CENTS = 150 as const;

export const OVERRIDE_REASON_MIN_LENGTH = 1;
export const OVERRIDE_REASON_MAX_LENGTH = 500;

export const reelSpendJobKindSchema = z.enum([
  "script_generate",
  "script_regenerate",
  "caption_generate",
  "caption_regenerate",
]);

export type ReelSpendJobKind = z.infer<typeof reelSpendJobKindSchema>;

export const projectionHintKeySchema = z.enum([
  "faceless_broll_later",
  "own_avatar_video_later",
  "generic_avatar_video_later",
]);

export type ProjectionHintKey = z.infer<typeof projectionHintKeySchema>;

export const llmRecommendationSchema = z
  .object({
    displayLabel: z.string().min(1),
    providerTier: providerTierSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    rationaleKey: providerRationaleKeySchema,
  })
  .strict();

export type LlmRecommendation = z.infer<typeof llmRecommendationSchema>;

export const budgetAuditEventTypeSchema = z.enum([
  "blocked",
  "override_proceed",
  "policy_updated",
]);

export type BudgetAuditEventType = z.infer<typeof budgetAuditEventTypeSchema>;

export const costPolicyErrorCodeSchema = z.enum([
  "BUDGET_EXCEEDED",
  "COST_POLICY_UNAVAILABLE",
  "POLICY_VALIDATION_ERROR",
  "PROVIDER_UNAVAILABLE",
]);

export type CostPolicyErrorCode = z.infer<typeof costPolicyErrorCodeSchema>;

/** Keys rejected on script/caption generate/regenerate spend paths. */
export const FORBIDDEN_BUDGET_SPEND_KEYS = [
  "maxCostCents",
  "max_cost_cents",
  "providerTier",
  "provider_tier",
  "tier",
  "estimatedCostCents",
  "estimated_cost_cents",
  "cumulativeCostCents",
  "cumulative_cost_cents",
  "budgetCap",
  "policyId",
  "policy_id",
  "rules",
  "skipBudgetCheck",
  "skip_budget_check",
  "overrideBudget",
  "override_budget",
  "confirmGeneration",
  "confirm_generation",
  // US-7.3 — actual cost authority is server-only via finalizeGenerationCost
  "actualCostCents",
  "actual_cost_cents",
  "costCents",
  "cost_cents",
  "durationSec",
  "duration_sec",
  "billingUsage",
  "usage",
  "providerCost",
  "provider_cost",
  "actualCostUnavailableReason",
  "actual_cost_unavailable_reason",
  "failureReason",
  "failure_reason",
  "spendEventId",
  "spend_event_id",
  "manualActualCostCents",
] as const;

/** US-7.4 — rejected on rollup read paths (batch list has no client input). */
export const FORBIDDEN_REEL_COST_ROLLUP_KEYS = [
  "reelCostRollups",
  "reelCostRollup",
  "costRollup",
  "cost_rollup",
  "components",
  "varianceCents",
  "variance_cents",
  "isOverBudget",
  "is_over_budget",
  "totalActualCostCents",
  "total_actual_cost_cents",
  "totalEstimatedCostCents",
  "total_estimated_cost_cents",
  "compareTotalCents",
  "eventScope",
  "event_scope",
] as const;

export const updateGlobalCostPolicyInputSchema = z
  .object({
    maxCostCents: z.number().int().min(1).max(MAX_COST_CENTS_CEILING),
    providerTier: providerTierSchema,
  })
  .strict();

export const updateClientCostPolicyOverrideInputSchema = z
  .object({
    enabled: z.boolean(),
    maxCostCents: z
      .number()
      .int()
      .min(1)
      .max(MAX_COST_CENTS_CEILING)
      .optional(),
    providerTier: providerTierSchema.optional(),
  })
  .strict();

export const budgetOverrideFieldsSchema = z
  .object({
    budgetOverride: z.literal(true).optional(),
    overrideReason: z
      .string()
      .trim()
      .min(OVERRIDE_REASON_MIN_LENGTH)
      .max(OVERRIDE_REASON_MAX_LENGTH)
      .optional(),
  })
  .strict();

export const reelBudgetPreviewSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    slotIndex: z.number().int().min(0).max(6),
    jobKind: reelSpendJobKindSchema,
    estimatedCostCents: z.number().int().nonnegative(),
    cumulativeCostCents: z.number().int().nonnegative(),
    maxCostCents: z.number().int().positive(),
    remainingCents: z.number().int().nonnegative(),
    providerTier: providerTierSchema,
    resolvedLlmProviderLabel: z.string().min(1),
    visualMode: visualModeSchema,
    modalidad: visualModalitySchema,
    projectionHintKey: projectionHintKeySchema.nullable(),
    llmRecommendation: llmRecommendationSchema.optional(),
    wouldExceed: z.boolean(),
  })
  .strict();

export const reelBudgetBatchPreviewSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    jobKind: z.enum(["script_generate", "caption_generate"]),
    items: z.array(reelBudgetPreviewSchema).min(1),
    wouldExceedAny: z.boolean(),
    blockedSlotIndexes: z.array(z.number().int().min(0).max(6)),
    aggregateEstimatedCostCents: z.number().int().nonnegative(),
  })
  .strict();

export const operatorCostSettingsDtoSchema = z
  .object({
    global: z.object({
      maxCostCents: z.number().int().positive(),
      providerTier: providerTierSchema,
      updatedAt: z.string().datetime({ offset: true }),
    }),
    clientOverride: z
      .object({
        maxCostCents: z.number().int().positive(),
        providerTier: providerTierSchema,
        updatedAt: z.string().datetime({ offset: true }),
      })
      .nullable(),
    effective: z.object({
      scope: z.enum(["global", "client"]),
      maxCostCents: z.number().int().positive(),
      providerTier: providerTierSchema,
    }),
    resolvedLlmProviderLabel: z.string().min(1),
    highTierWarningKey: z
      .literal("settings.costPolicy.highTierInactiveWarning")
      .optional(),
  })
  .strict();

export const getReelBudgetPreviewInputSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    jobKind: z.enum(["script_generate", "caption_generate"]),
    mode: z.enum(["batch", "slot"]),
    slotIndex: z.number().int().min(0).max(6).optional(),
  })
  .strict();

export type UpdateGlobalCostPolicyInput = z.infer<
  typeof updateGlobalCostPolicyInputSchema
>;
export type UpdateClientCostPolicyOverrideInput = z.infer<
  typeof updateClientCostPolicyOverrideInputSchema
>;
export type BudgetOverrideFields = z.infer<typeof budgetOverrideFieldsSchema>;
export type ReelBudgetPreview = z.infer<typeof reelBudgetPreviewSchema>;
export type ReelBudgetBatchPreview = z.infer<
  typeof reelBudgetBatchPreviewSchema
>;
export type OperatorCostSettingsDto = z.infer<
  typeof operatorCostSettingsDtoSchema
>;
export type GetReelBudgetPreviewInput = z.infer<
  typeof getReelBudgetPreviewInputSchema
>;

/** Overflow-safe cents addition. Returns null if unsafe or negative inputs. */
export function safeAddCents(a: number, b: number): number | null {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    return null;
  }
  if (a < 0 || b < 0) {
    return null;
  }
  const total = a + b;
  if (!Number.isSafeInteger(total)) {
    return null;
  }
  return total;
}

export function remainingBudgetCents(
  maxCostCents: number,
  cumulativeCostCents: number,
): number {
  return Math.max(0, maxCostCents - cumulativeCostCents);
}

export function wouldExceedBudget(
  cumulativeCostCents: number,
  estimatedCostCents: number,
  maxCostCents: number,
): boolean {
  const total = safeAddCents(cumulativeCostCents, estimatedCostCents);
  if (total === null) {
    return true;
  }
  return total > maxCostCents;
}
