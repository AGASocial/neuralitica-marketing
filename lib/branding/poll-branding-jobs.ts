import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  createIdlePollBackoff,
  createStaleSweepGate,
} from "@/lib/worker/idle-poll-backoff";

import {
  getBrandingJobIdleBackoffMultiplier,
  getBrandingJobIdleMaxIntervalMs,
  getBrandingJobPollIntervalMs,
  getBrandingJobStaleSweepIntervalMs,
} from "./branding-job-config";
import { BRANDING_JOBS_TABLE } from "./branding-job-row";
import { markStaleBrandingJobsFailed } from "./mark-stale-branding-jobs-failed";
import { runBrandingJob } from "./run-branding-job";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PollQueuedBrandingJobsBatchOptions = {
  limit?: number;
  /** When false, skip markStaleBrandingJobsFailed for this tick. Default true. */
  runStaleSweep?: boolean;
};

export async function pollQueuedBrandingJobsBatch(
  limitOrOptions: number | PollQueuedBrandingJobsBatchOptions = 5,
): Promise<{ processed: number }> {
  const options: PollQueuedBrandingJobsBatchOptions =
    typeof limitOrOptions === "number"
      ? { limit: limitOrOptions, runStaleSweep: true }
      : limitOrOptions;
  const limit = options.limit ?? 5;
  const runStaleSweep = options.runStaleSweep !== false;

  if (!isSupabaseConfigured()) {
    return { processed: 0 };
  }

  if (runStaleSweep) {
    await markStaleBrandingJobsFailed();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(BRANDING_JOBS_TABLE)
    .select("id")
    .eq("status", "completed")
    .eq("branding_status", "queued")
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
      await runBrandingJob(jobId);
      processed += 1;
    } catch (pollError) {
      console.error("[branding-jobs] batch run failed", {
        jobId,
        message:
          pollError instanceof Error ? pollError.message : "unknown",
      });
    }
  }

  return { processed };
}

export async function runBrandingWorkerLoop(): Promise<never> {
  const baseIntervalMs = getBrandingJobPollIntervalMs();
  const backoff = createIdlePollBackoff({
    baseIntervalMs,
    maxIntervalMs: getBrandingJobIdleMaxIntervalMs(),
    multiplier: getBrandingJobIdleBackoffMultiplier(),
  });
  const staleGate = createStaleSweepGate(getBrandingJobStaleSweepIntervalMs());

  while (true) {
    const runStaleSweep = staleGate.shouldSweep();
    const { processed } = await pollQueuedBrandingJobsBatch({
      runStaleSweep,
    });
    if (runStaleSweep) {
      staleGate.markSwept();
    }
    await sleep(backoff.afterPoll(processed > 0));
  }
}
