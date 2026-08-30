import "server-only";

import {
  OVERRIDE_REASON_MAX_LENGTH,
  OVERRIDE_REASON_MIN_LENGTH,
  reelSpendJobKindSchema,
  remainingBudgetCents,
  wouldExceedBudget,
  type ReelSpendJobKind,
} from "@/lib/contracts/cost-policy";
import type { ProviderTier } from "@/lib/contracts/providers";

import {
  estimateLlmJobCost,
  llmVariantForJobKind,
} from "./estimate-llm-job-cost";
import { loadCostPolicyForClientFresh } from "./get-cost-policy-for-client";
import { recordBudgetAuditEvent } from "./record-budget-audit-event";
import {
  ReelCumulativeCostUnsafeError,
  sumReelCumulativeCostCents,
} from "./sum-reel-cumulative-cost-cents";
import { verifyReelScriptBelongsToClient } from "./resolve-reel-script-for-budget";

export { reelSpendJobKindSchema };

export type AssertReelBudgetAllowsSpendInput = {
  clientId: string;
  reelScriptId: string;
  reelScriptPersisted: boolean;
  jobKind: ReelSpendJobKind;
  operatorClientId: string;
  budgetOverride?: true;
  overrideReason?: string;
};

export type AssertReelBudgetAllowsSpendResult =
  | {
      ok: true;
      estimatedCostCents: number;
      cumulativeCostCents: number;
      maxCostCents: number;
      providerTier: ProviderTier;
      providerKey: string;
      rationaleKey: import("@/lib/contracts/provider-decisions").ProviderRationaleKey;
      didOverride: boolean;
    }
  | {
      ok: false;
      code:
        | "BUDGET_EXCEEDED"
        | "COST_POLICY_UNAVAILABLE"
        | "PROVIDER_UNAVAILABLE"
        | "VALIDATION_ERROR";
      cumulativeCostCents?: number;
      estimatedCostCents?: number;
      maxCostCents?: number;
      fields?: Record<string, string[]>;
    };

export async function assertReelBudgetAllowsSpend(
  input: AssertReelBudgetAllowsSpendInput,
): Promise<AssertReelBudgetAllowsSpendResult> {
  const policyResult = await loadCostPolicyForClientFresh(input.clientId);
  if (!policyResult.ok) {
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  if (input.reelScriptPersisted) {
    const owned = await verifyReelScriptBelongsToClient({
      reelScriptId: input.reelScriptId,
      clientId: input.clientId,
    });
    if (!owned) {
      return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
    }
  }

  const llmVariant = llmVariantForJobKind(input.jobKind);
  const estimateResult = await estimateLlmJobCost({
    clientId: input.clientId,
    providerTier: policyResult.policy.providerTier,
    llmVariant,
  });

  if (!estimateResult.ok) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  let cumulativeCostCents = 0;
  if (input.reelScriptPersisted) {
    try {
      cumulativeCostCents = await sumReelCumulativeCostCents(input.reelScriptId);
    } catch {
      return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
    }
  }

  const maxCostCents = policyResult.policy.maxCostCents;
  const estimatedCostCents = estimateResult.estimatedCostCents;
  const exceeds = wouldExceedBudget(
    cumulativeCostCents,
    estimatedCostCents,
    maxCostCents,
  );

  if (exceeds) {
    if (input.budgetOverride !== true) {
      await recordBudgetAuditEvent({
        eventType: "blocked",
        clientId: input.clientId,
        operatorClientId: input.operatorClientId,
        reelScriptId: input.reelScriptPersisted ? input.reelScriptId : null,
        estimatedCostCents,
        cumulativeCostCents,
        maxCostCents,
        providerTier: policyResult.policy.providerTier,
      });
      return {
        ok: false,
        code: "BUDGET_EXCEEDED",
        cumulativeCostCents,
        estimatedCostCents,
        maxCostCents,
      };
    }

    const reason = input.overrideReason?.trim() ?? "";
    if (
      reason.length < OVERRIDE_REASON_MIN_LENGTH ||
      reason.length > OVERRIDE_REASON_MAX_LENGTH
    ) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        fields: { overrideReason: ["REQUIRED"] },
        cumulativeCostCents,
        estimatedCostCents,
        maxCostCents,
      };
    }

    await recordBudgetAuditEvent({
      eventType: "override_proceed",
      clientId: input.clientId,
      operatorClientId: input.operatorClientId,
      reelScriptId: input.reelScriptPersisted ? input.reelScriptId : null,
      estimatedCostCents,
      cumulativeCostCents,
      maxCostCents,
      providerTier: policyResult.policy.providerTier,
      overrideReason: reason,
    });

    return {
      ok: true,
      estimatedCostCents,
      cumulativeCostCents,
      maxCostCents,
      providerTier: policyResult.policy.providerTier,
      providerKey: estimateResult.providerKey,
      rationaleKey: estimateResult.rationaleKey,
      didOverride: true,
    };
  }

  return {
    ok: true,
    estimatedCostCents,
    cumulativeCostCents,
    maxCostCents,
    providerTier: policyResult.policy.providerTier,
    providerKey: estimateResult.providerKey,
    rationaleKey: estimateResult.rationaleKey,
    didOverride: false,
  };
}

export async function sumReelCumulativeCostCentsSafe(
  reelScriptId: string,
): Promise<number | null> {
  try {
    return await sumReelCumulativeCostCents(reelScriptId);
  } catch (error) {
    if (error instanceof ReelCumulativeCostUnsafeError) {
      return null;
    }
    throw error;
  }
}
