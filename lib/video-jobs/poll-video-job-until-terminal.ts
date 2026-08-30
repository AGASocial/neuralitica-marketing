import "server-only";

import type { VideoJobStatus } from "@/lib/contracts/providers";
import { videoJobStatusSchema } from "@/lib/contracts/providers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { applyVideoJobStatusUpdate } from "./apply-video-job-status-update";
import { getVideoAdapterForJob } from "./get-video-adapter-for-job";
import { loadVideoJobByIdUnscoped } from "./load-video-job";
import { markStaleVideoJobsFailed } from "./mark-stale-video-jobs-failed";
import { isTerminalVideoJobStatus } from "./retry-eligibility";
import { getVideoJobPollIntervalMs } from "./video-job-config";
import { VIDEO_JOBS_TABLE } from "./video-job-row";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapVendorStatusToPersisted(status: VideoJobStatus): VideoJobStatus {
  return videoJobStatusSchema.parse(status);
}

/**
 * Poll vendor until terminal status, then delegate to applyVideoJobStatusUpdate.
 * Used by dev in-process mode and Fly worker module.
 */
export async function pollVideoJobUntilTerminal(jobId: string): Promise<void> {
  const pollIntervalMs = getVideoJobPollIntervalMs();

  while (true) {
    const job = await loadVideoJobByIdUnscoped(jobId);
    if (!job) {
      return;
    }

    if (isTerminalVideoJobStatus(job.status)) {
      return;
    }

    const adapter = await getVideoAdapterForJob(job);
    const statusResult = await adapter.getJobStatus(job.externalJobId);
    const normalizedStatus = mapVendorStatusToPersisted(statusResult.status);

    if (isTerminalVideoJobStatus(normalizedStatus)) {
      await applyVideoJobStatusUpdate({
        jobId: job.id,
        source: "poller",
        normalizedStatus: {
          status: normalizedStatus,
          progressPercent: statusResult.progressPercent,
          sanitizedErrorMessage: statusResult.sanitizedErrorMessage,
          rawOutputUrl: statusResult.rawOutputUrl,
        },
      });
      return;
    }

    if (normalizedStatus !== job.status) {
      await applyVideoJobStatusUpdate({
        jobId: job.id,
        source: "poller",
        normalizedStatus: {
          status: normalizedStatus,
          progressPercent: statusResult.progressPercent,
        },
      });
    }

    await sleep(pollIntervalMs);
  }
}

export async function pollActiveVideoJobsBatch(limit = 10): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  await markStaleVideoJobsFailed();

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("id")
    .in("status", ["queued", "processing"])
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return;
  }

  for (const row of data) {
    const jobId = (row as { id: unknown }).id;
    if (typeof jobId !== "string") {
      continue;
    }
    try {
      await pollVideoJobUntilTerminal(jobId);
    } catch (pollError) {
      console.error("[video-jobs] batch poll failed", {
        jobId,
        message:
          pollError instanceof Error ? pollError.message : "unknown",
      });
    }
  }
}

export async function runVideoJobWorkerLoop(): Promise<never> {
  while (true) {
    await pollActiveVideoJobsBatch();
    await sleep(getVideoJobPollIntervalMs());
  }
}
