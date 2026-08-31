import "server-only";

import { randomUUID } from "node:crypto";

type BrandingConfigSnapshot = {
  subtitlesEnabled: boolean;
  logoEnabled: boolean;
  coverFrameSec: number;
  subtitleBeatCount: number;
  subtitleSourceHash: string;
  voiceoverTimingHash: string;
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
  /**
   * Raw `branding_config.voiceoverTimingHash` before soft-default.
   * `undefined` = key absent (Phase A legacy → skip VO-hash re-check).
   * Used by Phase B-M1 worker guard — do not use soft-defaulted snapshot field.
   */
  rawVoiceoverTimingHash: string | null | undefined;
  brandingFingerprint: string | null;
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
  "branding_fingerprint",
  "failure_reason",
  "cover_media_asset_id",
  "updated_at",
].join(", ");

export const BRANDING_JOB_SELECT_COLUMNS = BRANDING_JOB_SELECT;
export const BRANDING_JOBS_TABLE = "neuramark_assembled_reels" as const;

const EMPTY_VOICEOVER_TIMING_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** Phase B-M1: 64 lowercase hex sha256. */
export const VOICEOVER_TIMING_HASH_HEX_RE = /^[0-9a-f]{64}$/;

/**
 * Read raw `voiceoverTimingHash` from branding_config JSON before soft-default.
 * - `undefined` — key absent
 * - `null` — explicit null
 * - `string` — stored value (may be empty, valid hex, or malformed)
 * - non-string present → string that fails hex regex (malformed → fail CONFIG)
 */
export function readRawVoiceoverTimingHash(
  brandingConfig: unknown,
): string | null | undefined {
  if (!brandingConfig || typeof brandingConfig !== "object") {
    return undefined;
  }
  if (!("voiceoverTimingHash" in brandingConfig)) {
    return undefined;
  }
  const value = (brandingConfig as Record<string, unknown>).voiceoverTimingHash;
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  // Non-string present: coerce to a non-hex sentinel so guard fails CONFIG.
  return typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "__malformed_voiceover_timing_hash__";
}

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
  const voiceoverTimingHash =
    typeof row.voiceoverTimingHash === "string" &&
    VOICEOVER_TIMING_HASH_HEX_RE.test(row.voiceoverTimingHash)
      ? row.voiceoverTimingHash
      : EMPTY_VOICEOVER_TIMING_HASH;
  return {
    subtitlesEnabled: row.subtitlesEnabled,
    logoEnabled: row.logoEnabled,
    coverFrameSec: row.coverFrameSec,
    subtitleBeatCount: row.subtitleBeatCount,
    subtitleSourceHash: row.subtitleSourceHash,
    voiceoverTimingHash,
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
    rawVoiceoverTimingHash: readRawVoiceoverTimingHash(raw.branding_config),
    brandingFingerprint:
      typeof raw.branding_fingerprint === "string"
        ? raw.branding_fingerprint
        : null,
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
