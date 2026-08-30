import "server-only";

import { VIDEO_JOB_STALE_FAILURE_MESSAGE_KEY } from "@/lib/contracts/video-job";

import { applyVideoJobStatusUpdate } from "./apply-video-job-status-update";
import { getVideoJobStaleTimeoutMs } from "./video-job-config";
import { VIDEO_JOBS_TABLE } from "./video-job-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * Worker/cron only — marks stale queued/processing jobs as failed.
 */
export async function markStaleVideoJobsFailed(): Promise<{ markedCount: number }> {
  if (!isSupabaseConfigured()) {
    return { markedCount: 0 };
  }

  const staleMs = getVideoJobStaleTimeoutMs();
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("id")
    .in("status", ["queued", "processing"])
    .lt("updated_at", cutoff);

  if (error || !data?.length) {
    return { markedCount: 0 };
  }

  let markedCount = 0;
  for (const row of data) {
    if (typeof (row as { id?: unknown }).id !== "string") {
      continue;
    }
    try {
      await applyVideoJobStatusUpdate({
        jobId: (row as { id: string }).id,
        source: "poller",
        normalizedStatus: {
          status: "failed",
          sanitizedErrorMessage: VIDEO_JOB_STALE_FAILURE_MESSAGE_KEY,
        },
      });
      markedCount += 1;
    } catch {
      // continue with remaining rows
    }
  }

  return { markedCount };
}
