import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  mapStrategyRow,
  type ContentStrategyRow,
} from "@/lib/content-strategy/map-strategy-row";

const STRATEGY_SELECT_COLUMNS =
  "id, client_id, week_start, version, status, brief, created_at, updated_at, approved_by, approved_at";

export async function loadLatestStrategyRowWithApproval(params: {
  clientId: string;
  weekStart: string;
}): Promise<ContentStrategyRow | null> {
  if (!isSupabaseConfigured()) {
    console.error("[content-strategy] load unavailable: Supabase not configured");
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .select(STRATEGY_SELECT_COLUMNS)
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[content-strategy] load latest failed", {
      code: error.code,
      clientId: params.clientId,
      weekStart: params.weekStart,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  return mapStrategyRow(data);
}
