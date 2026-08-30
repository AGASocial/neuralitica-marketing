import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type ApproveStrategyRowResult =
  | { ok: true; version: number; approvedAt: string }
  | { ok: false };

export async function approveStrategyRow(params: {
  strategyId: string;
  clientId: string;
  approvedBy: string;
}): Promise<ApproveStrategyRowResult> {
  if (!isSupabaseConfigured()) {
    console.error("[content-strategy] approve unavailable: Supabase not configured");
    return { ok: false };
  }

  const approvedAt = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .update({
      status: "approved",
      approved_by: params.approvedBy,
      approved_at: approvedAt,
      updated_at: approvedAt,
    })
    .eq("id", params.strategyId)
    .eq("client_id", params.clientId)
    .eq("status", "draft")
    .select("version, approved_at")
    .maybeSingle();

  if (error) {
    console.error("[content-strategy] approve failed", {
      code: error.code,
      strategyId: params.strategyId,
      clientId: params.clientId,
    });
    return { ok: false };
  }

  if (!data) {
    return { ok: false };
  }

  const row = data as { version: number; approved_at: string };
  return {
    ok: true,
    version: row.version,
    approvedAt:
      typeof row.approved_at === "string" ? row.approved_at : approvedAt,
  };
}
