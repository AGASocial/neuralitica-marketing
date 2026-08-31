import "server-only";

import {
  WAN_PROMPT_BEAT_CLOSE,
  WAN_PROMPT_BEAT_OPEN,
  WAN_PROMPT_MAX_CHARS,
  WAN_PROVIDER_KEY,
  WAN_REFERENCE_STILL_MISSING_MESSAGE_KEY,
  WAN_UNIT_COST_CENTS_PER_CLIP,
  clampWanClipCount,
  clampWanClipDurationSec,
} from "@/lib/contracts/siliconflow-wan21-turbo";
import type {
  CreateBrollVideoJobCreatedItem,
  CreateBrollVideoJobSkippedItem,
  CreateBrollVideoJobsResult,
} from "@/lib/contracts/video-job";
import {
  createBrollVideoJobsRequestSchema,
  createBrollVideoJobsSuccessSchema,
} from "@/lib/contracts/video-job";
import { assertReelBudgetAllowsEstimatedSpend } from "@/lib/cost-policy/assert-reel-budget-allows-estimated-spend";
import { recordReelSpendEvent } from "@/lib/cost-policy/record-reel-spend-event";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { getBrollReferenceStillAssetForClient } from "@/lib/media/get-broll-reference-still-asset-for-client";
import { initializeProviderRegistryFromCatalog } from "@/lib/providers/create-provider-registry";
import { resolveProviderForJob } from "@/lib/providers/resolve-provider-for-job";
import { sanitizeProviderErrorMessage } from "@/lib/providers/normalize-provider-response";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { findForbiddenVideoJobKeys } from "./find-forbidden-keys";
import { videoJobForbiddenFieldsError, videoJobMutationError } from "./errors";
import { enqueueVideoJobPoll } from "./enqueue-video-job-poll";
import { loadReelScriptForVideoJob } from "./load-reel-script-for-video-job";
import { mapVideoJobRow, VIDEO_JOBS_TABLE } from "./video-job-row";

export type CreateBrollVideoJobsOptions = {
  parentJobId?: string;
  attempt?: number;
  operatorClientId?: string;
  jobKind?: "broll_generate" | "broll_retry";
  /**
   * Single-clip recreate for retry — inherits parent still when provided.
   * When set, creates at most one clip (graceful degrade unchanged).
   */
  singleClipRetry?: {
    referenceStillAssetId?: string | null;
  };
};

function isFacelessNeedsBroll(params: {
  visualMode: string;
  modalidad: string;
  brollBeatCount: number;
}): boolean {
  return (
    params.modalidad === "faceless" ||
    params.visualMode === "faceless" ||
    params.brollBeatCount > 0
  );
}

export function buildWanBrollPrompt(params: {
  beatText: string;
}): string {
  const beat = params.beatText.trim().slice(0, 300);
  const wrapped = `Cinematic B-roll. ${WAN_PROMPT_BEAT_OPEN}${beat}${WAN_PROMPT_BEAT_CLOSE}`;
  return wrapped.slice(0, WAN_PROMPT_MAX_CHARS);
}

function resolveBeatTexts(params: {
  needsBroll: boolean;
  brollBeats: string[] | undefined;
  hook: string;
  body: string;
}): string[] {
  const beats = params.brollBeats ?? [];
  if (beats.length > 0) {
    return beats.slice(0, clampWanClipCount(beats.length));
  }
  if (params.needsBroll) {
    return [`${params.hook} ${params.body}`.trim()];
  }
  return [];
}

