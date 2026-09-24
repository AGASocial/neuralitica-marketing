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
 * One vendor status check + optional DB write. Safe for short Vercel cron ticks.
 */
export async function pollVideoJobOnce(jobId: string): Promise<{
  jobId: string;
  status: VideoJobStatus | null;
  terminal: boolean;
}> {
  const job = await loadVideoJobByIdUnscoped(jobId);
  if (!job) {
    return { jobId, status: null, terminal: true };
  }

  if (isTerminalVideoJobStatus(job.status)) {
    return { jobId, status: job.status, terminal: true };
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
    return { jobId, status: normalizedStatus, terminal: true };
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

  return { jobId, status: normalizedStatus, terminal: false };
}

/**
 * Poll vendor until terminal status, then delegate to applyVideoJobStatusUpdate.
 * Used by dev in-process mode and Fly worker module.
 */
export async function pollVideoJobUntilTerminal(jobId: string): Promise<void> {
  const pollIntervalMs = getVideoJobPollIntervalMs();

  while (true) {
    const tick = await pollVideoJobOnce(jobId);
    if (tick.terminal) {
      return;
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

/**
 * Single-tick batch for Vercel Cron (does not block until terminal).
 */
export async function pollActiveVideoJobsOnceBatch(
  limit = 20,
): Promise<{ polled: number; terminal: number }> {
  if (!isSupabaseConfigured()) {
    return { polled: 0, terminal: 0 };
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
    return { polled: 0, terminal: 0 };
  }

  let polled = 0;
  let terminal = 0;
  for (const row of data) {
    const jobId = (row as { id: unknown }).id;
    if (typeof jobId !== "string") {
      continue;
    }
    try {
      const tick = await pollVideoJobOnce(jobId);
      polled += 1;
      if (tick.terminal) {
        terminal += 1;
      }
    } catch (pollError) {
      console.error("[video-jobs] once-batch poll failed", {
        jobId,
        message:
          pollError instanceof Error ? pollError.message : "unknown",
      });
    }
  }

  return { polled, terminal };
}

export async function runVideoJobWorkerLoop(): Promise<never> {
  while (true) {
    await pollActiveVideoJobsBatch();
    await sleep(getVideoJobPollIntervalMs());
  }
}
