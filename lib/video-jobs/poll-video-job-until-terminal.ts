import "server-only";

import type { VideoJobStatus } from "@/lib/contracts/providers";
import { videoJobStatusSchema } from "@/lib/contracts/providers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  createIdlePollBackoff,
  createStaleSweepGate,
} from "@/lib/worker/idle-poll-backoff";
import {
  createWorkerWakeGate,
  type WorkerWakeGate,
} from "@/lib/worker/wake-gate";

import { applyVideoJobStatusUpdate } from "./apply-video-job-status-update";
import { getVideoAdapterForJob } from "./get-video-adapter-for-job";
import { loadVideoJobByIdUnscoped } from "./load-video-job";
import { markStaleVideoJobsFailed } from "./mark-stale-video-jobs-failed";
import { isTerminalVideoJobStatus } from "./retry-eligibility";
import {
  getVideoJobIdleBackoffMultiplier,
  getVideoJobIdleMaxIntervalMs,
  getVideoJobPollIntervalMs,
  getVideoJobStaleSweepIntervalMs,
} from "./video-job-config";
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

export type PollActiveVideoJobsBatchOptions = {
  limit?: number;
  /** When false, skip markStaleVideoJobsFailed for this tick. Default true. */
  runStaleSweep?: boolean;
};

export async function pollActiveVideoJobsBatch(
  limitOrOptions: number | PollActiveVideoJobsBatchOptions = 10,
): Promise<{ processed: number }> {
  const options: PollActiveVideoJobsBatchOptions =
    typeof limitOrOptions === "number"
      ? { limit: limitOrOptions, runStaleSweep: true }
      : limitOrOptions;
  const limit = options.limit ?? 10;
  const runStaleSweep = options.runStaleSweep !== false;

  if (!isSupabaseConfigured()) {
    return { processed: 0 };
  }

  if (runStaleSweep) {
    await markStaleVideoJobsFailed();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("id")
    .in("status", ["queued", "processing"])
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return { processed: 0 };
  }

  let processed = 0;
  for (const row of data) {
    const jobId = (row as { id: unknown }).id;
    if (typeof jobId !== "string") {
      continue;
    }
    try {
      await pollVideoJobUntilTerminal(jobId);
      processed += 1;
    } catch (pollError) {
      console.error("[video-jobs] batch poll failed", {
        jobId,
        message:
          pollError instanceof Error ? pollError.message : "unknown",
      });
    }
  }

  return { processed };
}

/**
 * Single-tick batch for Vercel Cron (does not block until terminal).
 * Always runs stale sweep — cron already fires at most once per minute.
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

export type RunVideoJobWorkerLoopOptions = {
  wakeGate?: WorkerWakeGate;
};

export async function runVideoJobWorkerLoop(
  options: RunVideoJobWorkerLoopOptions = {},
): Promise<never> {
  const wakeGate = options.wakeGate ?? createWorkerWakeGate();
  const baseIntervalMs = getVideoJobPollIntervalMs();
  const backoff = createIdlePollBackoff({
    baseIntervalMs,
    maxIntervalMs: getVideoJobIdleMaxIntervalMs(),
    multiplier: getVideoJobIdleBackoffMultiplier(),
  });
  const staleGate = createStaleSweepGate(getVideoJobStaleSweepIntervalMs());
  wakeGate.onWake(() => {
    backoff.reset();
  });

  while (true) {
    const runStaleSweep = staleGate.shouldSweep();
    const { processed } = await pollActiveVideoJobsBatch({
      runStaleSweep,
    });
    if (runStaleSweep) {
      staleGate.markSwept();
    }
    await wakeGate.sleep(backoff.afterPoll(processed > 0));
  }
}
