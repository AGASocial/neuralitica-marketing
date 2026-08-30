import "server-only";

import type { ActualCostUnavailableReason } from "@/lib/contracts/actual-cost";
import type { ReelSpendJobKind } from "@/lib/contracts/cost-policy";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function recordReelSpendEvent(params: {
  clientId: string;
  reelScriptId: string;
  assetRole: "llm" | "tts" | "talking_head" | "broll";
  jobKind: ReelSpendJobKind;
  estimatedCostCents: number;
  actualCostCents: number | null;
  actualCostUnavailableReason?: ActualCostUnavailableReason | null;
  durationSec?: number | null;
  operatorClientId: string;
  providerKey: string;
}): Promise<{ spendEventId: string }> {
  if (!isSupabaseConfigured()) {
    console.error("[cost-policy] spend insert skipped: Supabase not configured");
    throw new Error("Supabase not configured for spend ledger insert");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_spend_events")
    .insert({
      client_id: params.clientId,
      reel_script_id: params.reelScriptId,
      asset_role: params.assetRole,
      job_kind: params.jobKind,
      estimated_cost_cents: params.estimatedCostCents,
      actual_cost_cents: params.actualCostCents,
      actual_cost_unavailable_reason:
        params.actualCostCents === null
          ? (params.actualCostUnavailableReason ?? null)
          : null,
      duration_sec: params.durationSec ?? null,
      provider_key: params.providerKey,
      operator_client_id: params.operatorClientId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[cost-policy] spend insert failed", {
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
      jobKind: params.jobKind,
      dbCode: error?.code,
    });
    throw new Error("Failed to insert reel spend event");
  }

  return { spendEventId: data.id };
}
