import "server-only";

import {
  AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY,
  AI_GATEWAY_HEYGEN_UNIT_COST_CENTS_PER_SECOND,
} from "@/lib/contracts/ai-gateway-video";
import { resolveAvatarRequestDurationSec } from "@/lib/video-jobs/resolve-avatar-request-duration-sec";
import { planAvatarVoiceoverSegments } from "@/lib/video-jobs/plan-avatar-voiceover-segments";
import { materializeAvatarSegmentVoiceovers } from "@/lib/video-jobs/materialize-avatar-segment-voiceovers";
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
  VIDEO_JOB_SELECT_COLUMNS,
  VIDEO_JOBS_TABLE,
} from "./video-job-row";

type EligibilityPath = "high_tier" | "operator_fallback" | "ineligible";

const LEGACY_HEYGEN_PROVIDER_KEY = "heygen_high" as const;

type HeygenAvatarProviderKey =
  | typeof AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY
  | typeof LEGACY_HEYGEN_PROVIDER_KEY;

async function resolveHeygenAvatarProviderKey(): Promise<HeygenAvatarProviderKey | null> {
  const catalogResult = await getProviderCatalog();
  if ("loadFailed" in catalogResult && catalogResult.loadFailed) {
    return null;
  }
  // Prefer DIRECT heygen_high when active + HEYGEN_API_KEY present; Gateway fallback.
  const direct = catalogResult.providers.find(
    (entry) => entry.key === LEGACY_HEYGEN_PROVIDER_KEY && entry.active,
  );
  const hasDirectKey =
    typeof process.env.HEYGEN_API_KEY === "string" &&
    process.env.HEYGEN_API_KEY.trim().length > 0;
  if (direct && hasDirectKey) {
    return LEGACY_HEYGEN_PROVIDER_KEY;
  }
  const gateway = catalogResult.providers.find(
    (entry) => entry.key === AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY && entry.active,
  );
  if (gateway) {
    return AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY;
  }
  // Direct catalog row active but key missing → still surface as unavailable
  // only after Gateway also missing.
  return direct ? LEGACY_HEYGEN_PROVIDER_KEY : null;
}

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

async function loadOwnedVoiceoverDurationSec(params: {
  assetId: string;
  clientId: string;
}): Promise<number | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_media_assets")
    .select("metadata")
    .eq("id", params.assetId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const metadata = (data as { metadata?: unknown }).metadata;
  if (
    metadata &&
    typeof metadata === "object" &&
    metadata !== null &&
    "durationSec" in metadata
  ) {
    const durationSec = (metadata as { durationSec?: unknown }).durationSec;
    if (typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0) {
      return durationSec;
    }
  }
  return null;
}

