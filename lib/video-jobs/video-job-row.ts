import "server-only";

import type { ProviderTier, VideoJobStatus } from "@/lib/contracts/providers";

export type VideoJobRow = {
  id: string;
  clientId: string;
  reelScriptId: string;
  providerKey: string;
  providerTier: ProviderTier;
  assetRole: "primary" | "broll";
  externalJobId: string;
  status: VideoJobStatus;
  estimatedCostCents: number;
  actualCostCents: number | null;
  failureReason: string | null;
  portraitAssetId: string | null;
  voiceoverAssetId: string | null;
  outputMediaAssetId: string | null;
  parentJobId: string | null;
  spendEventId: string | null;
  attempt: number;
  createdAt: string;
  updatedAt: string;
};

const VIDEO_JOB_SELECT =
  "id, client_id, reel_script_id, provider_key, provider_tier, asset_role, external_job_id, status, estimated_cost_cents, actual_cost_cents, failure_reason, portrait_asset_id, voiceover_asset_id, output_media_asset_id, parent_job_id, spend_event_id, attempt, created_at, updated_at";

export const VIDEO_JOB_SELECT_COLUMNS = VIDEO_JOB_SELECT;

export const VIDEO_JOBS_TABLE = "neuramark_video_jobs" as const;
export const VIDEO_JOB_RETRY_OVERRIDES_TABLE =
  "neuramark_video_job_retry_overrides" as const;

export function mapVideoJobRow(raw: Record<string, unknown>): VideoJobRow | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.client_id !== "string" ||
    typeof raw.reel_script_id !== "string" ||
    typeof raw.provider_key !== "string" ||
    typeof raw.provider_tier !== "string" ||
    typeof raw.asset_role !== "string" ||
    typeof raw.external_job_id !== "string" ||
    typeof raw.status !== "string" ||
    typeof raw.estimated_cost_cents !== "number" ||
    typeof raw.attempt !== "number" ||
    typeof raw.created_at !== "string" ||
    typeof raw.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    clientId: raw.client_id,
    reelScriptId: raw.reel_script_id,
    providerKey: raw.provider_key,
    providerTier: raw.provider_tier as ProviderTier,
    assetRole: raw.asset_role as "primary" | "broll",
    externalJobId: raw.external_job_id,
    status: raw.status as VideoJobStatus,
    estimatedCostCents: raw.estimated_cost_cents,
    actualCostCents:
      typeof raw.actual_cost_cents === "number" ? raw.actual_cost_cents : null,
    failureReason:
      typeof raw.failure_reason === "string" ? raw.failure_reason : null,
    portraitAssetId:
      typeof raw.portrait_asset_id === "string" ? raw.portrait_asset_id : null,
    voiceoverAssetId:
      typeof raw.voiceover_asset_id === "string" ? raw.voiceover_asset_id : null,
    outputMediaAssetId:
      typeof raw.output_media_asset_id === "string"
        ? raw.output_media_asset_id
        : null,
    parentJobId:
      typeof raw.parent_job_id === "string" ? raw.parent_job_id : null,
    spendEventId:
      typeof raw.spend_event_id === "string" ? raw.spend_event_id : null,
    attempt: raw.attempt,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}
