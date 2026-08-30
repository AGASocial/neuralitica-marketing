import "server-only";

import { randomUUID } from "node:crypto";

import {
  MANUAL_EXTERNAL_JOB_ID_PREFIX,
  MANUAL_PROVIDER_KEY,
  type UploadManualVideoJobResult,
} from "@/lib/contracts/manual-video-upload";
import { MEDIA_ASSET_TYPE_GENERATED_VIDEO } from "@/lib/contracts/media-assets";
import { finalizeGenerationCost } from "@/lib/cost-policy/finalize-generation-cost";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";
import { validateAndPrepareMediaUpload } from "@/lib/media/upload-validation";
import { assertActiveAvatarConsentForJobs } from "@/lib/visual-preferences/assert-active-avatar-consent-for-jobs";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { manualUploadError } from "./manual-upload-errors";
import { mapOperatorVideoJobSummaryDto } from "./map-operator-video-job-dto";
import { loadReelScriptForVideoJob } from "./load-reel-script-for-video-job";
import { isTerminalVideoJobStatus } from "./retry-eligibility";
import {
  mapVideoJobRow,
  VIDEO_JOB_SELECT_COLUMNS,
  VIDEO_JOBS_TABLE,
  type VideoJobRow,
} from "./video-job-row";

const MEDIA_TABLE = "neuramark_media_assets";

async function loadLatestPrimaryJobForSlot(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<VideoJobRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select(VIDEO_JOB_SELECT_COLUMNS)
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("asset_role", "primary")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapVideoJobRow(data as Record<string, unknown>);
}

function mapValidatorError(
  code: string,
): UploadManualVideoJobResult {
  switch (code) {
    case "INVALID_FILE_TYPE":
      return manualUploadError("INVALID_FILE_TYPE");
    case "FILE_TOO_LARGE":
      return manualUploadError("FILE_TOO_LARGE");
    case "VIDEO_TOO_LONG":
      return manualUploadError("VIDEO_TOO_LONG");
    case "VALIDATION_ERROR":
      return manualUploadError("VALIDATION_ERROR");
    default:
      return manualUploadError("INTERNAL_ERROR");
  }
}

/**
 * Sync manual video upload orchestrator (US-8.3).
 * Caller must run requireOperator before invoke.
 */
