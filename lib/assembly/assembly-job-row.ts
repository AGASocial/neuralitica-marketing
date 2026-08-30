import "server-only";

import type { AssemblyJobStatus } from "@/lib/contracts/assembly-job";
import { ASSEMBLY_TEMPLATE_REEL_V1_BASIC } from "@/lib/contracts/assembly-job";

export type AssemblyJobRow = {
  id: string;
  clientId: string;
  reelScriptId: string;
  templateId: typeof ASSEMBLY_TEMPLATE_REEL_V1_BASIC;
  status: AssemblyJobStatus;
  primaryVideoAssetId: string;
  voiceoverAssetId: string | null;
  outputMediaAssetId: string | null;
  scriptUpdatedAt: string;
  inputFingerprint: string;
  targetDurationSec: number;
  actualDurationSec: number | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

const ASSEMBLY_JOB_SELECT =
  "id, client_id, reel_script_id, template_id, status, primary_video_asset_id, voiceover_asset_id, output_media_asset_id, script_updated_at, input_fingerprint, target_duration_sec, actual_duration_sec, failure_reason, created_at, updated_at";

export const ASSEMBLY_JOB_SELECT_COLUMNS = ASSEMBLY_JOB_SELECT;

export const ASSEMBLY_JOBS_TABLE = "neuramark_assembled_reels" as const;

export function mapAssemblyJobRow(
  raw: Record<string, unknown>,
): AssemblyJobRow | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.client_id !== "string" ||
    typeof raw.reel_script_id !== "string" ||
    typeof raw.template_id !== "string" ||
    typeof raw.status !== "string" ||
    typeof raw.primary_video_asset_id !== "string" ||
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

  return {
    id: raw.id,
    clientId: raw.client_id,
    reelScriptId: raw.reel_script_id,
    templateId: ASSEMBLY_TEMPLATE_REEL_V1_BASIC,
    status: raw.status as AssemblyJobStatus,
    primaryVideoAssetId: raw.primary_video_asset_id,
    voiceoverAssetId:
      typeof raw.voiceover_asset_id === "string"
        ? raw.voiceover_asset_id
        : null,
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
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function isTerminalAssemblyJobStatus(status: AssemblyJobStatus): boolean {
  return status === "completed" || status === "failed";
}
