import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { getAssemblyJobPollIntervalMs } from "./assembly-job-config";
import { ASSEMBLY_JOBS_TABLE } from "./assembly-job-row";
import { markStaleAssemblyJobsFailed } from "./mark-stale-assembly-jobs-failed";
import { runAssemblyJob } from "./run-assembly-job";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollQueuedAssemblyJobsBatch(limit = 5): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  await markStaleAssemblyJobsFailed();

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
    .select("id")
    .eq("status", "queued")
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
      await runAssemblyJob(jobId);
    } catch (pollError) {
      console.error("[assembly-jobs] batch run failed", {
        jobId,
        message:
          pollError instanceof Error ? pollError.message : "unknown",
      });
    }
  }
}

export async function runAssemblyWorkerLoop(): Promise<never> {
  while (true) {
    await pollQueuedAssemblyJobsBatch();
    await sleep(getAssemblyJobPollIntervalMs());
  }
}
