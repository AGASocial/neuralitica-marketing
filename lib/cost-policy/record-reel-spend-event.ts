import "server-only";

import type { ReelSpendJobKind } from "@/lib/contracts/cost-policy";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function recordReelSpendEvent(params: {
  clientId: string;
  reelScriptId: string;
  assetRole: "llm";
  jobKind: ReelSpendJobKind;
  estimatedCostCents: number;
  actualCostCents?: null;
  operatorClientId: string;
  providerKey: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("[cost-policy] spend insert skipped: Supabase not configured");
    return;
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("neuramark_reel_spend_events").insert({
    client_id: params.clientId,
    reel_script_id: params.reelScriptId,
    asset_role: params.assetRole,
    job_kind: params.jobKind,
    estimated_cost_cents: params.estimatedCostCents,
    actual_cost_cents: params.actualCostCents ?? null,
    provider_key: params.providerKey,
    operator_client_id: params.operatorClientId,
  });

  if (error) {
    console.error("[cost-policy] spend insert failed", {
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
      jobKind: params.jobKind,
      dbCode: error.code,
    });
  }
}
