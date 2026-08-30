import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { applyBrandingJobUpdate } from "./apply-branding-job-update";
import { getBrandingStaleTimeoutMin } from "./branding-job-config";
import { BRANDING_JOBS_TABLE } from "./branding-job-row";
import { BRANDING_STALE_FAILURE_MESSAGE_KEY } from "./constants";

/**
 * Worker-only — marks stale queued/processing branding jobs as failed (US-9.2).
 */
export async function markStaleBrandingJobsFailed(): Promise<{
  markedCount: number;
}> {
  if (!isSupabaseConfigured()) {
    return { markedCount: 0 };
  }

  const staleMin = getBrandingStaleTimeoutMin();
  const cutoff = new Date(Date.now() - staleMin * 60 * 1000).toISOString();
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(BRANDING_JOBS_TABLE)
    .select("id")
    .eq("status", "completed")
    .in("branding_status", ["queued", "processing"])
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
      await applyBrandingJobUpdate({
        assemblyJobId: (row as { id: string }).id,
        patch: {
          brandingStatus: "failed",
          failureReason: BRANDING_STALE_FAILURE_MESSAGE_KEY,
        },
        source: "stale_sweeper",
      });
      markedCount += 1;
    } catch {
      // continue with remaining rows
    }
  }

  return { markedCount };
}
