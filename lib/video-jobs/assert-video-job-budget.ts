import "server-only";

import { wouldExceedBudget } from "@/lib/contracts/cost-policy";
import { loadCostPolicyForClientFresh } from "@/lib/cost-policy/get-cost-policy-for-client";
import { recordBudgetAuditEvent } from "@/lib/cost-policy/record-budget-audit-event";
import { verifyReelScriptBelongsToClient } from "@/lib/cost-policy/resolve-reel-script-for-budget";
import {
  ReelCumulativeCostUnsafeError,
  sumReelCumulativeCostCents,
} from "@/lib/cost-policy/sum-reel-cumulative-cost-cents";

export type AssertVideoJobBudgetAllowsSpendInput = {
  clientId: string;
  reelScriptId: string;
  operatorClientId: string;
  estimatedCostCents: number;
};

export type AssertVideoJobBudgetAllowsSpendResult =
  | {
      ok: true;
      cumulativeCostCents: number;
      maxCostCents: number;
    }
  | {
      ok: false;
      code: "BUDGET_EXCEEDED" | "COST_POLICY_UNAVAILABLE";
      cumulativeCostCents?: number;
      estimatedCostCents?: number;
      maxCostCents?: number;
    };

export async function assertVideoJobBudgetAllowsSpend(
  input: AssertVideoJobBudgetAllowsSpendInput,
): Promise<AssertVideoJobBudgetAllowsSpendResult> {
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

  let cumulativeCostCents = 0;
  try {
    cumulativeCostCents = await sumReelCumulativeCostCents(input.reelScriptId);
  } catch (error) {
    if (error instanceof ReelCumulativeCostUnsafeError) {
      return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
    }
    throw error;
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
    cumulativeCostCents,
    maxCostCents,
  };
}
