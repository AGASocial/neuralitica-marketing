import "server-only";

import { ASSEMBLY_STALE_FAILURE_MESSAGE_KEY } from "@/lib/contracts/assembly-job";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { applyAssemblyJobUpdate } from "./apply-assembly-job-update";
import { getAssemblyStaleTimeoutMin } from "./assembly-job-config";
import { ASSEMBLY_JOBS_TABLE } from "./assembly-job-row";

/**
 * Worker-only — marks stale queued/processing assembly jobs as failed (US-9.1).
 */
export async function markStaleAssemblyJobsFailed(): Promise<{
  markedCount: number;
}> {
  if (!isSupabaseConfigured()) {
    return { markedCount: 0 };
  }

  const staleMin = getAssemblyStaleTimeoutMin();
  const cutoff = new Date(Date.now() - staleMin * 60 * 1000).toISOString();
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
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
      await applyAssemblyJobUpdate({
        assemblyJobId: (row as { id: string }).id,
        patch: {
          status: "failed",
          failureReason: ASSEMBLY_STALE_FAILURE_MESSAGE_KEY,
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
