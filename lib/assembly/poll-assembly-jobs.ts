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
  createWorkerWakeGate,
  type WorkerWakeGate,
} from "@/lib/worker/wake-gate";

import {
  getAssemblyJobIdleBackoffMultiplier,
  getAssemblyJobIdleMaxIntervalMs,
  getAssemblyJobPollIntervalMs,
  getAssemblyJobStaleSweepIntervalMs,
} from "./assembly-job-config";
import { ASSEMBLY_JOBS_TABLE } from "./assembly-job-row";
import { markStaleAssemblyJobsFailed } from "./mark-stale-assembly-jobs-failed";
import { runAssemblyJob } from "./run-assembly-job";

export type PollQueuedAssemblyJobsBatchOptions = {
  limit?: number;
  /** When false, skip markStaleAssemblyJobsFailed for this tick. Default true. */
  runStaleSweep?: boolean;
};

export async function pollQueuedAssemblyJobsBatch(
  limitOrOptions: number | PollQueuedAssemblyJobsBatchOptions = 5,
): Promise<{ processed: number }> {
  const options: PollQueuedAssemblyJobsBatchOptions =
    typeof limitOrOptions === "number"
      ? { limit: limitOrOptions, runStaleSweep: true }
      : limitOrOptions;
  const limit = options.limit ?? 5;
  const runStaleSweep = options.runStaleSweep !== false;

  if (!isSupabaseConfigured()) {
    return { processed: 0 };
  }

  if (runStaleSweep) {
    await markStaleAssemblyJobsFailed();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
    .select("id")
    .eq("status", "queued")
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
      await runAssemblyJob(jobId);
      processed += 1;
    } catch (pollError) {
      console.error("[assembly-jobs] batch run failed", {
        jobId,
        message:
          pollError instanceof Error ? pollError.message : "unknown",
      });
    }
  }

  return { processed };
}

export type RunAssemblyWorkerLoopOptions = {
  wakeGate?: WorkerWakeGate;
};

export async function runAssemblyWorkerLoop(
  options: RunAssemblyWorkerLoopOptions = {},
): Promise<never> {
  const wakeGate = options.wakeGate ?? createWorkerWakeGate();
  const baseIntervalMs = getAssemblyJobPollIntervalMs();
  const backoff = createIdlePollBackoff({
    baseIntervalMs,
    maxIntervalMs: getAssemblyJobIdleMaxIntervalMs(),
    multiplier: getAssemblyJobIdleBackoffMultiplier(),
  });
  const staleGate = createStaleSweepGate(getAssemblyJobStaleSweepIntervalMs());
  wakeGate.onWake(() => {
    backoff.reset();
  });

  while (true) {
    const runStaleSweep = staleGate.shouldSweep();
    const { processed } = await pollQueuedAssemblyJobsBatch({
      runStaleSweep,
    });
    if (runStaleSweep) {
      staleGate.markSwept();
    }
    await wakeGate.sleep(backoff.afterPoll(processed > 0));
  }
}
