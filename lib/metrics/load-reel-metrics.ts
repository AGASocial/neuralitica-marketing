import "server-only";

import type { ReelMetricsDto } from "@/lib/contracts/reel-metrics";
import {
  computeReelMetricsEditable,
  loadPublishedSlotGateForReelScript,
} from "@/lib/metrics/load-published-slot-for-reel";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const REEL_METRICS_TABLE = "neuramark_reel_metrics" as const;

export type ReelMetricsRow = {
  assembledReelId: string;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  dms: number;
  recordedAt: string;
};

export async function loadReelMetricsByAssembledReelIds(
  assembledReelIds: string[],
): Promise<Map<string, ReelMetricsRow>> {
  const result = new Map<string, ReelMetricsRow>();
  if (!isSupabaseConfigured() || assembledReelIds.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(REEL_METRICS_TABLE)
    .select(
      "assembled_reel_id, views, likes, comments, saves, dms, recorded_at",
    )
    .in("assembled_reel_id", assembledReelIds);

  if (error || !data) {
    return result;
  }

  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    if (typeof row.assembled_reel_id !== "string") {
      continue;
    }
    const counters = ["views", "likes", "comments", "saves", "dms"] as const;
    const values: Partial<Record<(typeof counters)[number], number>> = {};
    let valid = true;
    for (const key of counters) {
      if (typeof row[key] !== "number" || !Number.isInteger(row[key])) {
        valid = false;
        break;
      }
      values[key] = row[key] as number;
    }
    if (!valid || typeof row.recorded_at !== "string") {
      continue;
    }
    result.set(row.assembled_reel_id, {
      assembledReelId: row.assembled_reel_id,
      views: values.views!,
      likes: values.likes!,
      comments: values.comments!,
      saves: values.saves!,
      dms: values.dms!,
      recordedAt: row.recorded_at,
    });
  }

  return result;
}

export async function buildReelMetricsDtoForPublishedReel(params: {
  assembledReelId: string;
  reelScriptId: string;
  metricsRow: ReelMetricsRow | null;
  now?: Date;
}): Promise<ReelMetricsDto> {
  const gate = await loadPublishedSlotGateForReelScript(params.reelScriptId);
  const latestPublishedAt = gate.ok ? gate.latestPublishedAt : null;
  const editable = computeReelMetricsEditable({
    latestPublishedAt,
    now: params.now,
  });

  if (params.metricsRow) {
    return {
      views: params.metricsRow.views,
      likes: params.metricsRow.likes,
      comments: params.metricsRow.comments,
      saves: params.metricsRow.saves,
      dms: params.metricsRow.dms,
      recordedAt: new Date(params.metricsRow.recordedAt).toISOString(),
      editable,
    };
  }

  return {
    views: 0,
    likes: 0,
    comments: 0,
    saves: 0,
    dms: 0,
    recordedAt: null,
    editable,
  };
}

export function buildReelMetricsDtoFromRow(params: {
  row: ReelMetricsRow;
  editable: boolean;
}): ReelMetricsDto {
  return {
    views: params.row.views,
    likes: params.row.likes,
    comments: params.row.comments,
    saves: params.row.saves,
    dms: params.row.dms,
    recordedAt: new Date(params.row.recordedAt).toISOString(),
    editable: params.editable,
  };
}
