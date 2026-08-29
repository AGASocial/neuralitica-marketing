import "server-only";

import { requireOperator } from "@/lib/auth/require-user";
import type { TrendWeekListForOperatorResult } from "@/lib/contracts/trend";
import {
  mapTrendWeekListItem,
  type TrendSnapshotSelectRow,
} from "@/lib/trend/map-trend-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * Operator Trend week list loader (US-16.2).
 * Frontend consumer: `/operator/trends` RSC.
 */
export async function loadTrendWeekListForOperator(): Promise<TrendWeekListForOperatorResult> {
  await requireOperator("page");

  if (!isSupabaseConfigured()) {
    console.error("[trend] list load unavailable: Supabase not configured");
    return { ok: false, loadFailed: true };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_trend_snapshots")
    .select("week_start, entries, published_at, updated_at")
    .order("week_start", { ascending: false });

  if (error) {
    console.error("[trend] list load failed", { code: error.code });
    return { ok: false, loadFailed: true };
  }

  const weeks = [];
  for (const row of (data ?? []) as TrendSnapshotSelectRow[]) {
    const item = mapTrendWeekListItem(row);
    if (item) {
      weeks.push(item);
    } else {
      console.error("[trend] list row skipped", { weekStart: row.week_start });
    }
  }

  return { ok: true, weeks };
}
