import "server-only";

import {
  HEYGEN_FALLBACK_RATIONALE_KEY,
  HEYGEN_HIGH_TIER_RATIONALE_KEY,
  HEYGEN_UNIT_COST_CENTS_PER_SECOND,
} from "@/lib/contracts/heygen-high";
import {
  HEYGEN_FALLBACK_PARENT_PROVIDER_KEYS,
  createHeygenTalkingHeadVideoJobRequestSchema,
  createHeygenTalkingHeadVideoJobSuccessSchema,
  previewHeygenTalkingHeadEstimateRequestSchema,
  previewHeygenTalkingHeadEstimateSuccessSchema,
  type CreateHeygenTalkingHeadVideoJobResult,
  type PreviewHeygenTalkingHeadEstimateSuccess,
} from "@/lib/contracts/video-job";
import { assertReelBudgetAllowsEstimatedSpend } from "@/lib/cost-policy/assert-reel-budget-allows-estimated-spend";
import { logProviderDecision } from "@/lib/cost-policy/log-provider-decision";
import { recordReelSpendEvent } from "@/lib/cost-policy/record-reel-spend-event";
import { getCostPolicyForClient } from "@/lib/cost-policy/get-cost-policy-for-client";
import {
  isAuthGuardError,
  requireOperator,
} from "@/lib/auth/require-user";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";
import { initializeProviderRegistryFromCatalog } from "@/lib/providers/create-provider-registry";
import { assertActiveAvatarConsentForJobs } from "@/lib/visual-preferences/assert-active-avatar-consent-for-jobs";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { findForbiddenVideoJobKeys } from "./find-forbidden-keys";
import { videoJobForbiddenFieldsError, videoJobMutationError } from "./errors";
import { enqueueVideoJobPoll } from "./enqueue-video-job-poll";
import { loadReelScriptForVideoJob } from "./load-reel-script-for-video-job";
import {
  mapVideoJobRow,
  VIDEO_JOB_HEYGEN_FALLBACK_OVERRIDES_TABLE,
  VIDEO_JOBS_TABLE,
} from "./video-job-row";

type EligibilityPath = "high_tier" | "operator_fallback" | "ineligible";

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

async function isHeygenCatalogActive(): Promise<boolean> {
  const catalogResult = await getProviderCatalog();
  if ("loadFailed" in catalogResult && catalogResult.loadFailed) {
    return false;
  }
  const row = catalogResult.providers.find((entry) => entry.key === "heygen_high");
  return !!row?.active;
}

async function loadLatestPrimaryTalkingHeadJob(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<{
  id: string;
  status: string;
  providerKey: string;
} | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("id, status, provider_key")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("asset_role", "primary")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as {
    id: string;
    status: string;
    provider_key: string;
  };
  return {
    id: row.id,
    status: row.status,
    providerKey: row.provider_key,
  };
}

