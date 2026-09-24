import "server-only";

import type {
  OperatorBrollJobClipDto,
  OperatorBrollJobsByReelMap,
} from "@/lib/contracts/video-job";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { mapVideoJobRow, VIDEO_JOB_SELECT_COLUMNS } from "./video-job-row";

const LATEST_BATCH_WINDOW_MS = 5 * 60 * 1000;

function toClipDto(
  job: NonNullable<ReturnType<typeof mapVideoJobRow>>,
): OperatorBrollJobClipDto {
  return {
    jobId: job.id,
    reelScriptId: job.reelScriptId,
    status: job.status,
    providerKey: job.providerKey,
    failureReason: job.failureReason,
    outputMediaAssetId: job.outputMediaAssetId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/**
 * Latest B-roll job batch per Reel (Operator scripts expand).
 * Prefers the newest creation wave; always includes any still in-flight jobs.
 */
export async function getBrollJobsForReelScripts(params: {
  clientId: string;
  reelScriptIds: string[];
}): Promise<OperatorBrollJobsByReelMap> {
  const result: OperatorBrollJobsByReelMap = {};
  for (const reelScriptId of params.reelScriptIds) {
    result[reelScriptId] = [];
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
    .eq("asset_role", "broll")
    .order("created_at", { ascending: true });

  if (error || !data) {
    return result;
  }

  const byReel = new Map<string, OperatorBrollJobClipDto[]>();
  for (const raw of data) {
    const row = mapVideoJobRow(raw as Record<string, unknown>);
    if (!row) {
      continue;
    }
    const list = byReel.get(row.reelScriptId) ?? [];
    list.push(toClipDto(row));
    byReel.set(row.reelScriptId, list);
  }

  for (const reelScriptId of params.reelScriptIds) {
    const all = byReel.get(reelScriptId) ?? [];
    if (all.length === 0) {
      result[reelScriptId] = [];
      continue;
    }

    const newestTs = Date.parse(all[all.length - 1]!.createdAt);
    const inFlight = all.filter(
      (clip) => clip.status === "queued" || clip.status === "processing",
    );
    const latestBatch = all.filter(
      (clip) =>
        Number.isFinite(newestTs) &&
        newestTs - Date.parse(clip.createdAt) <= LATEST_BATCH_WINDOW_MS,
    );

    const selected =
      inFlight.length > 0
        ? [...new Map([...latestBatch, ...inFlight].map((c) => [c.jobId, c])).values()].sort(
            (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
          )
        : latestBatch;

    result[reelScriptId] = selected;
  }

  return result;
}
