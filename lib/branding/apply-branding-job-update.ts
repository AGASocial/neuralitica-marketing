import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import type { BrandingJobStatus } from "./branding-job-row";
import { loadBrandingJobByIdUnscoped } from "./load-branding-job";
import { BRANDING_JOBS_TABLE } from "./branding-job-row";

type BrandingStatus = BrandingJobStatus;

export type BrandingJobStatusPatch =
  | { brandingStatus: "processing" }
  | {
      brandingStatus: "completed";
      outputMediaAssetId: string;
      coverMediaAssetId: string;
    }
  | { brandingStatus: "failed"; failureReason: string };

const TERMINAL_STATUSES = new Set<BrandingStatus>([
  "completed",
  "failed",
  "skipped",
]);

function isAllowedBrandingTransition(
  from: BrandingStatus | null,
  to: BrandingStatus,
): boolean {
  if (from === null) {
    return to === "queued";
  }
  if (TERMINAL_STATUSES.has(from)) {
    return false;
  }
  switch (from) {
    case "queued":
      return to === "processing" || to === "failed";
    case "processing":
      return to === "completed" || to === "failed";
    default:
      return false;
  }
}

export type ApplyBrandingJobUpdateInput = {
  assemblyJobId: string;
  patch: BrandingJobStatusPatch;
  source: "worker" | "stale_sweeper";
};

export type ApplyBrandingJobUpdateSuccess = {
  ok: true;
  jobId: string;
  brandingStatus: BrandingStatus | null;
  idempotent: boolean;
};

/**
 * Sole writer for neuramark_assembled_reels.branding_status (US-9.2 SECURITY).
 */
export async function applyBrandingJobUpdate(
  input: ApplyBrandingJobUpdateInput,
): Promise<ApplyBrandingJobUpdateSuccess> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured for branding job status update");
  }

  const job = await loadBrandingJobByIdUnscoped(input.assemblyJobId);
  if (!job) {
    throw new Error("Branding job not found for status update");
  }

  const nextStatus = input.patch.brandingStatus;
  const currentStatus = job.brandingStatus;

  if (currentStatus && TERMINAL_STATUSES.has(currentStatus)) {
    return {
      ok: true,
      jobId: job.id,
      brandingStatus: currentStatus,
      idempotent: true,
    };
  }

  if (!isAllowedBrandingTransition(currentStatus, nextStatus)) {
    return {
      ok: true,
      jobId: job.id,
      brandingStatus: currentStatus,
      idempotent: true,
    };
  }

  const updatePayload: Record<string, unknown> = {
    branding_status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (nextStatus === "processing") {
    if (!job.preBrandingOutputMediaAssetId && job.outputMediaAssetId) {
      updatePayload.pre_branding_output_media_asset_id =
        job.outputMediaAssetId;
    }
  }

  if (nextStatus === "failed") {
    updatePayload.failure_reason = input.patch.failureReason;
  }

  if (nextStatus === "completed") {
    updatePayload.output_media_asset_id = input.patch.outputMediaAssetId;
    updatePayload.cover_media_asset_id = input.patch.coverMediaAssetId;
    updatePayload.failure_reason = null;
  }

  const supabase = createServerSupabaseClient();
  let query = supabase
    .from(BRANDING_JOBS_TABLE)
    .update(updatePayload)
    .eq("id", job.id);

  if (currentStatus === null) {
    query = query.is("branding_status", null);
  } else {
    query = query.eq("branding_status", currentStatus);
  }

  const { error } = await query;

  if (error) {
    throw new Error("Branding job status update failed");
  }

  return {
    ok: true,
    jobId: job.id,
    brandingStatus: nextStatus,
    idempotent: false,
  };
}

/** Orchestrator-only queued write (US-9.2 createBrandingJobForAssembly step 12). */
export async function writeBrandingQueuedState(params: {
  assemblyJobId: string;
  brandingConfig: Record<string, unknown>;
  brandingFingerprint: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured for branding enqueue");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from(BRANDING_JOBS_TABLE)
    .update({
      branding_status: "queued",
      branding_config: params.brandingConfig,
      branding_fingerprint: params.brandingFingerprint,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.assemblyJobId);

  if (error) {
    throw new Error("Failed to enqueue branding job");
  }
}

/** Auto-chain sanitize failure path — sets branding failed without worker spawn. */
export async function markBrandingFailed(params: {
  assemblyJobId: string;
  failureReason: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createServerSupabaseClient();
  await supabase
    .from(BRANDING_JOBS_TABLE)
    .update({
      branding_status: "failed",
      failure_reason: params.failureReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.assemblyJobId);
}
