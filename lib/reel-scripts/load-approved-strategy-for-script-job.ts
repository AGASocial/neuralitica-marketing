import "server-only";

import {
  contentStrategyBriefSchema,
  type ContentStrategyBrief,
} from "@/lib/contracts/content-strategy";
import { mapStrategyRow } from "@/lib/content-strategy/map-strategy-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type ApprovedStrategyForScript = {
  id: string;
  clientId: string;
  weekStart: string;
  version: number;
  status: "approved";
  brief: ContentStrategyBrief;
};

const STRATEGY_SELECT_COLUMNS =
  "id, client_id, week_start, version, status, brief, created_at, updated_at";

export async function loadApprovedStrategyForScriptJob(params: {
  strategyId: string;
  clientId: string;
}): Promise<ApprovedStrategyForScript | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .select(STRATEGY_SELECT_COLUMNS)
    .eq("id", params.strategyId)
    .eq("client_id", params.clientId)
    .eq("status", "approved")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = mapStrategyRow(data);
  if (!row || row.status !== "approved") {
    return null;
  }

  const briefParsed = contentStrategyBriefSchema.safeParse(row.brief);
  if (!briefParsed.success) {
    return null;
  }

  return {
    id: row.id,
    clientId: row.clientId,
    weekStart: row.weekStart,
    version: row.version,
    status: "approved",
    brief: briefParsed.data,
  };
}
