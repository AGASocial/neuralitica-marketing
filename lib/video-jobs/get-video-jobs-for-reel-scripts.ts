import "server-only";

import type { OperatorVideoJobsByReelMap } from "@/lib/contracts/video-job";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { mapOperatorVideoJobSummaryDto } from "./map-operator-video-job-dto";
import { mapVideoJobRow, VIDEO_JOB_SELECT_COLUMNS } from "./video-job-row";

export async function getVideoJobsForReelScripts(params: {
  clientId: string;
  reelScriptIds: string[];
}): Promise<OperatorVideoJobsByReelMap> {
  const result: OperatorVideoJobsByReelMap = {};
  for (const reelScriptId of params.reelScriptIds) {
    result[reelScriptId] = null;
  }

  if (!isSupabaseConfigured() || params.reelScriptIds.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_video_jobs")
    .select(VIDEO_JOB_SELECT_COLUMNS)
    .eq("client_id", params.clientId)
    .in("reel_script_id", params.reelScriptIds)
    .eq("asset_role", "primary")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return result;
  }

  const latestByReel = new Map<string, ReturnType<typeof mapVideoJobRow>>();
  for (const raw of data) {
    const row = mapVideoJobRow(raw as Record<string, unknown>);
    if (!row) {
      continue;
    }
    if (!latestByReel.has(row.reelScriptId)) {
      latestByReel.set(row.reelScriptId, row);
    }
  }

  for (const [reelScriptId, job] of latestByReel) {
    if (!job) {
      continue;
    }
    result[reelScriptId] = await mapOperatorVideoJobSummaryDto(job, {
      operatorClientId: params.clientId,
    });
  }

  return result;
}
