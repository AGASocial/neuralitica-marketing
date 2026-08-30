import "server-only";

import type { SynthesizeVoiceoverForReelScriptResult } from "@/lib/contracts/tts-voiceover";
import {
  synthesizeVoiceoverForReelScriptInputSchema,
} from "@/lib/contracts/tts-voiceover";
import { DEFAULT_LOW_TIER_PROVIDER_KEYS } from "@/lib/contracts/providers";
import { resolvedSynthesizeSpeechInputSchema } from "@/lib/contracts/providers";
import { assertReelBudgetAllowsEstimatedSpend } from "@/lib/cost-policy/assert-reel-budget-allows-estimated-spend";
import { recordReelSpendEvent } from "@/lib/cost-policy/record-reel-spend-event";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { insertVoiceoverMediaAsset } from "@/lib/media/insert-voiceover-media-asset";
import { initializeProviderRegistryFromCatalog } from "@/lib/providers/create-provider-registry";
import { ProviderAdapterError } from "@/lib/providers/normalize-provider-response";
import { resolveProviderForJob } from "@/lib/providers/resolve-provider-for-job";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  findLatestVoiceoverAssetId,
} from "@/lib/tts/get-voiceover-summaries-for-reel-scripts";
import { findForbiddenTtsSynthesisKeys } from "@/lib/tts/find-forbidden-synthesis-keys";
import {
  ttsVoiceoverBudgetExceededError,
  ttsVoiceoverCostPolicyUnavailableError,
  ttsVoiceoverEmptyTextError,
  ttsVoiceoverForbiddenError,
  ttsVoiceoverForbiddenFieldsError,
  ttsVoiceoverInternalError,
  ttsVoiceoverNotFoundError,
  ttsVoiceoverProviderUnavailableError,
  ttsVoiceoverUnauthenticatedError,
  ttsVoiceoverValidationError,
} from "@/lib/tts/errors";
import { loadReelScriptForVoiceover } from "@/lib/tts/load-reel-script-for-voiceover";
import { resolveDefaultVoiceId } from "@/lib/tts/voice-catalog";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): SynthesizeVoiceoverForReelScriptResult {
  if (error.status === 401) {
    return ttsVoiceoverUnauthenticatedError();
  }
  return ttsVoiceoverForbiddenError();
}

export async function synthesizeVoiceoverForReelScript(
  rawInput: unknown,
): Promise<SynthesizeVoiceoverForReelScriptResult> {
  try {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return authGuardEnvelope(error);
      }
      throw error;
    }

    if (findForbiddenTtsSynthesisKeys(rawInput).length > 0) {
      return ttsVoiceoverForbiddenFieldsError();
    }

    const parsed = synthesizeVoiceoverForReelScriptInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return ttsVoiceoverValidationError(
        zodInterviewErrorToFieldErrors(parsed.error),
      );
    }

    const clientId = operator.id;
    const { reelScriptId } = parsed.data;

    const script = await loadReelScriptForVoiceover({
      reelScriptId,
      clientId,
      preferredLocale: operator.preferredLocale ?? "en",
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
      clientId,
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
      reelScriptId,
      clientId,
      providerKey,
      text: script.voiceoverText,
      voiceId,
      locale: script.preferredLocale,
    });

    const registry = await initializeProviderRegistryFromCatalog();
    const adapter = registry.getTtsAdapter(providerKey);
    const estimate = await adapter.estimateCost(resolvedInput);

    const budget = await assertReelBudgetAllowsEstimatedSpend({
      clientId,
      reelScriptId,
      estimatedCostCents: estimate.estimatedCostCents,
      operatorClientId: operator.id,
      providerTier: providerResult.decision.providerTier,
    });

    if (!budget.ok) {
      if (budget.code === "BUDGET_EXCEEDED") {
        return ttsVoiceoverBudgetExceededError();
      }
      return ttsVoiceoverCostPolicyUnavailableError();
    }

    const priorVoiceoverAssetId = await findLatestVoiceoverAssetId({
      clientId,
      reelScriptId,
    });
    const jobKind =
      priorVoiceoverAssetId !== null ? "tts_regenerate" : "tts_generate";

    let storedAsset;
    try {
      storedAsset = await adapter.synthesize(resolvedInput);
    } catch (error) {
      if (error instanceof ProviderAdapterError) {
        if (
          error.code === "PROVIDER_CONFIG_MISSING" ||
          error.code === "PROVIDER_REQUEST_FAILED" ||
          error.code === "PROVIDER_RESPONSE_INVALID"
        ) {
          return ttsVoiceoverProviderUnavailableError();
        }
      }
      console.error("[tts] synthesize failed", {
        clientId,
        reelScriptId,
        name: error instanceof Error ? error.name : "unknown",
      });
      return ttsVoiceoverInternalError();
    }

    const inserted = await insertVoiceoverMediaAsset({
      clientId,
      reelScriptId,
      storedAsset,
      voiceId,
      providerKey,
      supersedesAssetId: priorVoiceoverAssetId,
    });

    if (!inserted) {
      return ttsVoiceoverInternalError();
    }

    try {
      await recordReelSpendEvent({
        clientId,
        reelScriptId,
        assetRole: "tts",
        jobKind,
        estimatedCostCents: estimate.estimatedCostCents,
        actualCostCents: storedAsset.actualCostCents,
        durationSec: storedAsset.durationSec ?? null,
        operatorClientId: operator.id,
        providerKey,
      });
    } catch {
      console.error("[tts] spend insert failed after asset insert", {
        clientId,
        reelScriptId,
        voiceoverAssetId: inserted.mediaAssetId,
      });
      return ttsVoiceoverInternalError();
    }

    return {
      ok: true,
      voiceoverAssetId: inserted.mediaAssetId,
      reelScriptId,
      voiceId,
      providerKey: DEFAULT_LOW_TIER_PROVIDER_KEYS.tts,
      estimatedCostCents: estimate.estimatedCostCents,
      actualCostCents: storedAsset.actualCostCents,
      durationSec: storedAsset.durationSec,
      jobKind,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[tts] synthesize unexpected error");
    return ttsVoiceoverInternalError();
  }
}