export async function createBrollVideoJobs(
  rawInput: unknown,
  options?: CreateBrollVideoJobsOptions,
): Promise<CreateBrollVideoJobsResult> {
  try {
    let operator: { id: string; role: "operator" };
    try {
      operator = options?.operatorClientId
        ? { id: options.operatorClientId, role: "operator" }
        : await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return videoJobMutationError(
          error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
        );
      }
      throw error;
    }

    if (findForbiddenVideoJobKeys(rawInput).length > 0) {
      return videoJobForbiddenFieldsError();
    }

    const parsed = createBrollVideoJobsRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      return videoJobMutationError("VALIDATION_ERROR");
    }

    const input = parsed.data;
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

    const brollBeatCount = script.package.brollBeats?.length ?? 0;
    const needsBroll = isFacelessNeedsBroll({
      visualMode: script.visualMode,
      modalidad: script.modalidad,
      brollBeatCount,
    });

    if (!needsBroll) {
      return createBrollVideoJobsSuccessSchema.parse({
        ok: true,
        jobs: [],
        skipped: [],
        createdCount: 0,
        skippedCount: 0,
        skippedNoNeedsBroll: true,
      });
    }

    const beatTexts = resolveBeatTexts({
      needsBroll,
      brollBeats: script.package.brollBeats,
      hook: script.package.hook,
      body: script.package.body,
    });

    const clipCount = options?.singleClipRetry
      ? 1
      : clampWanClipCount(Math.max(1, beatTexts.length));

    const providerResult = await resolveProviderForJob({
      clientId: input.clientId,
      assetRole: "broll",
      productionContext: {
        visualMode: script.visualMode,
        modalidad: script.modalidad,
        hasReferenceLoop: script.hasReferenceLoop,
        needsBroll: true,
        targetDurationSec: clampWanClipDurationSec(5),
        brollClipCount: clipCount,
        ttsCharCount: script.package.voiceoverText.length,
      },
    });

    if (!providerResult.ok) {
      return videoJobMutationError("BROLL_PROVIDER_UNAVAILABLE");
    }

    const providerKey = providerResult.decision.providerKey;
    const providerTier = providerResult.decision.providerTier;

    if (providerKey !== WAN_PROVIDER_KEY || providerTier !== "low") {
      return videoJobMutationError("BROLL_PROVIDER_UNAVAILABLE");
    }

    let referenceStillAssetId =
      options?.singleClipRetry?.referenceStillAssetId ?? null;
    if (!referenceStillAssetId) {
      const still = await getBrollReferenceStillAssetForClient(
        input.clientId,
        input.reelScriptId,
      );
      referenceStillAssetId = still?.assetId ?? null;
    }

    if (!referenceStillAssetId) {
      return videoJobMutationError("BROLL_REFERENCE_STILL_MISSING", {
        messageKey: WAN_REFERENCE_STILL_MISSING_MESSAGE_KEY,
      });
    }

    const registry = await initializeProviderRegistryFromCatalog();
    const adapter = registry.getVideoAdapter(providerKey);

    if (!isSupabaseConfigured()) {
      return videoJobMutationError("INTERNAL_ERROR");
    }

    const supabase = createServerSupabaseClient();
    const jobs: CreateBrollVideoJobCreatedItem[] = [];
    const skipped: CreateBrollVideoJobSkippedItem[] = [];
    const attempt = options?.attempt ?? 1;
    const jobKind = options?.jobKind ?? "broll_generate";
    const durationSec = clampWanClipDurationSec(5);

    for (let i = 0; i < clipCount; i += 1) {
      const beatText = beatTexts[i] ?? beatTexts[0] ?? script.package.hook;
      const prompt = buildWanBrollPrompt({ beatText });

      const resolvedInput = {
        reelScriptId: input.reelScriptId,
        clientId: input.clientId,
        providerKey,
        providerTier,
        assetRole: "broll" as const,
        targetDurationSec: durationSec,
        referenceImageAssetId: referenceStillAssetId,
        portraitAssetId: referenceStillAssetId,
        prompt,
        clipCount: 1,
      };

      let estimateCents = WAN_UNIT_COST_CENTS_PER_CLIP;
      try {
        const estimate = await adapter.estimateCost(resolvedInput);
        estimateCents = estimate.estimatedCostCents;
      } catch {
        skipped.push({
          beatIndex: i,
          reasonCode: "VALIDATION_ERROR",
        });
        continue;
      }

      const budgetResult = await assertReelBudgetAllowsEstimatedSpend({
        clientId: input.clientId,
        reelScriptId: input.reelScriptId,
        estimatedCostCents: estimateCents,
        operatorClientId: operator.id,
        providerTier,
      });

      if (!budgetResult.ok) {
        skipped.push({
          beatIndex: i,
          reasonCode:
            budgetResult.code === "BUDGET_EXCEEDED"
              ? "BUDGET_EXCEEDED"
              : "INTERNAL_ERROR",
          ...(budgetResult.code === "BUDGET_EXCEEDED"
            ? { messageKey: "scripts.videoJob.retry.budgetExceeded" }
            : {}),
        });
        continue;
      }

      try {
        const createResult = await adapter.createJob(resolvedInput);

        const { data: inserted, error: insertError } = await supabase
          .from(VIDEO_JOBS_TABLE)
          .insert({
            client_id: input.clientId,
            reel_script_id: input.reelScriptId,
            provider_key: providerKey,
            provider_tier: providerTier,
            asset_role: "broll",
            external_job_id: createResult.externalJobId,
            status: createResult.status,
            estimated_cost_cents: estimateCents,
            portrait_asset_id: referenceStillAssetId,
            voiceover_asset_id: null,
            parent_job_id: options?.parentJobId ?? null,
            attempt,
            operator_client_id: operator.id,
          })
          .select(
            "id, client_id, reel_script_id, provider_key, provider_tier, asset_role, external_job_id, status, estimated_cost_cents, actual_cost_cents, failure_reason, portrait_asset_id, voiceover_asset_id, output_media_asset_id, parent_job_id, spend_event_id, operator_client_id, attempt, created_at, updated_at",
          )
          .single();

        if (insertError || !inserted) {
          skipped.push({ beatIndex: i, reasonCode: "INTERNAL_ERROR" });
          continue;
        }

        const jobRow = mapVideoJobRow(inserted as Record<string, unknown>);
        if (!jobRow) {
          skipped.push({ beatIndex: i, reasonCode: "INTERNAL_ERROR" });
          continue;
        }

        const { spendEventId } = await recordReelSpendEvent({
          clientId: input.clientId,
          reelScriptId: input.reelScriptId,
          assetRole: "broll",
          jobKind,
          estimatedCostCents: estimateCents,
          actualCostCents: null,
          operatorClientId: operator.id,
          providerKey,
        });

        await supabase
          .from(VIDEO_JOBS_TABLE)
          .update({ spend_event_id: spendEventId })
          .eq("id", jobRow.id);

        enqueueVideoJobPoll(jobRow.id);

        jobs.push({
          jobId: jobRow.id,
          status: createResult.status,
          estimatedCostCents: estimateCents,
          beatIndex: i,
          attempt,
        });
      } catch (error) {
        const sanitized = sanitizeProviderErrorMessage(
          error instanceof Error ? error.message : "Provider request failed",
        );
        console.error("[video-jobs] broll create clip failed", {
          beatIndex: i,
          message: sanitized,
        });
        skipped.push({
          beatIndex: i,
          reasonCode: "INTERNAL_ERROR",
        });
      }
    }

    return createBrollVideoJobsSuccessSchema.parse({
      ok: true,
      jobs,
      skipped,
      createdCount: jobs.length,
      skippedCount: skipped.length,
      skippedNoNeedsBroll: false,
    });
  } catch (error) {
    console.error("[video-jobs] createBrollVideoJobs unexpected error", {
      name: error instanceof Error ? error.name : "unknown",
      message: sanitizeProviderErrorMessage(
        error instanceof Error ? error.message : "unknown",
      ),
    });
    return videoJobMutationError("INTERNAL_ERROR");
  }
}
