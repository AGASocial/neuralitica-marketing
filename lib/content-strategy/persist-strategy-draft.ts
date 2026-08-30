import "server-only";

import type { ContentStrategyBrief } from "@/lib/contracts/content-strategy";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type PersistStrategyDraftResult =
  | {
      ok: true;
      strategyId: string;
      version: number;
    }
  | { ok: false };

export async function persistStrategyDraft(params: {
  clientId: string;
  weekStart: string;
  version: number;
  brief: ContentStrategyBrief;
}): Promise<PersistStrategyDraftResult> {
  if (!isSupabaseConfigured()) {
    console.error("[content-strategy] persist unavailable: Supabase not configured");
    return { ok: false };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .insert({
      client_id: params.clientId,
      week_start: params.weekStart,
      brief: params.brief,
      status: "draft",
      version: params.version,
    })
    .select("id, version")
    .single();

  if (error || !data) {
    console.error("[content-strategy] persist failed", {
      code: error?.code,
      clientId: params.clientId,
      weekStart: params.weekStart,
      version: params.version,
    });
    return { ok: false };
  }

  const row = data as { id: string; version: number };
  return {
    ok: true,
    strategyId: row.id,
    version: row.version,
  };
}
