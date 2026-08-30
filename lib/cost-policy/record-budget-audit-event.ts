import "server-only";

import type { BudgetAuditEventType } from "@/lib/contracts/cost-policy";
import type { ProviderTier } from "@/lib/contracts/providers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type RecordBudgetAuditEventParams = {
  eventType: BudgetAuditEventType;
  clientId: string;
  operatorClientId: string;
  reelScriptId?: string | null;
  estimatedCostCents?: number | null;
  cumulativeCostCents?: number | null;
  maxCostCents?: number | null;
  providerTier?: ProviderTier | null;
  overrideReason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function recordBudgetAuditEvent(
  params: RecordBudgetAuditEventParams,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("[cost-policy] audit insert skipped: Supabase not configured");
    return;
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("neuramark_budget_audit_log").insert({
    event_type: params.eventType,
    client_id: params.clientId,
    reel_script_id: params.reelScriptId ?? null,
    operator_client_id: params.operatorClientId,
    estimated_cost_cents: params.estimatedCostCents ?? null,
    cumulative_cost_cents: params.cumulativeCostCents ?? null,
    max_cost_cents: params.maxCostCents ?? null,
    provider_tier: params.providerTier ?? null,
    override_reason: params.overrideReason ?? null,
    metadata: params.metadata ?? null,
  });

  if (error) {
    console.error("[cost-policy] audit insert failed", {
      eventType: params.eventType,
      clientId: params.clientId,
      dbCode: error.code,
    });
  }
}
