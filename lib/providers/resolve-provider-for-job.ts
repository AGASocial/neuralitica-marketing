import "server-only";

import type { ProviderDecision } from "@/lib/contracts/provider-decisions";
import {
  DEFAULT_REEL_DURATION_SEC,
} from "@/lib/contracts/provider-decisions";
import type {
  AssetRole,
  LlmVariant,
  ProviderCatalogRow,
  ProviderTier,
  VisualMode,
} from "@/lib/contracts/providers";
import { DEFAULT_LOW_TIER_PROVIDER_KEYS } from "@/lib/contracts/providers";
import type { ProviderRationaleKey } from "@/lib/contracts/providers";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import type { ReelProductionContext } from "@/lib/cost-policy/build-reel-production-context";
import { getCostPolicyForClient } from "@/lib/cost-policy/get-cost-policy-for-client";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";
import {
  getCatalogRowByKey,
  ProviderResolveError,
  resolveProvider,
} from "@/lib/providers/provider-adapters";
import { resolveProviderDisplayLabel } from "@/lib/providers/resolve-provider-display-label";
import { createSiliconFlowLlmAdapter } from "@/lib/providers/siliconflow-llm-adapter";

const DEFAULT_TTS_PROJECTION_CHAR_COUNT = 500;

export type ResolveProviderForJobInput = {
  clientId: string;
  assetRole: AssetRole;
  llmVariant?: LlmVariant;
  productionContext?: Pick<
    ReelProductionContext,
    | "visualMode"
    | "modalidad"
    | "hasReferenceLoop"
    | "needsBroll"
    | "targetDurationSec"
    | "brollClipCount"
    | "ttsCharCount"
  >;
};

export type ResolveProviderForJobResult =
  | { ok: true; decision: ProviderDecision }
  | { ok: false; code: "PROVIDER_UNAVAILABLE" };

function isEffectiveFaceless(
  visualMode: VisualMode | undefined,
  modalidad: VisualModality | undefined,
): boolean {
  return modalidad === "faceless" || visualMode === "faceless";
}

function estimateCatalogUnitCost(
  row: ProviderCatalogRow,
  projection: {
    targetDurationSec?: number;
    brollClipCount?: number;
    ttsCharCount?: number;
  },
): number {
  const { billingUnit, unitCostCents } = row.costModel;

  switch (billingUnit) {
    case "per_run":
      return unitCostCents;
    case "per_second": {
      const sec = projection.targetDurationSec ?? DEFAULT_REEL_DURATION_SEC;
      return unitCostCents * sec;
    }
    case "per_clip": {
      const clips = projection.brollClipCount ?? 1;
      return unitCostCents * clips;
    }
    case "per_1m_chars": {
      const chars = projection.ttsCharCount ?? DEFAULT_TTS_PROJECTION_CHAR_COUNT;
      return Math.max(1, Math.ceil((chars / 1_000_000) * unitCostCents));
    }
    case "per_1m_tokens":
      return unitCostCents;
    default:
      return unitCostCents;
  }
}

function resolveRationaleKey(params: {
  assetRole: AssetRole;
  providerTier: ProviderTier;
  providerKey: string;
  llmVariant?: LlmVariant;
  productionContext?: ResolveProviderForJobInput["productionContext"];
}): ProviderRationaleKey {
  if (params.assetRole === "llm") {
    return params.llmVariant === "fallback"
      ? "llm_variant_fallback"
      : "llm_variant_default";
  }

  if (params.assetRole === "broll") {
    if (
      params.productionContext &&
      isEffectiveFaceless(
        params.productionContext.visualMode,
        params.productionContext.modalidad,
      )
    ) {
      return "faceless_broll_wan";
    }
    return params.providerTier === "high"
      ? "cheapest_active_high_tier"
      : "cheapest_active_low_tier";
  }

  if (params.assetRole === "tts") {
    return "tts_voiceover_required";
  }

  if (params.assetRole === "talking_head") {
    if (
      params.productionContext?.hasReferenceLoop &&
      params.providerKey === DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHeadLoop
    ) {
      return "reference_loop_prefers_musetalk";
    }
    if (
      params.productionContext?.modalidad === "own_avatar" ||
      params.productionContext?.visualMode === "own_avatar"
    ) {
      return "own_avatar_talking_head";
    }
    return "generic_avatar_talking_head";
  }

  return params.providerTier === "high"
    ? "cheapest_active_high_tier"
    : "cheapest_active_low_tier";
}

export async function resolveProviderForJob(
  input: ResolveProviderForJobInput,
): Promise<ResolveProviderForJobResult> {
  const policyResult = await getCostPolicyForClient(input.clientId);
  if (!policyResult.ok) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  const providerTier = policyResult.policy.providerTier;
  const ctx = input.productionContext;

  if (
    input.assetRole === "talking_head" &&
    ctx &&
    isEffectiveFaceless(ctx.visualMode, ctx.modalidad)
  ) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  const catalogResult = await getProviderCatalog();
  if ("loadFailed" in catalogResult && catalogResult.loadFailed) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  let provider: ProviderCatalogRow;
  try {
    provider = resolveProvider(catalogResult.providers, {
      assetRole: input.assetRole,
      tier: providerTier,
      llmVariant: input.llmVariant,
      hasReferenceLoop: ctx?.hasReferenceLoop,
      visualMode: ctx?.visualMode,
      needsBroll: ctx?.needsBroll,
    });
  } catch (error) {
    if (error instanceof ProviderResolveError && providerTier === "high") {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  let estimatedCostCents: number;

  if (input.assetRole === "llm") {
    const adapter = createSiliconFlowLlmAdapter(
      provider.key,
      provider.envKeyName,
    );
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
      estimatedCostCents = estimate.estimatedCostCents;
    } catch {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }
  } else {
    estimatedCostCents = estimateCatalogUnitCost(provider, {
      targetDurationSec: ctx?.targetDurationSec,
      brollClipCount: ctx?.brollClipCount,
      ttsCharCount: ctx?.ttsCharCount,
    });
    if (!Number.isSafeInteger(estimatedCostCents) || estimatedCostCents < 0) {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }
  }

  const rationaleKey = resolveRationaleKey({
    assetRole: input.assetRole,
    providerTier,
    providerKey: provider.key,
    llmVariant: input.llmVariant,
    productionContext: ctx,
  });

  return {
    ok: true,
    decision: {
      providerKey: provider.key,
      providerTier,
      assetRole: input.assetRole,
      estimatedCostCents,
      displayLabel: resolveProviderDisplayLabel(provider.key),
      rationaleKey,
    },
  };
}

export function resolveCatalogRowForDecision(
  catalog: readonly ProviderCatalogRow[],
  providerKey: string,
): ProviderCatalogRow | undefined {
  return getCatalogRowByKey(catalog, providerKey);
}
