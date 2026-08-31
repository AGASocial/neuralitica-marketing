import "server-only";

import { CALENDAR_SLOTS_TABLE } from "@/lib/calendar/sync-calendar-slots-for-week";
import {
  computeReelMetricsEditable,
  isWithinReelMetricsEditWindow,
} from "@/lib/metrics/reel-metrics-edit-window";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export {
  computeReelMetricsEditable,
  isWithinReelMetricsEditWindow,
  resolveReelMetricsEditWindowDays,
} from "@/lib/metrics/reel-metrics-edit-window";

export type PublishedSlotGateResult =
  | { ok: true; latestPublishedAt: Date }
  | { ok: false; code: "NOT_PUBLISHED" };

/**
 * Published gate join: ≥1 live calendar slot with publish_status = published
 * for the reel script. Window anchor uses latest published_at DESC.
 */
export async function loadPublishedSlotGateForReelScript(
  reelScriptId: string,
): Promise<PublishedSlotGateResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, code: "NOT_PUBLISHED" };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(CALENDAR_SLOTS_TABLE)
    .select("published_at")
    .eq("reel_script_id", reelScriptId)
    .eq("publish_status", "published")
    .not("published_at", "is", null);

  if (error || !data || data.length === 0) {
    return { ok: false, code: "NOT_PUBLISHED" };
  }

  let latestPublishedAt: Date | null = null;
  for (const raw of data) {
    const publishedAtRaw = (raw as { published_at?: unknown }).published_at;
    if (typeof publishedAtRaw !== "string") {
      continue;
    }
    const parsed = new Date(publishedAtRaw);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    if (latestPublishedAt === null || parsed > latestPublishedAt) {
      latestPublishedAt = parsed;
    }
  }

  if (latestPublishedAt === null) {
    return { ok: false, code: "NOT_PUBLISHED" };
  }

  return { ok: true, latestPublishedAt };
}
