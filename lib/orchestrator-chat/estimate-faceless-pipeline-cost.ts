import "server-only";

import { estimateTtsCostCentsFromTextLength } from "@/lib/orchestrator-chat/estimate-tts-cost";
import { findLatestVoiceoverAssetId } from "@/lib/tts/get-voiceover-summaries-for-reel-scripts";
import { previewBrollVideoJobsEstimate } from "@/lib/video-jobs/actions/preview-broll-video-jobs-estimate";

export type FacelessPipelineCostEstimate =
  | {
      ok: true;
      estimatedCostCents: number;
      brollCostCents: number;
      ttsCostCents: number;
      clipCount: number;
      voiceoverAlreadyExists: boolean;
      blockedReasonKey?: string;
    }
  | { ok: false; error: "ESTIMATE_FAILED" | "BLOCKED" };

/**
 * Live total for faceless chat cost card: b-roll × N + TTS (TTS omitted when
 * a voiceover asset already exists for the script).
 */
export async function estimateFacelessPipelineCost(params: {
  reelScriptId: string;
  clientId: string;
  voiceoverTextLength: number;
}): Promise<FacelessPipelineCostEstimate> {
  const preview = await previewBrollVideoJobsEstimate({
    reelScriptId: params.reelScriptId,
    clientId: params.clientId,
  });
  if (!preview.ok) {
    return { ok: false, error: "ESTIMATE_FAILED" };
  }
  if (
    "blockedReasonKey" in preview &&
    preview.blockedReasonKey !== undefined
  ) {
    return {
      ok: true,
      estimatedCostCents: 0,
      brollCostCents: 0,
      ttsCostCents: 0,
      clipCount: 0,
      voiceoverAlreadyExists: false,
      blockedReasonKey: preview.blockedReasonKey,
    };
  }

  const existingVoiceoverId = await findLatestVoiceoverAssetId({
    clientId: params.clientId,
    reelScriptId: params.reelScriptId,
  });
  const voiceoverAlreadyExists = existingVoiceoverId !== null;
  const ttsCostCents = voiceoverAlreadyExists
    ? 0
    : estimateTtsCostCentsFromTextLength(params.voiceoverTextLength);
  const brollCostCents = preview.estimatedCostCents;

  return {
    ok: true,
    estimatedCostCents: brollCostCents + ttsCostCents,
    brollCostCents,
    ttsCostCents,
    clipCount: preview.clipCount,
    voiceoverAlreadyExists,
  };
}
