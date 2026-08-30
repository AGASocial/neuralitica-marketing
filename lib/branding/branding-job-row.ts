import "server-only";

import { randomUUID } from "node:crypto";

type BrandingConfigSnapshot = {
  subtitlesEnabled: boolean;
  logoEnabled: boolean;
  coverFrameSec: number;
  subtitleBeatCount: number;
  subtitleSourceHash: string;
};

type BrandingStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";

export type BrandingJobStatus = BrandingStatus;

export type BrandingJobRow = {
  id: string;
  clientId: string;
  reelScriptId: string;
  status: string;
  outputMediaAssetId: string | null;
  preBrandingOutputMediaAssetId: string | null;
  targetDurationSec: number;
  brandingStatus: BrandingStatus | null;
  brandingConfig: BrandingConfigSnapshot | null;
  brandingFailureReason: string | null;
  coverMediaAssetId: string | null;
  updatedAt: string;
};

const BRANDING_JOB_SELECT = [
  "id",
  "client_id",
  "reel_script_id",
  "status",
  "output_media_asset_id",
  "pre_branding_output_media_asset_id",
  "target_duration_sec",
  "branding_status",
  "branding_config",
  "failure_reason",
  "cover_media_asset_id",
  "updated_at",
].join(", ");

export const BRANDING_JOB_SELECT_COLUMNS = BRANDING_JOB_SELECT;
export const BRANDING_JOBS_TABLE = "neuramark_assembled_reels" as const;

function parseBrandingConfig(raw: unknown): BrandingConfigSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  if (
    typeof row.subtitlesEnabled !== "boolean" ||
    typeof row.logoEnabled !== "boolean" ||
    typeof row.coverFrameSec !== "number" ||
    typeof row.subtitleBeatCount !== "number" ||
    typeof row.subtitleSourceHash !== "string" ||
    row.subtitleSourceHash.length !== 64
  ) {
    return null;
  }
  return {
    subtitlesEnabled: row.subtitlesEnabled,
    logoEnabled: row.logoEnabled,
    coverFrameSec: row.coverFrameSec,
    subtitleBeatCount: row.subtitleBeatCount,
    subtitleSourceHash: row.subtitleSourceHash,
  };
}

export function mapBrandingJobRow(
  raw: Record<string, unknown>,
): BrandingJobRow | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.client_id !== "string" ||
    typeof raw.reel_script_id !== "string" ||
    typeof raw.status !== "string" ||
    typeof raw.target_duration_sec !== "number" ||
    typeof raw.updated_at !== "string"
  ) {
    return null;
  }

  const brandingStatusRaw = raw.branding_status;
  const brandingStatus =
    brandingStatusRaw === null || brandingStatusRaw === undefined
      ? null
      : typeof brandingStatusRaw === "string"
        ? (brandingStatusRaw as BrandingStatus)
        : null;

  return {
    id: raw.id,
    clientId: raw.client_id,
    reelScriptId: raw.reel_script_id,
    status: raw.status,
    outputMediaAssetId:
      typeof raw.output_media_asset_id === "string"
        ? raw.output_media_asset_id
        : null,
    preBrandingOutputMediaAssetId:
      typeof raw.pre_branding_output_media_asset_id === "string"
        ? raw.pre_branding_output_media_asset_id
        : null,
    targetDurationSec: raw.target_duration_sec,
    brandingStatus,
    brandingConfig: parseBrandingConfig(raw.branding_config),
    brandingFailureReason:
      typeof raw.failure_reason === "string" ? raw.failure_reason : null,
    coverMediaAssetId:
      typeof raw.cover_media_asset_id === "string"
        ? raw.cover_media_asset_id
        : null,
    updatedAt: raw.updated_at,
  };
}

export function isTerminalBrandingStatus(
  status: BrandingStatus | null,
): boolean {
  return status === "completed" || status === "failed" || status === "skipped";
}

export function generateBrandedReelStorageKey(params: {
  clientId: string;
  reelScriptId: string;
}): string {
  return `neuramark/${params.clientId}/${params.reelScriptId}/branded-${randomUUID()}.mp4`;
}

export function generateCoverFrameStorageKey(params: {
  clientId: string;
}): string {
  return `neuramark/${params.clientId}/cover-${randomUUID()}.jpg`;
}
