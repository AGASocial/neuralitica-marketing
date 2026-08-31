import "server-only";

import {
  clampLtxClipDurationSec,
  isAllowedBrollProviderPair,
  LTX_PROVIDER_KEY,
  LTX_UNIT_COST_CENTS_PER_CLIP,
} from "@/lib/contracts/ltx-broll-high";
import {
  clampWanClipCount,
  clampWanClipDurationSec,
  WAN_PROVIDER_KEY,
  WAN_UNIT_COST_CENTS_PER_CLIP,
} from "@/lib/contracts/siliconflow-wan21-turbo";
import type { PreviewBrollVideoJobsEstimateSuccess } from "@/lib/contracts/video-job";
import { assertReelBudgetAllowsEstimatedSpend } from "@/lib/cost-policy/assert-reel-budget-allows-estimated-spend";
import { getBrollReferenceStillAssetForClient } from "@/lib/media/get-broll-reference-still-asset-for-client";
import { initializeProviderRegistryFromCatalog } from "@/lib/providers/create-provider-registry";
import { resolveProviderForJob } from "@/lib/providers/resolve-provider-for-job";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import type { ReelScriptForVideoJob } from "./load-reel-script-for-video-job";
import { VIDEO_JOBS_TABLE } from "./video-job-row";

export const BROLL_BLOCKED_JOB_IN_FLIGHT = "scripts.broll.blocked.jobInFlight" as const;
export const BROLL_BLOCKED_REFERENCE_STILL_MISSING =
  "scripts.broll.blocked.referenceStillMissing" as const;
export const BROLL_BLOCKED_PROVIDER_UNAVAILABLE =
  "scripts.broll.blocked.providerUnavailable" as const;
export const BROLL_BLOCKED_BUDGET_EXCEEDED =
  "scripts.broll.blocked.budgetExceeded" as const;

export function isFacelessNeedsBroll(params: {
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

export function resolveBeatTexts(params: {
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

export function computeBrollClipCount(params: {
  needsBroll: boolean;
  brollBeats: string[] | undefined;
  hook: string;
  body: string;
}): number {
  if (!params.needsBroll) {
    return 0;
  }
  const beatTexts = resolveBeatTexts(params);
  return clampWanClipCount(Math.max(1, beatTexts.length));
}

function blockedPreviewEstimate(
  needsBroll: boolean,
  blockedReasonKey: string,
): Omit<PreviewBrollVideoJobsEstimateSuccess, "ok"> {
  return {
    estimatedCostCents: 0,
    unitCostCentsPerClip: 0,
    clipCount: 0,
    needsBroll,
    blockedReasonKey,
  };
}

export async function hasBrollJobInFlight(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("id")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("asset_role", "broll")
    .in("status", ["queued", "processing"])
    .limit(1);

  if (error) {
    return false;
  }

  return (data?.length ?? 0) > 0;
}

export async function estimateBrollVideoJobsPreview(params: {
  script: ReelScriptForVideoJob;
  clientId: string;
  reelScriptId: string;
  operatorClientId: string;
}): Promise<Omit<PreviewBrollVideoJobsEstimateSuccess, "ok">> {
  const brollBeatCount = params.script.package.brollBeats?.length ?? 0;
  const needsBroll = isFacelessNeedsBroll({
    visualMode: params.script.visualMode,
    modalidad: params.script.modalidad,
    brollBeatCount,
  });

  if (!needsBroll) {
    return {
      estimatedCostCents: 0,
      unitCostCentsPerClip: 0,
      clipCount: 0,
      needsBroll: false,
    };
  }

  const clipCount = computeBrollClipCount({
    needsBroll,
    brollBeats: params.script.package.brollBeats,
    hook: params.script.package.hook,
    body: params.script.package.body,
  });

  const providerResult = await resolveProviderForJob({
    clientId: params.clientId,
    assetRole: "broll",
    productionContext: {
      visualMode: params.script.visualMode,
      modalidad: params.script.modalidad,
      hasReferenceLoop: params.script.hasReferenceLoop,
      needsBroll: true,
      targetDurationSec: clampWanClipDurationSec(5),
      brollClipCount: clipCount,
      ttsCharCount: params.script.package.voiceoverText.length,
    },
  });

  if (!providerResult.ok) {
    return blockedPreviewEstimate(true, BROLL_BLOCKED_PROVIDER_UNAVAILABLE);
  }

  const providerKey = providerResult.decision.providerKey;
  const providerTier = providerResult.decision.providerTier;

  if (!isAllowedBrollProviderPair(providerKey, providerTier)) {
    return blockedPreviewEstimate(true, BROLL_BLOCKED_PROVIDER_UNAVAILABLE);
  }

  const still = await getBrollReferenceStillAssetForClient(
    params.clientId,
    params.reelScriptId,
  );
  if (!still?.assetId) {
    return blockedPreviewEstimate(true, BROLL_BLOCKED_REFERENCE_STILL_MISSING);
  }

  let unitCostCentsPerClip =
    providerKey === LTX_PROVIDER_KEY
      ? LTX_UNIT_COST_CENTS_PER_CLIP
      : WAN_UNIT_COST_CENTS_PER_CLIP;

  try {
    const registry = await initializeProviderRegistryFromCatalog();
    const adapter = registry.getVideoAdapter(providerKey);
    const durationSec =
      providerKey === LTX_PROVIDER_KEY
        ? clampLtxClipDurationSec(5)
        : clampWanClipDurationSec(5);

    const estimate = await adapter.estimateCost({
      reelScriptId: params.reelScriptId,
      clientId: params.clientId,
      providerKey,
      providerTier,
      assetRole: "broll",
      targetDurationSec: durationSec,
      referenceImageAssetId: still.assetId,
      portraitAssetId: still.assetId,
      clipCount: 1,
    });
    unitCostCentsPerClip = estimate.estimatedCostCents;
  } catch {
    return blockedPreviewEstimate(true, BROLL_BLOCKED_PROVIDER_UNAVAILABLE);
  }

  const budgetResult = await assertReelBudgetAllowsEstimatedSpend({
    clientId: params.clientId,
    reelScriptId: params.reelScriptId,
    estimatedCostCents: unitCostCentsPerClip,
    operatorClientId: params.operatorClientId,
    providerTier,
  });

  if (!budgetResult.ok) {
    if (budgetResult.code === "BUDGET_EXCEEDED") {
      return blockedPreviewEstimate(true, BROLL_BLOCKED_BUDGET_EXCEEDED);
    }
    return blockedPreviewEstimate(true, BROLL_BLOCKED_PROVIDER_UNAVAILABLE);
  }

  const resolvedProviderKey =
    providerKey === LTX_PROVIDER_KEY ? LTX_PROVIDER_KEY : WAN_PROVIDER_KEY;

  return {
    estimatedCostCents: unitCostCentsPerClip * clipCount,
    unitCostCentsPerClip,
    clipCount,
    needsBroll: true,
    providerKey: resolvedProviderKey,
  };
}
