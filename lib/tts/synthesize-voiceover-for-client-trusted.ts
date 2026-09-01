import "server-only";

import type { SynthesizeVoiceoverForReelScriptResult } from "@/lib/contracts/tts-voiceover";
import { synthesizeVoiceoverForReelScriptInputSchema } from "@/lib/contracts/tts-voiceover";
import { DEFAULT_LOW_TIER_PROVIDER_KEYS } from "@/lib/contracts/providers";
import { resolvedSynthesizeSpeechInputSchema } from "@/lib/contracts/providers";
import { assertReelBudgetAllowsEstimatedSpend } from "@/lib/cost-policy/assert-reel-budget-allows-estimated-spend";
import { recordReelSpendEvent } from "@/lib/cost-policy/record-reel-spend-event";
import { insertVoiceoverMediaAsset } from "@/lib/media/insert-voiceover-media-asset";
import { initializeProviderRegistryFromCatalog } from "@/lib/providers/create-provider-registry";
import { ProviderAdapterError } from "@/lib/providers/normalize-provider-response";
import { resolveProviderForJob } from "@/lib/providers/resolve-provider-for-job";
import { findLatestVoiceoverAssetId } from "@/lib/tts/get-voiceover-summaries-for-reel-scripts";
import {
  ttsVoiceoverBudgetExceededError,
  ttsVoiceoverCostPolicyUnavailableError,
  ttsVoiceoverEmptyTextError,
  ttsVoiceoverInternalError,
  ttsVoiceoverNotFoundError,
  ttsVoiceoverProviderUnavailableError,
} from "@/lib/tts/errors";
import { loadReelScriptForVoiceover } from "@/lib/tts/load-reel-script-for-voiceover";
import { resolveDefaultVoiceId } from "@/lib/tts/voice-catalog";

export type SynthesizeVoiceoverTrustedParams = {
  clientId: string;
  reelScriptId: string;
  invokedBy: "operator" | "revision" | "system";
  preferredLocale?: "en" | "es";
};

/**
 * Trusted server-only TTS synthesis (Operator or revision router).
 */
export async function synthesizeVoiceoverForClientTrusted(
  params: SynthesizeVoiceoverTrustedParams,
): Promise<SynthesizeVoiceoverForReelScriptResult> {
  try {
    const parsed = synthesizeVoiceoverForReelScriptInputSchema.safeParse({
      reelScriptId: params.reelScriptId,
    });
    if (!parsed.success) {
      return ttsVoiceoverNotFoundError();
    }

    const locale = params.preferredLocale ?? "en";
    const script = await loadReelScriptForVoiceover({
      reelScriptId: params.reelScriptId,
      clientId: params.clientId,
      preferredLocale: locale,
    });
    if (!script) {
      return ttsVoiceoverNotFoundError();
    }

    if (script.voiceoverText.length === 0) {
      return ttsVoiceoverEmptyTextError();
    }

    const voiceId =
      script.preferredVoiceId ??
      resolveDefaultVoiceId({
        preferredLocale: script.preferredLocale,
        profileTone: script.profileTone,
      });

    const providerResult = await resolveProviderForJob({
      clientId: params.clientId,
      assetRole: "tts",
      productionContext: {
        visualMode: script.visualMode,
        modalidad: script.modalidad,
        hasReferenceLoop: false,
        needsBroll: false,
        targetDurationSec: script.targetDurationSec,
        brollClipCount: 0,
        ttsCharCount: script.voiceoverText.length,
      },
    });

    if (!providerResult.ok) {
      return ttsVoiceoverProviderUnavailableError();
    }

    const providerKey = providerResult.decision.providerKey;
    if (providerKey !== DEFAULT_LOW_TIER_PROVIDER_KEYS.tts) {
      return ttsVoiceoverProviderUnavailableError();
    }

    const resolvedInput = resolvedSynthesizeSpeechInputSchema.parse({
      reelScriptId: params.reelScriptId,
      clientId: params.clientId,
      providerKey,
      text: script.voiceoverText,
      voiceId,
      locale: script.preferredLocale,
    });

    const registry = await initializeProviderRegistryFromCatalog();
    const adapter = registry.getTtsAdapter(providerKey);
    const estimate = await adapter.estimateCost(resolvedInput);

    const budget = await assertReelBudgetAllowsEstimatedSpend({
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
      estimatedCostCents: estimate.estimatedCostCents,
      operatorClientId: params.clientId,
      providerTier: providerResult.decision.providerTier,
    });

    if (!budget.ok) {
      if (budget.code === "BUDGET_EXCEEDED") {
        return ttsVoiceoverBudgetExceededError();
      }
      return ttsVoiceoverCostPolicyUnavailableError();
    }

    const priorVoiceoverAssetId = await findLatestVoiceoverAssetId({
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
    });
    const jobKind =
      priorVoiceoverAssetId !== null ? "tts_regenerate" : "tts_generate";

    let storedAsset;
    try {
      storedAsset = await adapter.synthesize(resolvedInput);
    } catch (error) {
      if (error instanceof ProviderAdapterError) {
        return ttsVoiceoverProviderUnavailableError();
      }
      console.error("[tts] revision synthesize failed", {
        clientId: params.clientId,
        reelScriptId: params.reelScriptId,
        invokedBy: params.invokedBy,
      });
      return ttsVoiceoverInternalError();
    }

    const inserted = await insertVoiceoverMediaAsset({
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
      storedAsset,
      voiceId,
      providerKey,
      supersedesAssetId: priorVoiceoverAssetId,
    });

    if (!inserted) {
      return ttsVoiceoverInternalError();
    }

    await recordReelSpendEvent({
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
      assetRole: "tts",
      jobKind,
      estimatedCostCents: estimate.estimatedCostCents,
      actualCostCents: storedAsset.actualCostCents ?? estimate.estimatedCostCents,
      durationSec: storedAsset.durationSec ?? null,
      operatorClientId: params.clientId,
      providerKey,
    });

    return {
      ok: true,
      voiceoverAssetId: inserted.mediaAssetId,
      reelScriptId: params.reelScriptId,
      voiceId,
      providerKey,
      estimatedCostCents: estimate.estimatedCostCents,
      actualCostCents: storedAsset.actualCostCents ?? estimate.estimatedCostCents,
      durationSec: storedAsset.durationSec,
      jobKind,
    };
  } catch {
    return ttsVoiceoverInternalError();
  }
}
