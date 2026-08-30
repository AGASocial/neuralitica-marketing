import "server-only";

import type { ContentStrategyDraftView } from "@/lib/contracts/content-strategy";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { mapStrategyRow } from "@/lib/content-strategy/map-strategy-row";

const STRATEGY_SELECT_COLUMNS =
  "id, client_id, week_start, version, status, brief, created_at, updated_at, approved_by, approved_at";

function toDraftView(
  row: ReturnType<typeof mapStrategyRow>,
): ContentStrategyDraftView | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    clientId: row.clientId,
    weekStart: row.weekStart,
    version: row.version,
    status: row.status,
    brief: row.brief,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getApprovedStrategyForWeek(params: {
  clientId: string;
  weekStart: string;
}): Promise<ContentStrategyDraftView | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .select(STRATEGY_SELECT_COLUMNS)
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toDraftView(mapStrategyRow(data));
}
