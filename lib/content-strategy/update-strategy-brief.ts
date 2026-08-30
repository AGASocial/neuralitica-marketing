import "server-only";

import type { ContentStrategyBrief } from "@/lib/contracts/content-strategy";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type UpdateStrategyBriefResult =
  | { ok: true; version: number; updatedAt: string }
  | { ok: false; code: "STRATEGY_NOT_DRAFT" };

export async function updateStrategyBrief(params: {
  strategyId: string;
  clientId: string;
  brief: ContentStrategyBrief;
}): Promise<UpdateStrategyBriefResult> {
  if (!isSupabaseConfigured()) {
    console.error("[content-strategy] update brief unavailable: Supabase not configured");
    return { ok: false, code: "STRATEGY_NOT_DRAFT" };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .update({
      brief: params.brief,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.strategyId)
    .eq("client_id", params.clientId)
    .eq("status", "draft")
    .select("version, updated_at")
    .maybeSingle();

  if (error) {
    console.error("[content-strategy] update brief failed", {
      code: error.code,
      strategyId: params.strategyId,
      clientId: params.clientId,
    });
    return { ok: false, code: "STRATEGY_NOT_DRAFT" };
  }

  if (!data) {
    return { ok: false, code: "STRATEGY_NOT_DRAFT" };
  }

  const row = data as { version: number; updated_at: string };
  const updatedAt =
    typeof row.updated_at === "string"
      ? row.updated_at
      : new Date().toISOString();

  return {
    ok: true,
    version: row.version,
    updatedAt,
  };
}
