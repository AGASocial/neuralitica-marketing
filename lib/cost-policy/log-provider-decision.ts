import "server-only";

import {
  logProviderDecisionInputSchema,
  type LogProviderDecisionInput,
} from "@/lib/contracts/provider-decisions";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function logProviderDecision(
  input: LogProviderDecisionInput,
): Promise<void> {
  const parsed = logProviderDecisionInputSchema.safeParse(input);
  if (!parsed.success) {
    console.error("[cost-policy] provider decision log validation failed");
    return;
  }

  if (!isSupabaseConfigured()) {
    console.error(
      "[cost-policy] provider decision insert skipped: Supabase not configured",
    );
    return;
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("neuramark_provider_decisions").insert({
    client_id: parsed.data.clientId,
    reel_script_id: parsed.data.reelScriptId,
    job_kind: parsed.data.jobKind,
    asset_role: parsed.data.assetRole,
    provider_tier: parsed.data.providerTier,
    provider_key: parsed.data.providerKey,
    estimated_cost_cents: parsed.data.estimatedCostCents,
    rationale_key: parsed.data.rationaleKey,
    operator_client_id: parsed.data.operatorClientId ?? null,
  });

  if (error) {
    console.error("[cost-policy] provider decision insert failed", {
      clientId: parsed.data.clientId,
      reelScriptId: parsed.data.reelScriptId,
      jobKind: parsed.data.jobKind,
      dbCode: error.code,
    });
  }
}
