import "server-only";

import type { CreateTalkingHeadVideoJobSuccess } from "@/lib/contracts/video-job";
import {
  createVideoJobRequestSchema,
  type CreateVideoJobRequest,
} from "@/lib/contracts/providers";
import { DEFAULT_LOW_TIER_PROVIDER_KEYS } from "@/lib/contracts/providers";
import { assertReelBudgetAllowsEstimatedSpend } from "@/lib/cost-policy/assert-reel-budget-allows-estimated-spend";
import { recordReelSpendEvent } from "@/lib/cost-policy/record-reel-spend-event";
import { requireOperator } from "@/lib/auth/require-user";
import { getPrimaryReferenceLoopVideoAssetForClient } from "@/lib/media/get-primary-reference-loop-video-asset-for-client";
import { resolveProviderForJob } from "@/lib/providers/resolve-provider-for-job";
import { initializeProviderRegistryFromCatalog } from "@/lib/providers/create-provider-registry";
import { assertActiveAvatarConsentForJobs } from "@/lib/visual-preferences/assert-active-avatar-consent-for-jobs";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { findForbiddenVideoJobKeys } from "./find-forbidden-keys";
import { videoJobForbiddenFieldsError, videoJobMutationError } from "./errors";
import { loadReelScriptForVideoJob } from "./load-reel-script-for-video-job";
import { enqueueVideoJobPoll } from "./enqueue-video-job-poll";
import { mapVideoJobRow, VIDEO_JOBS_TABLE } from "./video-job-row";

