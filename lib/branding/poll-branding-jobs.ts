import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { getBrandingJobPollIntervalMs } from "./branding-job-config";
import { BRANDING_JOBS_TABLE } from "./branding-job-row";
import { markStaleBrandingJobsFailed } from "./mark-stale-branding-jobs-failed";
import { runBrandingJob } from "./run-branding-job";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollQueuedBrandingJobsBatch(limit = 5): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  await markStaleBrandingJobsFailed();

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(BRANDING_JOBS_TABLE)
    .select("id")
    .eq("status", "completed")
    .eq("branding_status", "queued")
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
      await runBrandingJob(jobId);
    } catch (pollError) {
      console.error("[branding-jobs] batch run failed", {
        jobId,
        message:
          pollError instanceof Error ? pollError.message : "unknown",
      });
    }
  }
}

export async function runBrandingWorkerLoop(): Promise<never> {
  while (true) {
    await pollQueuedBrandingJobsBatch();
    await sleep(getBrandingJobPollIntervalMs());
  }
}
