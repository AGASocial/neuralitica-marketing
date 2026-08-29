import "server-only";

import { requireOperator } from "@/lib/auth/require-user";
import {
  trendWeekStartSchema,
  type TrendSnapshotForOperatorResult,
} from "@/lib/contracts/trend";
import { trendWeekNotFoundResult } from "@/lib/trend/errors";
import {
  mapTrendSnapshotOperatorView,
  type TrendSnapshotSelectRow,
} from "@/lib/trend/map-trend-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * Operator week snapshot loader (US-16.2).
 * Frontend consumer: `/operator/trends/[weekStart]` RSC.
 */
export async function loadTrendSnapshotForOperator(
  weekStart: string,
): Promise<TrendSnapshotForOperatorResult> {
  await requireOperator("page");

  const weekParsed = trendWeekStartSchema.safeParse(weekStart);
  if (!weekParsed.success) {
    return trendWeekNotFoundResult();
  }

  if (!isSupabaseConfigured()) {
    console.error("[trend] detail load unavailable: Supabase not configured");
    return trendWeekNotFoundResult();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_trend_snapshots")
    .select("week_start, entries, published_at, updated_at")
    .eq("week_start", weekParsed.data)
    .maybeSingle();

  if (error) {
    console.error("[trend] detail load failed", {
      code: error.code,
      weekStart: weekParsed.data,
    });
    return trendWeekNotFoundResult();
  }

  if (!data) {
    return trendWeekNotFoundResult();
  }

  const snapshot = mapTrendSnapshotOperatorView(data as TrendSnapshotSelectRow);
  if (!snapshot) {
    console.error("[trend] detail map failed", { weekStart: weekParsed.data });
    return trendWeekNotFoundResult();
  }

  return { ok: true, snapshot };
}
