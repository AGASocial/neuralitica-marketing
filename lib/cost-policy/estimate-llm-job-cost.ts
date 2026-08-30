import "server-only";

import type { ReelSpendJobKind } from "@/lib/contracts/cost-policy";
import type { LlmVariant, ProviderTier } from "@/lib/contracts/providers";
import type { ProviderRationaleKey } from "@/lib/contracts/provider-decisions";
import { resolveProviderForJob } from "@/lib/providers/resolve-provider-for-job";

export type EstimateLlmJobCostInput = {
  clientId: string;
  providerTier: ProviderTier;
  llmVariant: LlmVariant;
};

export type EstimateLlmJobCostResult =
  | {
      ok: true;
      estimatedCostCents: number;
      providerKey: string;
      resolvedLlmProviderLabel: string;
      rationaleKey: ProviderRationaleKey;
    }
  | { ok: false; code: "PROVIDER_UNAVAILABLE" };

export async function estimateLlmJobCost(
  input: EstimateLlmJobCostInput,
): Promise<EstimateLlmJobCostResult> {
  const result = await resolveProviderForJob({
    clientId: input.clientId,
    assetRole: "llm",
    llmVariant: input.llmVariant,
  });

  if (!result.ok) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  return {
    ok: true,
    estimatedCostCents: result.decision.estimatedCostCents,
    providerKey: result.decision.providerKey,
    resolvedLlmProviderLabel: result.decision.displayLabel,
    rationaleKey: result.decision.rationaleKey,
  };
}

export function llmVariantForJobKind(
  jobKind: ReelSpendJobKind,
): LlmVariant {
  if (jobKind === "talking_head_generate" || jobKind === "talking_head_retry") {
    return "default";
  }
  return jobKind === "script_generate" || jobKind === "script_regenerate"
    ? "fallback"
    : "default";
}
