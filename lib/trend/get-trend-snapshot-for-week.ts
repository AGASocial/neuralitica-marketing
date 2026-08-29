import "server-only";

/**
 * Global Snapshot de tendencias projection for trusted server agents.
 *
 * Content Strategy (US-4.1), Video Script (US-5.1), and Media Assembly (US-9.x)
 * MUST import this helper only — never direct
 * neuramark_trend_snapshots SELECT from agent modules.
 *
 * No session gate — callers are trusted server jobs only.
 * Active entries only; ejemplo_referencia stripped.
 */

import {
  trendWeekStartSchema,
  type TrendSnapshotForWeekResult,
} from "@/lib/contracts/trend";
import {
  mapTrendEntryToAgentDto,
  type TrendSnapshotSelectRow,
} from "@/lib/trend/map-trend-row";
import { parseStoredEntries } from "@/lib/trend/trend-mutation-helpers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function emptySnapshot(weekStart: string): TrendSnapshotForWeekResult {
  return { weekStart, entries: [] };
}

export async function getTrendSnapshotForWeek(
  weekStart: string,
): Promise<TrendSnapshotForWeekResult> {
  const weekParsed = trendWeekStartSchema.safeParse(weekStart);
  if (!weekParsed.success) {
    return emptySnapshot(weekStart);
  }

  if (!isSupabaseConfigured()) {
    console.error("[trend] agents load unavailable: Supabase not configured");
    return emptySnapshot(weekParsed.data);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_trend_snapshots")
    .select("week_start, entries")
    .eq("week_start", weekParsed.data)
    .maybeSingle();

  if (error) {
    console.error("[trend] agents load failed", {
      code: error.code,
      weekStart: weekParsed.data,
    });
    return emptySnapshot(weekParsed.data);
  }

  if (!data) {
    return emptySnapshot(weekParsed.data);
  }

  const row = data as Pick<TrendSnapshotSelectRow, "week_start" | "entries">;
  const entries = parseStoredEntries(row.entries)
    .filter((entry) => entry.activo)
    .map((entry) => mapTrendEntryToAgentDto(entry))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    weekStart: weekParsed.data,
    entries,
  };
}
