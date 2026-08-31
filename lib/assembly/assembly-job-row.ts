import "server-only";

import type { AssemblyJobStatus, AssemblyPathTag } from "@/lib/contracts/assembly-job";
import {
  ASSEMBLY_PATH_TAG_BROLL_STITCH,
  ASSEMBLY_PATH_TAG_PRIMARY,
  ASSEMBLY_TEMPLATE_REEL_V1_BASIC,
} from "@/lib/contracts/assembly-job";
import type {
  BrandingConfigSnapshot,
  BrandingJobStatus,
} from "@/lib/contracts/branding-job";
import { brandingConfigSnapshotSchema } from "@/lib/contracts/branding-job";

export type AssemblyJobRow = {
  id: string;
  clientId: string;
  reelScriptId: string;
  templateId: typeof ASSEMBLY_TEMPLATE_REEL_V1_BASIC;
  status: AssemblyJobStatus;
  primaryVideoAssetId: string | null;
  voiceoverAssetId: string | null;
  brollAssetIds: string[];
  assemblyPathTag: AssemblyPathTag;
  outputMediaAssetId: string | null;
  scriptUpdatedAt: string;
  inputFingerprint: string;
  targetDurationSec: number;
  actualDurationSec: number | null;
  failureReason: string | null;
  brandingStatus: BrandingJobStatus | null;
  brandingConfig: BrandingConfigSnapshot | null;
  brandingFingerprint: string | null;
  preBrandingOutputMediaAssetId: string | null;
  coverMediaAssetId: string | null;
  createdAt: string;
  updatedAt: string;
};

const ASSEMBLY_JOB_SELECT =
  "id, client_id, reel_script_id, template_id, status, primary_video_asset_id, voiceover_asset_id, broll_asset_ids, assembly_path_tag, output_media_asset_id, script_updated_at, input_fingerprint, target_duration_sec, actual_duration_sec, failure_reason, branding_status, branding_config, branding_fingerprint, pre_branding_output_media_asset_id, cover_media_asset_id, created_at, updated_at";

export const ASSEMBLY_JOB_SELECT_COLUMNS = ASSEMBLY_JOB_SELECT;

export const ASSEMBLY_JOBS_TABLE = "neuramark_assembled_reels" as const;

function parseBrollAssetIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((id): id is string => typeof id === "string");
}

function parseAssemblyPathTag(raw: unknown): AssemblyPathTag {
  if (raw === ASSEMBLY_PATH_TAG_BROLL_STITCH) {
    return ASSEMBLY_PATH_TAG_BROLL_STITCH;
  }
  return ASSEMBLY_PATH_TAG_PRIMARY;
}

export function mapAssemblyJobRow(
  raw: Record<string, unknown>,
): AssemblyJobRow | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.client_id !== "string" ||
    typeof raw.reel_script_id !== "string" ||
    typeof raw.template_id !== "string" ||
    typeof raw.status !== "string" ||
    typeof raw.script_updated_at !== "string" ||
    typeof raw.input_fingerprint !== "string" ||
    typeof raw.target_duration_sec !== "number" ||
    typeof raw.created_at !== "string" ||
    typeof raw.updated_at !== "string"
  ) {
    return null;
  }

  if (raw.template_id !== ASSEMBLY_TEMPLATE_REEL_V1_BASIC) {
    return null;
  }

  const assemblyPathTag = parseAssemblyPathTag(raw.assembly_path_tag);
  const primaryVideoAssetId =
    typeof raw.primary_video_asset_id === "string"
      ? raw.primary_video_asset_id
      : null;
  const brollAssetIds = parseBrollAssetIds(raw.broll_asset_ids);

  if (assemblyPathTag === ASSEMBLY_PATH_TAG_PRIMARY && !primaryVideoAssetId) {
    return null;
  }
  if (
    assemblyPathTag === ASSEMBLY_PATH_TAG_BROLL_STITCH &&
    (brollAssetIds.length < 1 || brollAssetIds.length > 8)
  ) {
    return null;
  }

  let brandingConfig: BrandingConfigSnapshot | null = null;
  if (raw.branding_config != null) {
    const parsed = brandingConfigSnapshotSchema.safeParse(raw.branding_config);
    if (parsed.success) {
      brandingConfig = parsed.data;
    } else if (
      raw.branding_config &&
      typeof raw.branding_config === "object" &&
      !Array.isArray(raw.branding_config)
    ) {
      // Phase A rows may omit voiceoverTimingHash — soft-default empty VO hash.
      const legacy = brandingConfigSnapshotSchema.safeParse({
        ...(raw.branding_config as Record<string, unknown>),
        voiceoverTimingHash:
          typeof (raw.branding_config as Record<string, unknown>)
            .voiceoverTimingHash === "string"
            ? (raw.branding_config as Record<string, unknown>)
                .voiceoverTimingHash
            : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      });
      if (legacy.success) {
        brandingConfig = legacy.data;
      }
    }
  }

  const brandingStatusRaw = raw.branding_status;
  const brandingStatus =
    typeof brandingStatusRaw === "string"
      ? (brandingStatusRaw as BrandingJobStatus)
      : null;

  return {
    id: raw.id,
    clientId: raw.client_id,
    reelScriptId: raw.reel_script_id,
    templateId: ASSEMBLY_TEMPLATE_REEL_V1_BASIC,
    status: raw.status as AssemblyJobStatus,
    primaryVideoAssetId,
    voiceoverAssetId:
      typeof raw.voiceover_asset_id === "string"
        ? raw.voiceover_asset_id
        : null,
    brollAssetIds,
    assemblyPathTag,
    outputMediaAssetId:
      typeof raw.output_media_asset_id === "string"
        ? raw.output_media_asset_id
        : null,
    scriptUpdatedAt: raw.script_updated_at,
    inputFingerprint: raw.input_fingerprint,
    targetDurationSec: raw.target_duration_sec,
    actualDurationSec:
      typeof raw.actual_duration_sec === "number"
        ? raw.actual_duration_sec
        : null,
    failureReason:
      typeof raw.failure_reason === "string" ? raw.failure_reason : null,
    brandingStatus,
    brandingConfig,
    brandingFingerprint:
      typeof raw.branding_fingerprint === "string"
        ? raw.branding_fingerprint
        : null,
    preBrandingOutputMediaAssetId:
      typeof raw.pre_branding_output_media_asset_id === "string"
        ? raw.pre_branding_output_media_asset_id
        : null,
    coverMediaAssetId:
      typeof raw.cover_media_asset_id === "string"
        ? raw.cover_media_asset_id
        : null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function isTerminalAssemblyJobStatus(status: AssemblyJobStatus): boolean {
  return status === "completed" || status === "failed";
}
