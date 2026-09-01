import "server-only";

import type {
  ApplyAssemblyJobUpdateInput,
  ApplyAssemblyJobUpdateSuccess,
  AssemblyJobStatus,
} from "@/lib/contracts/assembly-job";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { loadAssemblyJobByIdUnscoped } from "./load-assembly-job";
import { ASSEMBLY_JOBS_TABLE } from "./assembly-job-row";

const TERMINAL_STATUSES = new Set<AssemblyJobStatus>(["completed", "failed"]);

function isAllowedTransition(
  from: AssemblyJobStatus,
  to: AssemblyJobStatus,
): boolean {
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

/**
 * Sole writer for neuramark_assembled_reels.status (US-9.1 SECURITY).
 */
export async function applyAssemblyJobUpdate(
  input: ApplyAssemblyJobUpdateInput,
): Promise<ApplyAssemblyJobUpdateSuccess> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured for assembly job status update");
  }

  const job = await loadAssemblyJobByIdUnscoped(input.assemblyJobId);
  if (!job) {
    throw new Error("Assembly job not found for status update");
  }

  const nextStatus = input.patch.status;

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

  if (nextStatus === "completed") {
    if (job.outputMediaAssetId) {
      return {
        ok: true,
        jobId: job.id,
        status: "completed",
        idempotent: true,
      };
    }

    if (
      input.patch.status !== "completed" ||
      !input.patch.outputMediaAssetId ||
      typeof input.patch.actualDurationSec !== "number"
    ) {
      throw new Error("Completed assembly patch missing required fields");
    }
  }

  const supabase = createServerSupabaseClient();
  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (nextStatus === "completed" && input.patch.status === "completed") {
    updatePayload.output_media_asset_id = input.patch.outputMediaAssetId;
    updatePayload.actual_duration_sec = input.patch.actualDurationSec;
    updatePayload.failure_reason = null;
  }

  if (nextStatus === "failed" && input.patch.status === "failed") {
    updatePayload.failure_reason = input.patch.failureReason;
  }

  if (nextStatus === "processing") {
    const { data, error } = await supabase
      .from(ASSEMBLY_JOBS_TABLE)
      .update(updatePayload)
      .eq("id", job.id)
      .eq("status", "queued")
      .select("id");

    if (error) {
      throw new Error("Failed to update assembly job status");
    }

    if (!data || data.length === 0) {
      const refreshed = await loadAssemblyJobByIdUnscoped(input.assemblyJobId);
      return {
        ok: true,
        jobId: job.id,
        status: refreshed?.status ?? job.status,
        idempotent: true,
      };
    }

    return {
      ok: true,
      jobId: job.id,
      status: "processing",
      idempotent: false,
    };
  }

  const { error } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
    .update(updatePayload)
    .eq("id", job.id)
    .in("status", ["queued", "processing"]);

  if (error) {
    throw new Error("Failed to update assembly job status");
  }

  if (nextStatus === "completed" && input.patch.status === "completed") {
    const { onAssemblyJobCompleted } = await import("./on-assembly-job-completed");
    await onAssemblyJobCompleted({ assemblyJobId: job.id });
  }

  if (nextStatus === "completed" || nextStatus === "failed") {
    const { maybeResumeWeeklyCycleFromJob } = await import(
      "@/lib/orchestration/maybe-resume-weekly-cycle-from-job"
    );
    await maybeResumeWeeklyCycleFromJob({ jobKind: "assembly", jobId: job.id });
  }

  return {
    ok: true,
    jobId: job.id,
    status: nextStatus,
    idempotent: false,
  };
}