async function resolveEligibility(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<{
  path: EligibilityPath;
  parentJobId: string | null;
  blockedReasonKey?: string;
}> {
  const catalogActive = await isHeygenCatalogActive();
  const policyResult = await getCostPolicyForClient(params.clientId);
  const providerTier =
    policyResult.ok && "policy" in policyResult
      ? policyResult.policy.providerTier
      : "low";

  if (providerTier === "high" && catalogActive) {
    return { path: "high_tier", parentJobId: null };
  }

  const latest = await loadLatestPrimaryTalkingHeadJob(params);
  const parentKeys = HEYGEN_FALLBACK_PARENT_PROVIDER_KEYS as readonly string[];
  if (
    latest &&
    latest.status === "failed" &&
    parentKeys.includes(latest.providerKey)
  ) {
    return { path: "operator_fallback", parentJobId: latest.id };
  }

  if (!catalogActive) {
    return {
      path: "ineligible",
      parentJobId: null,
      blockedReasonKey: "scripts.heygen.blocked.providerUnavailable",
    };
  }

  return {
    path: "ineligible",
    parentJobId: null,
    blockedReasonKey: "scripts.heygen.blocked.ineligible",
  };
}

export async function previewHeygenTalkingHeadEstimate(
  rawInput: unknown,
): Promise<
  PreviewHeygenTalkingHeadEstimateSuccess | ReturnType<typeof videoJobMutationError>
> {
  try {
    await requireOperator("handler");
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

  const parsed = previewHeygenTalkingHeadEstimateRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return videoJobMutationError("VALIDATION_ERROR");
  }

  const script = await loadReelScriptForVideoJob({
    reelScriptId: parsed.data.reelScriptId,
    clientId: parsed.data.clientId,
  });
  if (!script) {
    return videoJobMutationError("NOT_FOUND");
  }

  // Server-authoritative duration from reel package (client value is display-only).
  const durationSec = script.package.targetDurationSec;
  const eligibility = await resolveEligibility({
    clientId: parsed.data.clientId,
    reelScriptId: parsed.data.reelScriptId,
  });

  const registry = await initializeProviderRegistryFromCatalog();
  let adapter;
  try {
    adapter = registry.getVideoAdapter("heygen_high");
  } catch {
    return videoJobMutationError("PROVIDER_UNAVAILABLE");
  }

  const estimate = await adapter.estimateCost({
    reelScriptId: parsed.data.reelScriptId,
    clientId: parsed.data.clientId,
    providerKey: "heygen_high",
    providerTier: "high",
    assetRole: "primary",
    targetDurationSec: durationSec,
  });

  return previewHeygenTalkingHeadEstimateSuccessSchema.parse({
    ok: true,
    estimatedCostCents: estimate.estimatedCostCents,
    unitCostCentsPerSecond: HEYGEN_UNIT_COST_CENTS_PER_SECOND,
    durationSec,
    eligible: eligibility.path !== "ineligible",
    eligibilityPath: eligibility.path,
    ...(eligibility.blockedReasonKey
      ? { blockedReasonKey: eligibility.blockedReasonKey }
      : {}),
  });
}

export async function createHeygenTalkingHeadVideoJob(
  rawInput: unknown,
): Promise<CreateHeygenTalkingHeadVideoJobResult> {
  let operator;
  try {
    operator = await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return videoJobMutationError(
        error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      );
    }
    throw error;
  }

  try {
    if (findForbiddenVideoJobKeys(rawInput).length > 0) {
      return videoJobForbiddenFieldsError();
    }

    const parsed = createHeygenTalkingHeadVideoJobRequestSchema.safeParse(rawInput);
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

    if (script.visualMode === "faceless" || script.modalidad === "faceless") {
      return videoJobMutationError("VALIDATION_ERROR");
    }

    // Server-authoritative duration from reel package — never trust client
    // targetDurationSec for estimateCost / budget (SECURITY anti–gate-bypass).
    const targetDurationSec = script.package.targetDurationSec;

    const eligibility = await resolveEligibility({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
    });
    if (eligibility.path === "ineligible") {
      return videoJobMutationError("HEYGEN_FALLBACK_INELIGIBLE", {
        messageKey:
          eligibility.blockedReasonKey ?? "scripts.heygen.blocked.ineligible",
      });
    }

    const catalogActive = await isHeygenCatalogActive();
    if (!catalogActive) {
      return videoJobMutationError("PROVIDER_UNAVAILABLE");
    }

    const registry = await initializeProviderRegistryFromCatalog();
    let adapter;
    try {
      adapter = registry.getVideoAdapter("heygen_high");
    } catch {
      return videoJobMutationError("PROVIDER_UNAVAILABLE");
    }

    const voiceoverAssetId = input.voiceoverAssetId ?? null;
    if (!voiceoverAssetId) {
      return videoJobMutationError("VALIDATION_ERROR", {
        fields: { voiceoverAssetId: ["REQUIRED"] },
      });
    }

    const isOwnAvatar =
      script.visualMode === "own_avatar" || script.modalidad === "own_avatar";

    let portraitAssetIdForInsert: string | null = null;
    let resolvedInput: Parameters<typeof adapter.createJob>[0];

    if (isOwnAvatar) {
      const portraitAssetId = input.portraitAssetId ?? null;
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
        providerKey: "heygen_high",
        providerTier: "high",
        assetRole: "primary",
        targetDurationSec,
        voiceoverAssetId,
        portraitAssetId,
      };
    } else {
      const avatarId = process.env.HEYGEN_DEFAULT_AVATAR_ID?.trim();
      if (!avatarId) {
        return videoJobMutationError("HEYGEN_CONFIG_MISSING", {
          messageKey: "scripts.heygen.errors.configMissing",
        });
      }

      const voiceoverOwned = await verifyMediaAssetOwned({
        assetId: voiceoverAssetId,
        clientId: input.clientId,
      });
      if (!voiceoverOwned) {
        return videoJobMutationError("NOT_FOUND");
      }

      portraitAssetIdForInsert = null;
      resolvedInput = {
        reelScriptId: input.reelScriptId,
        clientId: input.clientId,
        providerKey: "heygen_high",
        providerTier: "high",
        assetRole: "primary",
        targetDurationSec,
        voiceoverAssetId,
      };
    }

    const estimate = await adapter.estimateCost(resolvedInput);
    // confirmEstimateCents is presentation-only; server estimate is authoritative.

    const budgetResult = await assertReelBudgetAllowsEstimatedSpend({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
      estimatedCostCents: estimate.estimatedCostCents,
      operatorClientId: operator.id,
      providerTier: "high",
    });
    if (!budgetResult.ok) {
      if (budgetResult.code === "BUDGET_EXCEEDED") {
        return videoJobMutationError("BUDGET_EXCEEDED", {
          messageKey: "scripts.heygen.errors.budgetExceeded",
        });
      }
      return videoJobMutationError("INTERNAL_ERROR");
    }

    if (isOwnAvatar) {
      const consent = await assertActiveAvatarConsentForJobs(input.clientId);
      if (!consent.ok) {
        return videoJobMutationError("CONSENT_REVOKED", {
          messageKey: consent.error.messageKey,
        });
      }
    }

    const createResult = await adapter.createJob(resolvedInput);

    if (!isSupabaseConfigured()) {
      return videoJobMutationError("INTERNAL_ERROR");
    }

    const supabase = createServerSupabaseClient();
    const usedOperatorFallback = eligibility.path === "operator_fallback";
    const parentJobId = usedOperatorFallback ? eligibility.parentJobId : null;

    const { data: inserted, error: insertError } = await supabase
      .from(VIDEO_JOBS_TABLE)
      .insert({
        client_id: input.clientId,
        reel_script_id: input.reelScriptId,
        provider_key: "heygen_high",
        provider_tier: "high",
        asset_role: "primary",
        external_job_id: createResult.externalJobId,
        status: createResult.status,
        estimated_cost_cents: estimate.estimatedCostCents,
        portrait_asset_id: portraitAssetIdForInsert,
        voiceover_asset_id: voiceoverAssetId,
        parent_job_id: parentJobId,
        attempt: 1,
        operator_client_id: operator.id,
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

    if (usedOperatorFallback && parentJobId) {
      const { error: overrideError } = await supabase
        .from(VIDEO_JOB_HEYGEN_FALLBACK_OVERRIDES_TABLE)
        .insert({
          client_id: input.clientId,
          reel_script_id: input.reelScriptId,
          parent_job_id: parentJobId,
          new_job_id: jobRow.id,
          operator_client_id: operator.id,
          rationale_key: HEYGEN_FALLBACK_RATIONALE_KEY,
        });
      if (overrideError) {
        // Vendor job + DB row already exist — compensate so we do not leave a
        // queued job without spend/poll (QA M2). Mark failed; skip spend+poll.
        console.error("[video-jobs] heygen fallback override insert failed", {
          jobId: jobRow.id,
          parentJobId,
          message:
            overrideError instanceof Error
              ? overrideError.message
              : typeof overrideError === "object" &&
                  overrideError &&
                  "message" in overrideError
                ? String((overrideError as { message: unknown }).message)
                : "unknown",
        });
        await supabase
          .from(VIDEO_JOBS_TABLE)
          .update({
            status: "failed",
            failure_reason: "heygen_fallback_audit_failed",
          })
          .eq("id", jobRow.id);
        return videoJobMutationError("INTERNAL_ERROR");
      }
    }

    const rationaleKey = usedOperatorFallback
      ? HEYGEN_FALLBACK_RATIONALE_KEY
      : HEYGEN_HIGH_TIER_RATIONALE_KEY;

    await logProviderDecision({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
      jobKind: "talking_head_generate",
      assetRole: "talking_head",
      providerTier: "high",
      providerKey: "heygen_high",
      estimatedCostCents: estimate.estimatedCostCents,
      rationaleKey,
      operatorClientId: operator.id,
    });

    const { spendEventId } = await recordReelSpendEvent({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
      assetRole: "talking_head",
      jobKind: "talking_head_generate",
      estimatedCostCents: estimate.estimatedCostCents,
      actualCostCents: null,
      operatorClientId: operator.id,
      providerKey: "heygen_high",
    });

    await supabase
      .from(VIDEO_JOBS_TABLE)
      .update({ spend_event_id: spendEventId })
      .eq("id", jobRow.id);

    enqueueVideoJobPoll(jobRow.id);

    return createHeygenTalkingHeadVideoJobSuccessSchema.parse({
      ok: true,
      jobId: jobRow.id,
      status: createResult.status,
      estimatedCostCents: estimate.estimatedCostCents,
      attempt: 1,
      usedOperatorFallback,
    });
  } catch (error) {
    console.error("[video-jobs] heygen create unexpected error", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return videoJobMutationError("INTERNAL_ERROR");
  }
}