async function verifyMediaAssetOwned(params: {
  assetId: string;
  clientId: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_media_assets")
    .select("id")
    .eq("id", params.assetId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  return !error && !!data;
}

function isAllowedTalkingHeadProviderKey(providerKey: string): boolean {
  return (
    providerKey === DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHead ||
    providerKey === DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHeadLoop
  );
}

export type CreateTalkingHeadVideoJobOptions = {
  parentJobId?: string;
  attempt?: number;
  operatorClientId?: string;
  jobKind?: "talking_head_generate" | "talking_head_retry";
  portraitAssetId?: string | null;
  voiceoverAssetId?: string | null;
};

export async function createTalkingHeadVideoJob(
  rawInput: unknown,
  options?: CreateTalkingHeadVideoJobOptions,
): Promise<CreateTalkingHeadVideoJobSuccess | ReturnType<typeof videoJobMutationError>> {
  try {
    const operator = options?.operatorClientId
      ? { id: options.operatorClientId, role: "operator" as const }
      : await requireOperator("handler");

    if (findForbiddenVideoJobKeys(rawInput).length > 0) {
      return videoJobForbiddenFieldsError();
    }

    const parsed = createVideoJobRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      return videoJobMutationError("VALIDATION_ERROR");
    }

    const input: CreateVideoJobRequest = parsed.data;

    if (input.clientId !== operator.id) {
      return videoJobMutationError("FORBIDDEN");
    }

    const script = await loadReelScriptForVideoJob({
      reelScriptId: input.reelScriptId,
      clientId: input.clientId,
    });
    if (!script) {
      return videoJobMutationError("NOT_FOUND");
    }

    const hasReferenceLoop = script.hasReferenceLoop;

    const providerResult = await resolveProviderForJob({
      clientId: input.clientId,
      assetRole: "talking_head",
      productionContext: {
        visualMode: script.visualMode,
        modalidad: script.modalidad,
        hasReferenceLoop,
        needsBroll: false,
        targetDurationSec: input.targetDurationSec ?? script.package.targetDurationSec,
        brollClipCount: 0,
        ttsCharCount: script.package.voiceoverText.length,
      },
    });

    if (!providerResult.ok) {
      return videoJobMutationError("PROVIDER_UNAVAILABLE");
    }

    const providerKey = providerResult.decision.providerKey;
    if (!isAllowedTalkingHeadProviderKey(providerKey)) {
      return videoJobMutationError("PROVIDER_UNAVAILABLE");
    }

    const registry = await initializeProviderRegistryFromCatalog();
    const adapter = registry.getVideoAdapter(providerKey);

    const voiceoverAssetId =
      options?.voiceoverAssetId ?? input.voiceoverAssetId ?? null;

    if (!voiceoverAssetId) {
      return videoJobMutationError("VALIDATION_ERROR", {
        fields: { voiceoverAssetId: ["REQUIRED"] },
      });
    }

    const isMusetalk =
      providerKey === DEFAULT_LOW_TIER_PROVIDER_KEYS.talkingHeadLoop;

    let portraitAssetIdForInsert: string;
    let resolvedInput: Parameters<typeof adapter.createJob>[0];

    if (isMusetalk) {
      if (script.visualMode === "own_avatar" || script.modalidad === "own_avatar") {
        return videoJobMutationError("VALIDATION_ERROR");
      }

      if (!hasReferenceLoop) {
        return videoJobMutationError("VALIDATION_ERROR");
      }

      let referenceVideoAssetId = options?.portraitAssetId ?? null;
      if (!referenceVideoAssetId) {
        const loopAsset = await getPrimaryReferenceLoopVideoAssetForClient(
          input.clientId,
        );
        if (!loopAsset) {
          return videoJobMutationError("NOT_FOUND");
        }
        referenceVideoAssetId = loopAsset.assetId;
      }

      const [loopOwned, voiceoverOwned] = await Promise.all([
        verifyMediaAssetOwned({
          assetId: referenceVideoAssetId,
          clientId: input.clientId,
        }),
        verifyMediaAssetOwned({
          assetId: voiceoverAssetId,
          clientId: input.clientId,
        }),
      ]);

      if (!loopOwned || !voiceoverOwned) {
        return videoJobMutationError("NOT_FOUND");
      }

      portraitAssetIdForInsert = referenceVideoAssetId;
      resolvedInput = {
        reelScriptId: input.reelScriptId,
        clientId: input.clientId,
        providerKey,
        providerTier: providerResult.decision.providerTier,
        assetRole: "primary",
        targetDurationSec:
          input.targetDurationSec ?? script.package.targetDurationSec,
        voiceoverAssetId,
        referenceVideoAssetId,
        prompt: input.prompt,
      };
    } else {
      const portraitAssetId =
        options?.portraitAssetId ??
        input.portraitAssetId ??
        input.referenceImageAssetId ??
        null;

      if (!portraitAssetId) {
        return videoJobMutationError("VALIDATION_ERROR", {
          fields: { portraitAssetId: ["REQUIRED"] },
        });
      }

      const [portraitOwned, voiceoverOwned] = await Promise.all([
        verifyMediaAssetOwned({
          assetId: portraitAssetId,
          clientId: input.clientId,
        }),
        verifyMediaAssetOwned({
          assetId: voiceoverAssetId,
          clientId: input.clientId,
        }),
      ]);

      if (!portraitOwned || !voiceoverOwned) {
        return videoJobMutationError("NOT_FOUND");
      }

      portraitAssetIdForInsert = portraitAssetId;
      resolvedInput = {
        reelScriptId: input.reelScriptId,
        clientId: input.clientId,
        providerKey,
        providerTier: providerResult.decision.providerTier,
        assetRole: "primary",
        targetDurationSec:
          input.targetDurationSec ?? script.package.targetDurationSec,
        voiceoverAssetId,
        portraitAssetId,
        referenceImageAssetId: input.referenceImageAssetId,
        prompt: input.prompt,
      };
    }

    const estimate = await adapter.estimateCost(resolvedInput);

    const budgetResult = await assertReelBudgetAllowsEstimatedSpend({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
      estimatedCostCents: estimate.estimatedCostCents,
      operatorClientId: operator.id,
      providerTier: providerResult.decision.providerTier,
    });

    if (!budgetResult.ok) {
      if (budgetResult.code === "BUDGET_EXCEEDED") {
        return videoJobMutationError("BUDGET_EXCEEDED", {
          messageKey: "scripts.videoJob.retry.budgetExceeded",
        });
      }
      return videoJobMutationError("INTERNAL_ERROR");
    }

    if (script.visualMode === "own_avatar" || script.modalidad === "own_avatar") {
      const consent = await assertActiveAvatarConsentForJobs(input.clientId);
      if (!consent.ok) {
        return videoJobMutationError("CONSENT_REVOKED", {
          messageKey: consent.error.messageKey,
        });
      }
    }

    const createResult = await adapter.createJob(resolvedInput);
    const attempt = options?.attempt ?? 1;

    if (!isSupabaseConfigured()) {
      return videoJobMutationError("INTERNAL_ERROR");
    }

    const supabase = createServerSupabaseClient();
    const { data: inserted, error: insertError } = await supabase
      .from(VIDEO_JOBS_TABLE)
      .insert({
        client_id: input.clientId,
        reel_script_id: input.reelScriptId,
        provider_key: providerKey,
        provider_tier: providerResult.decision.providerTier,
        asset_role: "primary",
        external_job_id: createResult.externalJobId,
        status: createResult.status,
        estimated_cost_cents: estimate.estimatedCostCents,
        portrait_asset_id: portraitAssetIdForInsert,
        voiceover_asset_id: voiceoverAssetId,
        parent_job_id: options?.parentJobId ?? null,
        attempt,
      })
      .select(
        "id, client_id, reel_script_id, provider_key, provider_tier, asset_role, external_job_id, status, estimated_cost_cents, actual_cost_cents, failure_reason, portrait_asset_id, voiceover_asset_id, output_media_asset_id, parent_job_id, spend_event_id, operator_client_id, attempt, created_at, updated_at",
      )
      .single();

    if (insertError || !inserted) {
      return videoJobMutationError("INTERNAL_ERROR");
    }

    const jobRow = mapVideoJobRow(inserted as Record<string, unknown>);
    if (!jobRow) {
      return videoJobMutationError("INTERNAL_ERROR");
    }

    const { spendEventId } = await recordReelSpendEvent({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
      assetRole: "talking_head",
      jobKind: options?.jobKind ?? "talking_head_generate",
      estimatedCostCents: estimate.estimatedCostCents,
      actualCostCents: null,
      operatorClientId: operator.id,
      providerKey,
    });

    await supabase
      .from(VIDEO_JOBS_TABLE)
      .update({ spend_event_id: spendEventId })
      .eq("id", jobRow.id);

    enqueueVideoJobPoll(jobRow.id);

    return {
      ok: true,
      jobId: jobRow.id,
      status: createResult.status,
      estimatedCostCents: estimate.estimatedCostCents,
      attempt,
    };
  } catch (error) {
    console.error("[video-jobs] create unexpected error", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return videoJobMutationError("INTERNAL_ERROR");
  }
}
