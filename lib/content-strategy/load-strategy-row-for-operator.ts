import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  mapStrategyRowLoad,
  type ContentStrategyRowLoad,
} from "@/lib/content-strategy/map-strategy-row";

const STRATEGY_SELECT_COLUMNS =
  "id, client_id, week_start, version, status, brief, created_at, updated_at, approved_by, approved_at";

export async function loadStrategyRowForOperator(params: {
  strategyId: string;
  clientId: string;
}): Promise<ContentStrategyRowLoad | null> {
  if (!isSupabaseConfigured()) {
    console.error("[content-strategy] load row unavailable: Supabase not configured");
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .select(STRATEGY_SELECT_COLUMNS)
    .eq("id", params.strategyId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error) {
    console.error("[content-strategy] load row failed", {
      code: error.code,
      strategyId: params.strategyId,
      clientId: params.clientId,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  return mapStrategyRowLoad(data);
}
