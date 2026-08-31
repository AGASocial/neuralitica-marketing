import "server-only";

import type { ApplyVideoJobStatusUpdateInput } from "@/lib/contracts/video-job";
import type { ApplyVideoJobStatusUpdateSuccess } from "@/lib/contracts/video-job";
import type { VideoJobStatus } from "@/lib/contracts/providers";
import { finalizeGenerationCost } from "@/lib/cost-policy/finalize-generation-cost";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { persistVideoJobOutputAsset } from "./persist-video-job-output";
import { loadVideoJobByIdUnscoped } from "./load-video-job";
import { VIDEO_JOBS_TABLE } from "./video-job-row";

const TERMINAL_STATUSES = new Set<VideoJobStatus>([
  "completed",
  "failed",
  "cancelled",
]);

function isAllowedTransition(
  from: VideoJobStatus,
  to: VideoJobStatus,
): boolean {
  if (TERMINAL_STATUSES.has(from)) {
    return false;
  }

  switch (from) {
    case "queued":
      return to === "processing" || to === "failed" || to === "cancelled";
    case "processing":
      return to === "completed" || to === "failed" || to === "cancelled";
    default:
      return false;
  }
}

/**
 * Sole writer for neuramark_video_jobs.status (US-8.4 SECURITY).
 * Invoked only by poller, stale sweeper, and optional webhook handler.
 */
export async function applyVideoJobStatusUpdate(
  input: ApplyVideoJobStatusUpdateInput,
): Promise<ApplyVideoJobStatusUpdateSuccess> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured for video job status update");
  }

  const job = await loadVideoJobByIdUnscoped(input.jobId);
  if (!job) {
    throw new Error("Video job not found for status update");
  }

  const nextStatus = input.normalizedStatus.status;

  if (TERMINAL_STATUSES.has(job.status)) {
    return {
      ok: true,
      jobId: job.id,
      status: job.status,
      idempotent: true,
    };
  }

  if (!isAllowedTransition(job.status, nextStatus)) {
    return {
      ok: true,
      jobId: job.id,
      status: job.status,
      idempotent: true,
    };
  }

  const supabase = createServerSupabaseClient();
  let outputMediaAssetId = job.outputMediaAssetId;
  let actualCostCents = job.actualCostCents;
  let failureReason: string | null =
    nextStatus === "failed" || nextStatus === "cancelled"
      ? (input.normalizedStatus.sanitizedErrorMessage ?? null)
      : null;

  if (nextStatus === "completed") {
    if (job.outputMediaAssetId) {
      return {
        ok: true,
        jobId: job.id,
        status: "completed",
        idempotent: true,
      };
    }

    const rawOutputUrl = input.normalizedStatus.rawOutputUrl;
    if (!rawOutputUrl) {
      throw new Error("Completed video job missing rawOutputUrl");
    }

    const persisted = await persistVideoJobOutputAsset({
      job,
      rawOutputUrl,
    });
    outputMediaAssetId = persisted.outputMediaAssetId;
    actualCostCents = persisted.actualCostCents;
    failureReason = null;

    if (job.spendEventId) {
      await finalizeGenerationCost({
        mode: "async_update",
        spendEventId: job.spendEventId,
        clientId: job.clientId,
        reelScriptId: job.reelScriptId,
        actualCostCents,
        actualCostUnavailableReason: null,
      });
    }
  }

  const { error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .update({
      status: nextStatus,
      actual_cost_cents: actualCostCents,
      failure_reason: failureReason,
      output_media_asset_id: outputMediaAssetId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .in("status", ["queued", "processing"]);

  if (error) {
    throw new Error("Failed to update video job status");
  }

  if (nextStatus === "completed") {
    const { onVideoJobCompletedRevision } = await import(
      "@/lib/approvals/revision/on-video-job-completed-revision"
    );
    await onVideoJobCompletedRevision({
      reelScriptId: job.reelScriptId,
      clientId: job.clientId,
    });
  }

  return {
    ok: true,
    jobId: job.id,
    status: nextStatus,
    idempotent: false,
  };
}