async function isHeygenCatalogActive(): Promise<boolean> {
  return (await resolveHeygenAvatarProviderKey()) != null;
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

  const providerKey = await resolveHeygenAvatarProviderKey();
  if (!providerKey) {
    return videoJobMutationError("PROVIDER_UNAVAILABLE");
  }

  const registry = await initializeProviderRegistryFromCatalog();
  let adapter;
  try {
    adapter = registry.getVideoAdapter(providerKey);
  } catch {
    return videoJobMutationError("PROVIDER_UNAVAILABLE");
  }

  const estimate = await adapter.estimateCost({
    reelScriptId: parsed.data.reelScriptId,
    clientId: parsed.data.clientId,
    providerKey,
    providerTier: "high",
    assetRole: "primary",
    targetDurationSec: durationSec,
  });

  const unitCostCentsPerSecond =
    providerKey === AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY
      ? AI_GATEWAY_HEYGEN_UNIT_COST_CENTS_PER_SECOND
      : HEYGEN_UNIT_COST_CENTS_PER_SECOND;

  return previewHeygenTalkingHeadEstimateSuccessSchema.parse({
    ok: true,
    estimatedCostCents: estimate.estimatedCostCents,
    unitCostCentsPerSecond,
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

    // Prefer TTS duration for Gateway/HeyGen request length so lip-sync
    // matches our ElevenLabs track. Fall back to script target when unknown.
    // Never trust client targetDurationSec for estimateCost / budget.
    const scriptTargetDurationSec = script.package.targetDurationSec;

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

    const providerKey = await resolveHeygenAvatarProviderKey();
    if (!providerKey) {
      return videoJobMutationError("PROVIDER_UNAVAILABLE");
    }

    const registry = await initializeProviderRegistryFromCatalog();
    let adapter;
    try {
      adapter = registry.getVideoAdapter(providerKey);
    } catch {
      return videoJobMutationError("PROVIDER_UNAVAILABLE");
    }

    const voiceoverAssetId = input.voiceoverAssetId ?? null;
    if (!voiceoverAssetId) {
      return videoJobMutationError("VALIDATION_ERROR", {
        fields: { voiceoverAssetId: ["REQUIRED"] },
      });
    }

    const voiceoverDurationSec = await loadOwnedVoiceoverDurationSec({
      assetId: voiceoverAssetId,
      clientId: input.clientId,
    });
    // Prefer VO length; segments further ceil per-slice for the provider request.
    const plannedSegments = planAvatarVoiceoverSegments({
      voiceoverText: script.package.voiceoverText,
      totalDurationSec:
        voiceoverDurationSec ??
        resolveAvatarRequestDurationSec({
          voiceoverDurationSec,
          scriptTargetDurationSec,
        }),
    });
    // V1 create path: one job for the first (or only) segment covering the
    // full VO when a single segment is planned. Multi-segment enqueue creates
    // one job per planned slice; each uses requestDurationSec = ceil(audio).
    const primarySegment = plannedSegments[0]!;
    const targetDurationSec = primarySegment.requestDurationSec;

    const isOwnAvatar =
      script.visualMode === "own_avatar" || script.modalidad === "own_avatar";
    const usesGatewayAvatar =
      providerKey === AI_GATEWAY_HEYGEN_AVATAR_PROVIDER_KEY;

    let portraitAssetIdForInsert: string | null = null;
    let resolvedInput: Parameters<typeof adapter.createJob>[0];

    if (isOwnAvatar || usesGatewayAvatar) {
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
        providerKey,
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
        providerKey,
        providerTier: "high",
        assetRole: "primary",
        targetDurationSec,
        voiceoverAssetId,
      };
    }

    // Budget against the sum of planned segment request durations.
    let totalEstimatedCostCents = 0;
    for (const segment of plannedSegments) {
      const segmentEstimate = await adapter.estimateCost({
        ...resolvedInput,
        targetDurationSec: segment.requestDurationSec,
      });
      totalEstimatedCostCents += segmentEstimate.estimatedCostCents;
    }

    const budgetResult = await assertReelBudgetAllowsEstimatedSpend({
      clientId: input.clientId,
      reelScriptId: input.reelScriptId,
      estimatedCostCents: totalEstimatedCostCents,
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

    if (!isSupabaseConfigured()) {
      return videoJobMutationError("INTERNAL_ERROR");
    }

    const supabase = createServerSupabaseClient();
    const usedOperatorFallback = eligibility.path === "operator_fallback";
    const parentJobId = usedOperatorFallback ? eligibility.parentJobId : null;

    let materializedSegments;
    try {
      materializedSegments = await materializeAvatarSegmentVoiceovers({
        clientId: input.clientId,
        reelScriptId: input.reelScriptId,
        fullVoiceoverAssetId: voiceoverAssetId,
        segments: plannedSegments,
      });
    } catch (error) {
      console.error("[video-jobs] avatar segment voiceover materialize failed", {
        name: error instanceof Error ? error.name : "unknown",
      });
      return videoJobMutationError("INTERNAL_ERROR");
    }

    let firstJobId: string | null = null;
    let firstStatus = "queued";
    let jobsEstimated = 0;

    for (const segment of materializedSegments) {
      const segmentInput = {
        ...resolvedInput,
        // Audio-driven Direct path follows uploaded audio length; gateway clamps 5–15.
        // Always request ceil(segment audio) so lip-sync length follows VO slice.
        targetDurationSec: segment.requestDurationSec,
        voiceoverAssetId: segment.voiceoverAssetId,
      };
      const createResult = await adapter.createJob(segmentInput);
      const segmentEstimate = await adapter.estimateCost(segmentInput);
      jobsEstimated += segmentEstimate.estimatedCostCents;

      const { data: inserted, error: insertError } = await supabase
        .from(VIDEO_JOBS_TABLE)
        .insert({
          client_id: input.clientId,
          reel_script_id: input.reelScriptId,
          provider_key: providerKey,
          provider_tier: "high",
          asset_role: "primary",
          external_job_id: createResult.externalJobId,
          status: createResult.status,
          estimated_cost_cents: segmentEstimate.estimatedCostCents,
          portrait_asset_id: portraitAssetIdForInsert,
          voiceover_asset_id: segment.voiceoverAssetId,
          parent_job_id: parentJobId,
          attempt: 1,
          operator_client_id: operator.id,
          segment_index: segment.index,
          segment_start_sec: segment.startSec,
          segment_duration_sec: segment.durationSec,
        })
        .select(VIDEO_JOB_SELECT_COLUMNS)
        .single();

      if (insertError || !inserted) {
        return videoJobMutationError("INTERNAL_ERROR");
      }

      const jobRow = mapVideoJobRow(inserted as Record<string, unknown>);
      if (!jobRow) {
        return videoJobMutationError("INTERNAL_ERROR");
      }

      if (firstJobId === null) {
        firstJobId = jobRow.id;
        firstStatus = createResult.status;
      }

      if (usedOperatorFallback && parentJobId && segment.index === 0) {
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
          console.error("[video-jobs] heygen fallback override insert failed", {
            jobId: jobRow.id,
            parentJobId,
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
        providerKey,
        estimatedCostCents: segmentEstimate.estimatedCostCents,
        rationaleKey,
        operatorClientId: operator.id,
      });

      const { spendEventId } = await recordReelSpendEvent({
        clientId: input.clientId,
        reelScriptId: input.reelScriptId,
        assetRole: "talking_head",
        jobKind: "talking_head_generate",
        estimatedCostCents: segmentEstimate.estimatedCostCents,
        actualCostCents: null,
        operatorClientId: operator.id,
        providerKey,
      });

      await supabase
        .from(VIDEO_JOBS_TABLE)
        .update({ spend_event_id: spendEventId })
        .eq("id", jobRow.id);

      enqueueVideoJobPoll(jobRow.id);
    }

    if (!firstJobId) {
      return videoJobMutationError("INTERNAL_ERROR");
    }

    return createHeygenTalkingHeadVideoJobSuccessSchema.parse({
      ok: true,
      jobId: firstJobId,
      status: firstStatus,
      estimatedCostCents: jobsEstimated,
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
