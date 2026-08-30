import "server-only";

import type { LlmVariant, ProviderTier } from "@/lib/contracts/providers";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";
import { resolveProvider } from "@/lib/providers/provider-adapters";
import { createSiliconFlowLlmAdapter } from "@/lib/providers/siliconflow-llm-adapter";

import { resolveLlmProviderLabel } from "./llm-provider-label";

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
    }
  | { ok: false; code: "PROVIDER_UNAVAILABLE" };

export async function estimateLlmJobCost(
  input: EstimateLlmJobCostInput,
): Promise<EstimateLlmJobCostResult> {
  const catalogResult = await getProviderCatalog();
  if ("loadFailed" in catalogResult && catalogResult.loadFailed) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  let provider;
  try {
    provider = resolveProvider(catalogResult.providers, {
      assetRole: "llm",
      tier: input.providerTier,
      llmVariant: input.llmVariant,
    });
  } catch {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  const adapter = createSiliconFlowLlmAdapter(provider.key, provider.envKeyName);
  if (!adapter) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  try {
    const estimate = await adapter.estimateCost({
      clientId: input.clientId,
      providerKey: provider.key,
      locale: "es",
      systemPrompt: "estimate",
      userPrompt: "estimate",
    });

    if (
      !Number.isSafeInteger(estimate.estimatedCostCents) ||
      estimate.estimatedCostCents < 0
    ) {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }

    return {
      ok: true,
      estimatedCostCents: estimate.estimatedCostCents,
      providerKey: provider.key,
      resolvedLlmProviderLabel: resolveLlmProviderLabel(provider.key),
    };
  } catch {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }
}

export function llmVariantForJobKind(
  jobKind:
    | "script_generate"
    | "script_regenerate"
    | "caption_generate"
    | "caption_regenerate",
): LlmVariant {
  return jobKind === "script_generate" || jobKind === "script_regenerate"
    ? "fallback"
    : "default";
}