export async function uploadManualVideoJob(input: {
  reelScriptId: string;
  clientId: string;
  operatorClientId: string;
  file: File | Buffer;
  originalFilename: string;
  parentJobId?: string;
}): Promise<UploadManualVideoJobResult> {
  if (!isSupabaseConfigured()) {
    return manualUploadError("INTERNAL_ERROR");
  }

  const script = await loadReelScriptForVideoJob({
    reelScriptId: input.reelScriptId,
    clientId: input.clientId,
  });
  if (!script) {
    return manualUploadError("NOT_FOUND");
  }

  const latestJob = await loadLatestPrimaryJobForSlot({
    clientId: input.clientId,
    reelScriptId: input.reelScriptId,
  });

  if (latestJob) {
    if (latestJob.status === "queued" || latestJob.status === "processing") {
      return manualUploadError("SLOT_JOB_IN_FLIGHT");
    }
    if (latestJob.status === "completed") {
      return manualUploadError("SLOT_COMPLETED_JOB_EXISTS");
    }
  }

  if (script.visualMode === "own_avatar" || script.modalidad === "own_avatar") {
    const consent = await assertActiveAvatarConsentForJobs(input.clientId);
    if (!consent.ok) {
      return manualUploadError("CONSENT_REVOKED");
    }
  }

  let parentJob: VideoJobRow | null = null;
  let attempt = 1;

  if (input.parentJobId) {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from(VIDEO_JOBS_TABLE)
      .select(VIDEO_JOB_SELECT_COLUMNS)
      .eq("id", input.parentJobId)
      .eq("reel_script_id", input.reelScriptId)
      .eq("client_id", input.clientId)
      .maybeSingle();

    if (error || !data) {
      return manualUploadError("VALIDATION_ERROR");
    }

    parentJob = mapVideoJobRow(data as Record<string, unknown>);
    if (!parentJob || !isTerminalVideoJobStatus(parentJob.status)) {
      return manualUploadError("VALIDATION_ERROR");
    }
    if (parentJob.status !== "failed" && parentJob.status !== "cancelled") {
      return manualUploadError("VALIDATION_ERROR");
    }
    attempt = parentJob.attempt + 1;
  }

  const validated = await validateAndPrepareMediaUpload({
    userId: input.clientId,
    assetType: "generated_video",
    file: input.file,
    originalFilename: input.originalFilename,
    existingAssetCount: 0,
  });

  if (!validated.ok) {
    return mapValidatorError(validated.error.code);
  }

  const { prepared } = validated;
  const durationSec = prepared.metadata.durationSec;
  if (typeof durationSec !== "number" || durationSec <= 0) {
    return manualUploadError("VIDEO_TOO_LONG");
  }

  const storage = getMediaStorage();
  try {
    await storage.put(prepared.storageKey, prepared.buffer, {
      contentType: prepared.detectedMime,
      sizeBytes: prepared.sizeBytes,
    });
  } catch (error) {
    console.error("[video-jobs] manual upload storage put failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return manualUploadError("INTERNAL_ERROR");
  }

  const supabase = createServerSupabaseClient();
  const externalJobId = `${MANUAL_EXTERNAL_JOB_ID_PREFIX}${randomUUID()}`;

  const { data: mediaRow, error: mediaError } = await supabase
    .from(MEDIA_TABLE)
    .insert({
      client_id: input.clientId,
      asset_type: MEDIA_ASSET_TYPE_GENERATED_VIDEO,
      storage_key: prepared.storageKey,
      metadata: {
        originalFilename: prepared.metadata.originalFilename,
        detectedMime: prepared.detectedMime,
        sizeBytes: prepared.sizeBytes,
        durationSec,
        source: "manual_upload",
      },
    })
    .select("id")
    .single();

  if (mediaError || !mediaRow || typeof (mediaRow as { id?: unknown }).id !== "string") {
    console.error("[video-jobs] manual upload media insert failed", {
      code: mediaError?.code,
    });
    try {
      await storage.delete(prepared.storageKey);
    } catch {
      console.error("[video-jobs] manual upload compensating delete failed");
    }
    return manualUploadError("INTERNAL_ERROR");
  }

  const mediaAssetId = (mediaRow as { id: string }).id;

  const { data: jobRowRaw, error: jobError } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .insert({
      client_id: input.clientId,
      reel_script_id: input.reelScriptId,
      provider_key: MANUAL_PROVIDER_KEY,
      provider_tier: "low",
      asset_role: "primary",
      external_job_id: externalJobId,
      status: "completed",
      estimated_cost_cents: 0,
      actual_cost_cents: 0,
      output_media_asset_id: mediaAssetId,
      operator_client_id: input.operatorClientId,
      parent_job_id: parentJob?.id ?? null,
      attempt,
    })
    .select(VIDEO_JOB_SELECT_COLUMNS)
    .single();

  if (jobError || !jobRowRaw) {
    console.error("[video-jobs] manual upload job insert failed", {
      code: jobError?.code,
    });
    try {
      await storage.delete(prepared.storageKey);
      await supabase
        .from(MEDIA_TABLE)
        .delete()
        .eq("id", mediaAssetId)
        .eq("client_id", input.clientId);
    } catch {
      console.error("[video-jobs] manual upload compensating cleanup failed");
    }
    return manualUploadError("INTERNAL_ERROR");
  }

  const jobRow = mapVideoJobRow(jobRowRaw as Record<string, unknown>);
  if (!jobRow) {
    return manualUploadError("INTERNAL_ERROR");
  }

  const spendResult = await finalizeGenerationCost({
    mode: "sync_insert",
    clientId: input.clientId,
    reelScriptId: input.reelScriptId,
    assetRole: "talking_head",
    jobKind: "talking_head_generate",
    estimatedCostCents: 0,
    manualActualCostCents: 0,
    operatorClientId: input.operatorClientId,
    providerKey: MANUAL_PROVIDER_KEY,
    durationSec,
  });

  if (!spendResult.ok) {
    console.error("[video-jobs] manual upload spend finalize failed", {
      code: spendResult.code,
    });
    return manualUploadError("INTERNAL_ERROR");
  }

  await supabase
    .from(VIDEO_JOBS_TABLE)
    .update({ spend_event_id: spendResult.spendEventId })
    .eq("id", jobRow.id);

  jobRow.spendEventId = spendResult.spendEventId;

  const job = await mapOperatorVideoJobSummaryDto(jobRow, {
    operatorClientId: input.operatorClientId,
  });

  return {
    ok: true,
    jobId: jobRow.id,
    mediaAssetId,
    status: "completed",
    job,
  };
}
