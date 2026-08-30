import "server-only";

import {
  remainingBudgetCents,
  wouldExceedBudget,
} from "@/lib/contracts/cost-policy";
import type { ProviderTier } from "@/lib/contracts/providers";
import { loadCostPolicyForClientFresh } from "@/lib/cost-policy/get-cost-policy-for-client";
import { recordBudgetAuditEvent } from "@/lib/cost-policy/record-budget-audit-event";
import { verifyReelScriptBelongsToClient } from "@/lib/cost-policy/resolve-reel-script-for-budget";
import { sumReelCumulativeCostCents } from "@/lib/cost-policy/sum-reel-cumulative-cost-cents";

export type AssertReelBudgetAllowsEstimatedSpendInput = {
  clientId: string;
  reelScriptId: string;
  estimatedCostCents: number;
  operatorClientId: string;
  providerTier?: ProviderTier;
};

export type AssertReelBudgetAllowsEstimatedSpendResult =
  | {
      ok: true;
      estimatedCostCents: number;
      cumulativeCostCents: number;
      maxCostCents: number;
      providerTier: ProviderTier;
    }
  | {
      ok: false;
      code: "BUDGET_EXCEEDED" | "COST_POLICY_UNAVAILABLE";
      cumulativeCostCents?: number;
      estimatedCostCents?: number;
      maxCostCents?: number;
    };

export async function assertReelBudgetAllowsEstimatedSpend(
  input: AssertReelBudgetAllowsEstimatedSpendInput,
): Promise<AssertReelBudgetAllowsEstimatedSpendResult> {
  const policyResult = await loadCostPolicyForClientFresh(input.clientId);
  if (!policyResult.ok) {
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  const owned = await verifyReelScriptBelongsToClient({
    reelScriptId: input.reelScriptId,
    clientId: input.clientId,
  });
  if (!owned) {
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  if (
    !Number.isSafeInteger(input.estimatedCostCents) ||
    input.estimatedCostCents < 0
  ) {
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  let cumulativeCostCents = 0;
  try {
    cumulativeCostCents = await sumReelCumulativeCostCents(input.reelScriptId);
  } catch {
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  const maxCostCents = policyResult.policy.maxCostCents;
  const exceeds = wouldExceedBudget(
    cumulativeCostCents,
    input.estimatedCostCents,
    maxCostCents,
  );

  if (exceeds) {
    await recordBudgetAuditEvent({
      eventType: "blocked",
      clientId: input.clientId,
      operatorClientId: input.operatorClientId,
      reelScriptId: input.reelScriptId,
      estimatedCostCents: input.estimatedCostCents,
      cumulativeCostCents,
      maxCostCents,
      providerTier: policyResult.policy.providerTier,
    });
    return {
      ok: false,
      code: "BUDGET_EXCEEDED",
      cumulativeCostCents,
      estimatedCostCents: input.estimatedCostCents,
      maxCostCents,
    };
  }

  return {
    ok: true,
    estimatedCostCents: input.estimatedCostCents,
    cumulativeCostCents,
    maxCostCents,
    providerTier: policyResult.policy.providerTier,
  };
}

export { remainingBudgetCents };
